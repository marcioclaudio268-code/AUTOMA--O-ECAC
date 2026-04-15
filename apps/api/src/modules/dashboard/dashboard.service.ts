import { Injectable } from '@nestjs/common';
import {
  StatusAcessoEmpresa,
  StatusProcuracaoEmpresa
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

export type DashboardResponsavelSummary = {
  responsavelInternoId: string | null;
  responsavelNome: string;
  totalEmpresas: number;
};

export type DashboardSummaryResponse = {
  totalEmpresasNaCarteira: number;
  totalEmpresasComPendenciaOperacional: number;
  totalEmpresasComAcessoPendenteOuBloqueado: number;
  totalEmpresasComProcuracaoPendente: number;
  distribuicaoPorResponsavel: DashboardResponsavelSummary[];
};

type DashboardCarteiraEmpresa = {
  pendenciaOperacional: boolean;
  responsavelInterno: {
    nome: string;
  } | null;
  responsavelInternoId: string | null;
  statusAcesso: StatusAcessoEmpresa;
  statusProcuracao: StatusProcuracaoEmpresa;
};

const STATUS_ACESSO_NAO_REGULAR = new Set<StatusAcessoEmpresa>([
  StatusAcessoEmpresa.BLOQUEADO,
  StatusAcessoEmpresa.INDISPONIVEL,
  StatusAcessoEmpresa.NAO_VERIFICADO
]);

const STATUS_PROCURACAO_NAO_REGULAR = new Set<StatusProcuracaoEmpresa>([
  StatusProcuracaoEmpresa.INVALIDA,
  StatusProcuracaoEmpresa.NAO_VERIFICADA,
  StatusProcuracaoEmpresa.PENDENTE
]);

const SEM_RESPONSAVEL_LABEL = 'Sem responsável';
const SEM_RESPONSAVEL_KEY = '__sem_responsavel__';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<DashboardSummaryResponse> {
    const empresas = await this.prisma.empresa.findMany({
      orderBy: {
        createdAt: 'asc'
      },
      select: {
        pendenciaOperacional: true,
        responsavelInterno: {
          select: {
            nome: true
          }
        },
        responsavelInternoId: true,
        statusAcesso: true,
        statusProcuracao: true
      },
      where: {
        naCarteira: true
      }
    });

    return this.buildSummary(empresas);
  }

  private buildSummary(
    empresas: DashboardCarteiraEmpresa[]
  ): DashboardSummaryResponse {
    const responsaveis = new Map<string, DashboardResponsavelSummary>();
    let totalEmpresasComPendenciaOperacional = 0;
    let totalEmpresasComAcessoPendenteOuBloqueado = 0;
    let totalEmpresasComProcuracaoPendente = 0;

    for (const empresa of empresas) {
      if (empresa.pendenciaOperacional) {
        totalEmpresasComPendenciaOperacional += 1;
      }

      if (STATUS_ACESSO_NAO_REGULAR.has(empresa.statusAcesso)) {
        totalEmpresasComAcessoPendenteOuBloqueado += 1;
      }

      if (STATUS_PROCURACAO_NAO_REGULAR.has(empresa.statusProcuracao)) {
        totalEmpresasComProcuracaoPendente += 1;
      }

      const responsavelKey = empresa.responsavelInternoId ?? SEM_RESPONSAVEL_KEY;
      const responsavelNome =
        empresa.responsavelInterno?.nome?.trim() || SEM_RESPONSAVEL_LABEL;
      const existente = responsaveis.get(responsavelKey);

      if (existente) {
        existente.totalEmpresas += 1;
        continue;
      }

      responsaveis.set(responsavelKey, {
        responsavelInternoId: empresa.responsavelInternoId ?? null,
        responsavelNome,
        totalEmpresas: 1
      });
    }

    const distribuicaoPorResponsavel = Array.from(responsaveis.values()).sort(
      (left, right) => {
        if (left.totalEmpresas !== right.totalEmpresas) {
          return right.totalEmpresas - left.totalEmpresas;
        }

        return left.responsavelNome.localeCompare(right.responsavelNome, 'pt-BR');
      }
    );

    return {
      totalEmpresasNaCarteira: empresas.length,
      totalEmpresasComAcessoPendenteOuBloqueado,
      totalEmpresasComPendenciaOperacional,
      totalEmpresasComProcuracaoPendente,
      distribuicaoPorResponsavel
    };
  }
}
