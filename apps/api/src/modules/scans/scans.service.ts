import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatusExecucaoVarredura, TipoVarredura } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import {
  buildOperationalStateSnapshot,
  buildOperationalSummary,
  deriveOperationalFindings
} from '../events/operational-signals';
import type { ManualScanExecutionResult, ScanCompany } from './scans.types';

@Injectable()
export class ScansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService
  ) {}

  async executeManual(companyId: string): Promise<ManualScanExecutionResult> {
    return this.prisma.$transaction(async (tx) => {
      const company = await this.findScanCompany(tx, companyId);

      if (!company) {
        throw new NotFoundException('Empresa nao encontrada.');
      }

      const startedAt = new Date();
      const finishedAt = new Date();
      const stateSnapshot = buildOperationalStateSnapshot(company);
      const findings = deriveOperationalFindings(company);
      const resumoResultado = buildOperationalSummary(company);

      const varredura = await tx.varredura.create({
        data: {
          empresaId: companyId,
          finalizadoEm: finishedAt,
          iniciadoEm: startedAt,
          resumoResultado,
          statusExecucao: StatusExecucaoVarredura.CONCLUIDA,
          tipoVarredura: TipoVarredura.MANUAL
        }
      });

      await tx.empresa.update({
        data: {
          ultimaVarreduraEm: finishedAt
        },
        where: {
          id: companyId
        }
      });

      await this.eventsService.recordManualScanOutcome(tx, {
        companyId,
        findings,
        resumoResultado,
        stateSnapshot,
        varreduraId: varredura.id
      });

      return {
        varredura
      };
    });
  }

  async listRecent(companyId: string, take = 5) {
    return this.prisma.varredura.findMany({
      orderBy: {
        iniciadoEm: 'desc'
      },
      take,
      where: {
        empresaId: companyId
      }
    });
  }

  private async findScanCompany(
    client: Prisma.TransactionClient,
    companyId: string
  ): Promise<ScanCompany | null> {
    return client.empresa.findUnique({
      select: {
        id: true,
        pendenciaOperacional: true,
        statusAcesso: true,
        statusProcuracao: true
      },
      where: {
        id: companyId
      }
    });
  }

}
