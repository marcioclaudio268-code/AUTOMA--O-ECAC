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

  async getCompanyOperationalHistory(
    companyId: string,
    query: ListCompanyLogsQueryDto = {}
  ): Promise<CompanyOperationalHistory> {
    const company = await this.assertCompanyExists(companyId);
    const take = query.take ?? 10;

    const [logs, pendencias] = await Promise.all([
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
            status: 'asc'
          },
          {
            abertaEm: 'desc'
          }
        ],
        take,
        where: {
          empresaId: companyId
        }
      })
    ]);

    return buildCompanyOperationalHistory(
      company.id,
      company.razaoSocial,
      logs.map(mapLogExecucaoRecord),
      pendencias.map(mapPendenciaRecord)
    );
  }

  private normalizeText(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return value ?? null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
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
}
