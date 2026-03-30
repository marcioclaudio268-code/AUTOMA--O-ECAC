import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatusIntegracao, TipoIntegracao } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { IntegraContadorAdapter } from '../adapters/integra-contador.adapter';
import {
  CompanyIntegrationExecutionAttempt,
  CompanyIntegrationExecutionContext,
  CompanyIntegrationRecord,
  companyIntegrationSelect
} from '../company-integration.shared';

type CompanyIntegrationExecutionResponse = {
  execution: CompanyIntegrationExecutionAttempt;
  integration: CompanyIntegrationRecord;
};

@Injectable()
export class CompanyIntegrationExecutionService {
  constructor(
    private readonly integraContadorAdapter: IntegraContadorAdapter,
    private readonly prisma: PrismaService
  ) {}

  async execute(
    companyId: string,
    tipoIntegracao: TipoIntegracao
  ): Promise<CompanyIntegrationExecutionResponse> {
    if (tipoIntegracao !== TipoIntegracao.INTEGRA_CONTADOR) {
      throw new BadRequestException(
        'Execucao manual disponivel apenas para INTEGRA_CONTADOR.'
      );
    }

    const company = await this.assertCompanyExists(companyId);
    const execution = await this.integraContadorAdapter.execute(company);
    const timestamp = new Date();

    const integration = await this.prisma.integracaoEmpresa.upsert({
      create: this.buildCreateData(companyId, execution, timestamp),
      select: companyIntegrationSelect,
      update: this.buildUpdateData(execution, timestamp),
      where: {
        empresaId_tipoIntegracao: {
          empresaId: companyId,
          tipoIntegracao
        }
      }
    });

    return {
      execution,
      integration
    };
  }

  private buildCreateData(
    companyId: string,
    execution: CompanyIntegrationExecutionAttempt,
    timestamp: Date
  ): Prisma.IntegracaoEmpresaCreateInput {
    return {
      empresa: {
        connect: {
          id: companyId
        }
      },
      mensagemErroAtual: execution.success ? null : execution.message,
      observacoes: execution.observacoes ?? null,
      statusIntegracao: execution.success
        ? StatusIntegracao.ATIVA
        : StatusIntegracao.ERRO,
      tipoIntegracao: TipoIntegracao.INTEGRA_CONTADOR,
      ...(execution.success
        ? {
            ultimoSucessoEm: timestamp
          }
        : {
            ultimoErroEm: timestamp
          })
    };
  }

  private buildUpdateData(
    execution: CompanyIntegrationExecutionAttempt,
    timestamp: Date
  ): Prisma.IntegracaoEmpresaUpdateInput {
    const data: Prisma.IntegracaoEmpresaUpdateInput = {
      statusIntegracao: execution.success
        ? StatusIntegracao.ATIVA
        : StatusIntegracao.ERRO
    };

    if (execution.success) {
      data.ultimoSucessoEm = timestamp;
      data.mensagemErroAtual = null;
    } else {
      data.ultimoErroEm = timestamp;
      data.mensagemErroAtual = execution.message;
    }

    if (execution.observacoes !== undefined) {
      data.observacoes = execution.observacoes ?? null;
    }

    return data;
  }

  private async assertCompanyExists(
    companyId: string
  ): Promise<CompanyIntegrationExecutionContext> {
    const company = await this.prisma.empresa.findUnique({
      select: {
        cnpj: true,
        id: true,
        nomeFantasia: true,
        razaoSocial: true
      },
      where: {
        id: companyId
      }
    });

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    return {
      cnpj: company.cnpj,
      companyId: company.id,
      nomeFantasia: company.nomeFantasia ?? null,
      razaoSocial: company.razaoSocial
    };
  }
}
