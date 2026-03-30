import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  StatusIntegracao,
  StatusProcuracaoEmpresa,
  TipoIntegracao
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { IntegraContadorAdapter } from '../adapters/integra-contador.adapter';
import {
  CompanyIntegrationExecutionAttempt,
  CompanyIntegrationExecutionContext,
  CompanyIntegrationExecutionInput,
  CompanyIntegrationRecord,
  companyIntegrationSelect
} from '../company-integration.shared';

type CompanyIntegrationExecutionResponse = {
  company: CompanyOperationalUpdate | null;
  execution: CompanyIntegrationExecutionAttempt;
  integration: CompanyIntegrationRecord;
};

type CompanyOperationalUpdate = {
  observacoesOperacionais: string | null;
  statusProcuracao: StatusProcuracaoEmpresa;
  ultimaConferenciaOperacionalEm: Date | null;
  updatedAt: Date;
};

const PROCURACAO_CONFIRMACAO_OBSERVACAO =
  'Confirmacao via Integra Contador no fluxo PROCURACOES / OBTERPROCURACAO41.';

@Injectable()
export class CompanyIntegrationExecutionService {
  constructor(
    private readonly integraContadorAdapter: IntegraContadorAdapter,
    private readonly prisma: PrismaService
  ) {}

  async execute(
    companyId: string,
    tipoIntegracao: TipoIntegracao,
    input: CompanyIntegrationExecutionInput
  ): Promise<CompanyIntegrationExecutionResponse> {
    if (tipoIntegracao !== TipoIntegracao.INTEGRA_CONTADOR) {
      throw new BadRequestException(
        'Execucao manual disponivel apenas para INTEGRA_CONTADOR.'
      );
    }

    const company = await this.assertCompanyExists(companyId);
    const execution = await this.executeIntegration(company, input);
    const timestamp = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const integration = await tx.integracaoEmpresa.upsert({
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

      const companyUpdate = await this.updateCompanyAfterExecution(
        tx,
        company,
        execution,
        timestamp
      );

      return {
        company: companyUpdate,
        integration
      };
    });

    return {
      execution,
      company: result.company,
      integration: result.integration
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
        observacoesOperacionais: true,
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
      observacoesOperacionais: company.observacoesOperacionais ?? null,
      razaoSocial: company.razaoSocial
    };
  }

  private async executeIntegration(
    company: CompanyIntegrationExecutionContext,
    input: CompanyIntegrationExecutionInput
  ): Promise<CompanyIntegrationExecutionAttempt> {
    try {
      return await this.integraContadorAdapter.execute(company, input);
    } catch (error) {
      return {
        haProcuracaoEncontrada: false,
        message:
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Falha inesperada ao executar INTEGRA_CONTADOR.',
        quantidadeRegistrosRetornados: 0,
        success: false
      };
    }
  }

  private async updateCompanyAfterExecution(
    tx: Prisma.TransactionClient,
    company: CompanyIntegrationExecutionContext,
    execution: CompanyIntegrationExecutionAttempt,
    timestamp: Date
  ): Promise<CompanyOperationalUpdate | null> {
    if (!execution.success || !execution.haProcuracaoEncontrada) {
      return null;
    }

    const observacoesOperacionais = buildOperationalObservation(
      company.observacoesOperacionais
    );

    const updatedCompany = await tx.empresa.update({
      data: {
        observacoesOperacionais,
        statusProcuracao: StatusProcuracaoEmpresa.VALIDA,
        ultimaConferenciaOperacionalEm: timestamp
      },
      select: {
        observacoesOperacionais: true,
        statusProcuracao: true,
        ultimaConferenciaOperacionalEm: true,
        updatedAt: true
      },
      where: {
        id: company.companyId
      }
    });

    return {
      observacoesOperacionais: updatedCompany.observacoesOperacionais,
      statusProcuracao: updatedCompany.statusProcuracao,
      ultimaConferenciaOperacionalEm:
        updatedCompany.ultimaConferenciaOperacionalEm,
      updatedAt: updatedCompany.updatedAt
    };
  }
}

function buildOperationalObservation(
  currentObservation: string | null
): string {
  const normalizedCurrent = currentObservation?.trim();

  if (!normalizedCurrent) {
    return PROCURACAO_CONFIRMACAO_OBSERVACAO;
  }

  if (normalizedCurrent.includes(PROCURACAO_CONFIRMACAO_OBSERVACAO)) {
    return normalizedCurrent;
  }

  return `${normalizedCurrent}\n${PROCURACAO_CONFIRMACAO_OBSERVACAO}`;
}
