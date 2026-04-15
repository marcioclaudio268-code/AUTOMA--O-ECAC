import { Injectable } from '@nestjs/common';
import {
  StatusAcessoriasSyncJob,
  TipoAcessoriasSyncJob,
  type AcessoriasSyncJob as AcessoriasSyncJobRecord
} from '@prisma/client';

import { PrismaService } from '../../../../prisma/prisma.service';

import type { AcessoriasJobView } from '../acessorias.types';

const DEFAULT_TAKE = 10;
const MAX_TAKE = 50;

@Injectable()
export class AcessoriasJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTestConnectionJob(): Promise<AcessoriasJobView> {
    const record = await this.prisma.acessoriasSyncJob.create({
      data: {
        iniciadoEm: new Date(),
        status: StatusAcessoriasSyncJob.INICIADO,
        tipoJob: TipoAcessoriasSyncJob.TESTE_CONEXAO
      }
    });

    return this.mapRecord(record);
  }

  async markSuccess(id: string): Promise<AcessoriasJobView> {
    const record = await this.prisma.acessoriasSyncJob.update({
      data: {
        detalhesErro: null,
        finalizadoEm: new Date(),
        falhas: 0,
        status: StatusAcessoriasSyncJob.SUCESSO
      },
      where: {
        id
      }
    });

    return this.mapRecord(record);
  }

  async markFailure(
    id: string,
    errorMessage: string
  ): Promise<AcessoriasJobView> {
    const record = await this.prisma.acessoriasSyncJob.update({
      data: {
        detalhesErro: this.normalizeMessage(errorMessage),
        finalizadoEm: new Date(),
        falhas: 1,
        status: StatusAcessoriasSyncJob.FALHA
      },
      where: {
        id
      }
    });

    return this.mapRecord(record);
  }

  async listRecent(take?: number): Promise<AcessoriasJobView[]> {
    const safeTake = this.normalizeTake(take);
    const records = await this.prisma.acessoriasSyncJob.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: safeTake
    });

    return records.map((record) => this.mapRecord(record));
  }

  private mapRecord(record: AcessoriasSyncJobRecord): AcessoriasJobView {
    return {
      atualizados: record.atualizados,
      createdAt: record.createdAt.toISOString(),
      criados: record.criados,
      detalhesErro: record.detalhesErro,
      finalizadoEm: record.finalizadoEm?.toISOString() ?? null,
      falhas: record.falhas,
      id: record.id,
      iniciadoEm: record.iniciadoEm.toISOString(),
      ignorados: record.ignorados,
      processados: record.processados,
      status: record.status,
      tipoJob: record.tipoJob
    };
  }

  private normalizeMessage(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeTake(value: number | undefined): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return DEFAULT_TAKE;
    }

    const safeInteger = Math.trunc(value);
    return Math.max(1, Math.min(MAX_TAKE, safeInteger));
  }
}
