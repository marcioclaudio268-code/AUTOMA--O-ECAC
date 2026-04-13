import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import {
  buildCompanyOperationalHistory,
  logInclude,
  pendenciaInclude,
  mapLogExecucaoRecord,
  mapPendenciaRecord
} from '../pendencias/pendencias.mappers';
import {
  type CompanyOperationalSnapshot,
  type CompanyOperationalHistory,
  type LogExecucaoRecord,
  type ResultadoLogExecucao,
  type TipoLogExecucao
} from '../pendencias/pendencias.types';
import { ListCompanyLogsQueryDto } from './dto/list-company-logs-query.dto';

type LogWriteClient = Prisma.TransactionClient | PrismaClient;

type RecordExecutionInput = {
  chaveIdempotencia?: string | null | undefined;
  detalhes?: string | null | undefined;
  empresaId: string;
  executadoEm?: Date | undefined;
  executadoPorUsuarioInternoId?: string | null | undefined;
  pendenciaId?: string | null | undefined;
  resultado: ResultadoLogExecucao;
  resumo: string;
  tipo: TipoLogExecucao;
};

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  async recordExecution(
    client: LogWriteClient,
    input: RecordExecutionInput
  ): Promise<LogExecucaoRecord> {
    const created = await client.logExecucao.create({
      data: {
        chaveIdempotencia: this.normalizeText(input.chaveIdempotencia),
        detalhes: this.normalizeText(input.detalhes),
        empresaId: input.empresaId,
        executadoEm: input.executadoEm ?? new Date(),
        executadoPorUsuarioInternoId:
          this.normalizeText(input.executadoPorUsuarioInternoId),
        pendenciaId: this.normalizeText(input.pendenciaId),
        resultado: input.resultado,
        resumo: input.resumo.trim(),
        tipo: input.tipo
      },
      include: logInclude
    });

    return mapLogExecucaoRecord(created);
  }

  async listCompanyLogs(
    companyId: string,
    query: ListCompanyLogsQueryDto = {}
  ): Promise<LogExecucaoRecord[]> {
    await this.assertCompanyExists(companyId);

    const logs = await this.prisma.logExecucao.findMany({
      include: logInclude,
      orderBy: {
        executadoEm: 'desc'
      },
      take: query.take ?? 10,
      where: {
        empresaId: companyId
      }
    });

    return logs.map(mapLogExecucaoRecord);
  }

  async listPendenciaLogs(
    pendenciaId: string,
    query: ListCompanyLogsQueryDto = {}
  ): Promise<LogExecucaoRecord[]> {
    await this.assertPendenciaExists(pendenciaId);

    const logs = await this.prisma.logExecucao.findMany({
      include: logInclude,
      orderBy: {
        executadoEm: 'desc'
      },
      take: query.take ?? 20,
      where: {
        pendenciaId
      }
    });

    return logs.map(mapLogExecucaoRecord);
  }

  async getCompanyOperationalHistory(
    companyId: string,
    query: ListCompanyLogsQueryDto = {}
  ): Promise<CompanyOperationalHistory> {
    const take = query.take ?? 10;

    const [company, logs, pendenciasAbertas, pendenciasEncerradasRecentes] =
      await Promise.all([
        this.loadCompanyOperationalSnapshot(companyId),
        this.prisma.logExecucao.findMany({
          include: logInclude,
          orderBy: {
            executadoEm: 'desc'
          },
          take,
          where: {
            empresaId: companyId
          }
        }),
        this.prisma.pendencia.findMany({
          include: pendenciaInclude,
          orderBy: [
            {
              abertaEm: 'desc'
            }
          ],
          take,
          where: {
            empresaId: companyId,
            status: 'ABERTA'
          }
        }),
        this.prisma.pendencia.findMany({
          include: pendenciaInclude,
          orderBy: [
            {
              fechadaEm: 'desc'
            },
            {
              updatedAt: 'desc'
            }
          ],
          take,
          where: {
            empresaId: companyId,
            status: 'RESOLVIDA'
          }
        })
      ]);

    return buildCompanyOperationalHistory(
      company,
      logs.map(mapLogExecucaoRecord),
      pendenciasAbertas.map(mapPendenciaRecord),
      pendenciasEncerradasRecentes.map(mapPendenciaRecord)
    );
  }

  private normalizeText(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return value ?? null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private async loadCompanyOperationalSnapshot(
    id: string
  ): Promise<CompanyOperationalSnapshot> {
    const company = await this.prisma.empresa.findUnique({
      select: {
        cnpj: true,
        id: true,
        naCarteira: true,
        nomeFantasia: true,
        observacoesOperacionais: true,
        pendenciaOperacional: true,
        razaoSocial: true,
        regularizadaEm: true,
        responsavelInterno: {
          select: {
            id: true,
            nome: true
          }
        },
        responsavelInternoId: true,
        statusAcesso: true,
        statusProcuracao: true,
        ultimaConferenciaAcessoEm: true,
        ultimaConferenciaOperacionalEm: true,
        ultimaConferenciaProcuracaoEm: true,
        ultimaVarreduraEm: true,
        ultimoEventoRelevanteEm: true,
        updatedAt: true
      },
      where: {
        id
      }
    });

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    return {
      cnpj: company.cnpj,
      empresaId: company.id,
      empresaNome: company.razaoSocial,
      naCarteira: company.naCarteira,
      nomeFantasia: company.nomeFantasia,
      observacoesOperacionais: company.observacoesOperacionais,
      pendenciaOperacional: company.pendenciaOperacional,
      regularizadaEm: company.regularizadaEm?.toISOString() ?? null,
      responsavelInternoId: company.responsavelInternoId,
      responsavelInternoNome: company.responsavelInterno?.nome?.trim() ?? null,
      statusAcesso: company.statusAcesso,
      statusProcuracao: company.statusProcuracao,
      ultimaConferenciaAcessoEm:
        company.ultimaConferenciaAcessoEm?.toISOString() ?? null,
      ultimaConferenciaOperacionalEm:
        company.ultimaConferenciaOperacionalEm?.toISOString() ?? null,
      ultimaConferenciaProcuracaoEm:
        company.ultimaConferenciaProcuracaoEm?.toISOString() ?? null,
      ultimaVarreduraEm: company.ultimaVarreduraEm?.toISOString() ?? null,
      ultimoEventoRelevanteEm:
        company.ultimoEventoRelevanteEm?.toISOString() ?? null,
      updatedAt: company.updatedAt.toISOString()
    };
  }

  private async assertCompanyExists(
    id: string
  ): Promise<{ id: string; razaoSocial: string }> {
    const company = await this.prisma.empresa.findUnique({
      select: {
        id: true,
        razaoSocial: true
      },
      where: {
        id
      }
    });

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    return company;
  }

  private async assertPendenciaExists(
    id: string
  ): Promise<{ id: string; empresaId: string }> {
    const pendencia = await this.prisma.pendencia.findUnique({
      select: {
        empresaId: true,
        id: true
      },
      where: {
        id
      }
    });

    if (!pendencia) {
      throw new NotFoundException('Pendencia nao encontrada.');
    }

    return pendencia;
  }
}
