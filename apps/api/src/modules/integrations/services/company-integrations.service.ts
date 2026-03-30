import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  Prisma,
  StatusIntegracao,
  TipoIntegracao
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { SaveCompanyIntegrationDto } from '../dto/save-company-integration.dto';

const companyIntegrationSelect = {
  createdAt: true,
  empresaId: true,
  id: true,
  mensagemErroAtual: true,
  observacoes: true,
  statusIntegracao: true,
  tipoIntegracao: true,
  updatedAt: true,
  ultimoErroEm: true,
  ultimoSucessoEm: true
} as const;

type CompanyIntegrationRecord = Prisma.IntegracaoEmpresaGetPayload<{
  select: typeof companyIntegrationSelect;
}>;

type CompanyIntegrationUniqueWhere = {
  empresaId_tipoIntegracao: {
    empresaId: string;
    tipoIntegracao: TipoIntegracao;
  };
};

@Injectable()
export class CompanyIntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string): Promise<CompanyIntegrationRecord[]> {
    await this.assertCompanyExists(companyId);

    return this.prisma.integracaoEmpresa.findMany({
      orderBy: [
        {
          tipoIntegracao: 'asc'
        },
        {
          createdAt: 'desc'
        }
      ],
      select: companyIntegrationSelect,
      where: {
        empresaId: companyId
      }
    });
  }

  async findOne(
    companyId: string,
    tipoIntegracao: TipoIntegracao
  ): Promise<CompanyIntegrationRecord> {
    await this.assertCompanyExists(companyId);

    const integration = await this.prisma.integracaoEmpresa.findUnique({
      select: companyIntegrationSelect,
      where: this.buildUniqueWhere(companyId, tipoIntegracao)
    });

    if (!integration) {
      throw new NotFoundException('Integracao da empresa nao encontrada.');
    }

    return integration;
  }

  async save(
    companyId: string,
    tipoIntegracao: TipoIntegracao,
    dto: SaveCompanyIntegrationDto
  ): Promise<CompanyIntegrationRecord> {
    await this.assertCompanyExists(companyId);

    const existingIntegration = await this.prisma.integracaoEmpresa.findUnique({
      select: {
        id: true
      },
      where: this.buildUniqueWhere(companyId, tipoIntegracao)
    });

    if (existingIntegration) {
      const data: Prisma.IntegracaoEmpresaUpdateInput = {};

      if (dto.statusIntegracao !== undefined) {
        data.statusIntegracao = dto.statusIntegracao;
      }

      if (dto.ultimoSucessoEm !== undefined) {
        const ultimoSucessoEm = this.normalizeDate(dto.ultimoSucessoEm);

        if (ultimoSucessoEm !== undefined) {
          data.ultimoSucessoEm = ultimoSucessoEm;
        }
      }

      if (dto.ultimoErroEm !== undefined) {
        const ultimoErroEm = this.normalizeDate(dto.ultimoErroEm);

        if (ultimoErroEm !== undefined) {
          data.ultimoErroEm = ultimoErroEm;
        }
      }

      if (dto.mensagemErroAtual !== undefined) {
        const mensagemErroAtual = this.normalizeText(dto.mensagemErroAtual);

        if (mensagemErroAtual !== undefined) {
          data.mensagemErroAtual = mensagemErroAtual;
        }
      }

      if (dto.observacoes !== undefined) {
        const observacoes = this.normalizeText(dto.observacoes);

        if (observacoes !== undefined) {
          data.observacoes = observacoes;
        }
      }

      if (Object.keys(data).length === 0) {
        throw new BadRequestException('Informe ao menos um campo para atualizar.');
      }

      return this.prisma.integracaoEmpresa.update({
        data,
        select: companyIntegrationSelect,
        where: {
          id: existingIntegration.id
        }
      });
    }

    return this.prisma.integracaoEmpresa.create({
      data: {
        empresa: {
          connect: {
            id: companyId
          }
        },
        mensagemErroAtual: this.normalizeText(dto.mensagemErroAtual) ?? null,
        observacoes: this.normalizeText(dto.observacoes) ?? null,
        statusIntegracao:
          dto.statusIntegracao ?? StatusIntegracao.NAO_CONFIGURADA,
        tipoIntegracao,
        ultimoErroEm: this.normalizeDate(dto.ultimoErroEm) ?? null,
        ultimoSucessoEm: this.normalizeDate(dto.ultimoSucessoEm) ?? null
      },
      select: companyIntegrationSelect
    });
  }

  private buildUniqueWhere(
    companyId: string,
    tipoIntegracao: TipoIntegracao
  ): CompanyIntegrationUniqueWhere {
    return {
      empresaId_tipoIntegracao: {
        empresaId: companyId,
        tipoIntegracao
      }
    };
  }

  private normalizeDate(
    value: string | null | undefined
  ): Date | null | undefined {
    if (value === undefined || value === null) {
      return value;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Data invalida.');
    }

    return date;
  }

  private normalizeText(
    value: string | null | undefined
  ): string | null | undefined {
    if (value === undefined || value === null) {
      return value;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private async assertCompanyExists(companyId: string): Promise<void> {
    const company = await this.prisma.empresa.findUnique({
      select: {
        id: true
      },
      where: {
        id: companyId
      }
    });

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }
  }
}
