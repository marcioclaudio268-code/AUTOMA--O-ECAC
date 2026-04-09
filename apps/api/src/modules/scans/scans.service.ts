import { Injectable, NotFoundException } from '@nestjs/common';
import {
  StatusAcessoEmpresa,
  StatusExecucaoVarredura,
  StatusProcuracaoEmpresa,
  TipoVarredura
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import type { ManualScanExecutionResult, ScanCompany } from './scans.types';

const ACCESS_NAO_REGULAR = new Set<StatusAcessoEmpresa>([
  StatusAcessoEmpresa.BLOQUEADO,
  StatusAcessoEmpresa.INDISPONIVEL,
  StatusAcessoEmpresa.NAO_VERIFICADO
]);

@Injectable()
export class ScansService {
  constructor(private readonly prisma: PrismaService) {}

  async executeManual(companyId: string): Promise<ManualScanExecutionResult> {
    const company = await this.findScanCompany(companyId);

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    const startedAt = new Date();
    const finishedAt = new Date();
    const resumoResultado = this.buildResumoResultado(company);

    const varredura = await this.prisma.varredura.create({
      data: {
        empresaId: companyId,
        finalizadoEm: finishedAt,
        iniciadoEm: startedAt,
        resumoResultado,
        statusExecucao: StatusExecucaoVarredura.CONCLUIDA,
        tipoVarredura: TipoVarredura.MANUAL
      }
    });

    await this.prisma.empresa.update({
      data: {
        ultimaVarreduraEm: finishedAt
      },
      where: {
        id: companyId
      }
    });

    return {
      varredura
    };
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

  private async findScanCompany(companyId: string): Promise<ScanCompany | null> {
    return this.prisma.empresa.findUnique({
      select: {
        id: true,
        observacoesOperacionais: true,
        pendenciaOperacional: true,
        statusAcesso: true,
        statusProcuracao: true
      },
      where: {
        id: companyId
      }
    });
  }

  private buildResumoResultado(company: ScanCompany): string {
    const insights: string[] = [];

    if (ACCESS_NAO_REGULAR.has(company.statusAcesso)) {
      insights.push('Acesso irregular');
    }

    if (company.statusProcuracao !== StatusProcuracaoEmpresa.VALIDA) {
      insights.push('Procuracao irregular');
    }

    if (company.pendenciaOperacional) {
      insights.push('Pendencia operacional manual');
    }

    if (insights.length === 0) {
      return 'Nenhuma irregularidade encontrada.';
    }

    return insights.join(' | ');
  }
}
