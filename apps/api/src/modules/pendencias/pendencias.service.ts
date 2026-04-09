import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  StatusPendenciaOperacional,
  StatusAcessoEmpresa,
  StatusProcuracaoEmpresa,
  TipoPendenciaOperacional
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { ListPendenciasQueryDto } from './dto/list-pendencias-query.dto';
import {
  PendenciaItem,
  PendenciaOperacionalRecord,
  SEM_RESPONSAVEL_LABEL,
  TipoPendencia,
  TipoPendenciaEnum
} from './pendencias.types';

const MANUAL_SCAN_ORIGIN = 'VARREDURA_MANUAL';

const MANUAL_SCAN_FOLLOW_UPS = [
  {
    descricao: 'Acesso irregular identificado na varredura manual.',
    finding: 'Acesso irregular',
    tipo: TipoPendenciaOperacional.ACESSO
  },
  {
    descricao: 'Procuracao irregular identificada na varredura manual.',
    finding: 'Procuracao irregular',
    tipo: TipoPendenciaOperacional.PROCURACAO
  },
  {
    descricao: 'Pendencia operacional manual identificada na varredura manual.',
    finding: 'Pendencia operacional manual',
    tipo: TipoPendenciaOperacional.OPERACIONAL
  }
] as const;

type PendenciaEmpresa = {
  cnpj: string;
  id: string;
  nomeFantasia: string | null;
  observacoesOperacionais: string | null;
  pendenciaOperacional: boolean;
  razaoSocial: string;
  responsavelInterno: {
    nome: string;
  } | null;
  responsavelInternoId: string | null;
  statusAcesso: StatusAcessoEmpresa;
  statusProcuracao: StatusProcuracaoEmpresa;
  ultimaConferenciaOperacionalEm: Date | null;
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

const TIPO_PENDENCIA_ORDEM: Record<TipoPendencia, number> = {
  [TipoPendenciaEnum.ACESSO]: 0,
  [TipoPendenciaEnum.PROCURACAO]: 1,
  [TipoPendenciaEnum.OPERACIONAL]: 2
};

const STATUS_ACESSO_MOTIVO: Record<StatusAcessoEmpresa, string> = {
  [StatusAcessoEmpresa.BLOQUEADO]: 'Status de acesso bloqueado.',
  [StatusAcessoEmpresa.DISPONIVEL]: 'Status de acesso disponivel.',
  [StatusAcessoEmpresa.INDISPONIVEL]: 'Status de acesso indisponivel.',
  [StatusAcessoEmpresa.NAO_VERIFICADO]: 'Status de acesso nao verificado.'
};

const STATUS_PROCURACAO_MOTIVO: Record<StatusProcuracaoEmpresa, string> = {
  [StatusProcuracaoEmpresa.INVALIDA]: 'Status de procuracao invalido.',
  [StatusProcuracaoEmpresa.NAO_VERIFICADA]:
    'Status de procuracao nao verificado.',
  [StatusProcuracaoEmpresa.PENDENTE]: 'Status de procuracao pendente.',
  [StatusProcuracaoEmpresa.VALIDA]: 'Status de procuracao valida.'
};

@Injectable()
export class PendenciasService {
  constructor(private readonly prisma: PrismaService) {}

  async recordManualScanPendencias(
    client: Prisma.TransactionClient,
    input: {
      companyId: string;
      findings: string[];
    }
  ): Promise<PendenciaOperacionalRecord[]> {
    const createdPendencias: PendenciaOperacionalRecord[] = [];
    const relevantFollowUps = MANUAL_SCAN_FOLLOW_UPS.filter((followUp) =>
      input.findings.includes(followUp.finding)
    );
    const hasOperationalFollowUp = relevantFollowUps.some(
      (followUp) => followUp.tipo === TipoPendenciaOperacional.OPERACIONAL
    );

    for (const followUp of relevantFollowUps) {
      const openPending = await client.pendenciaOperacional.findFirst({
        select: {
          id: true
        },
        where: {
          empresaId: input.companyId,
          status: StatusPendenciaOperacional.ABERTA,
          tipo: followUp.tipo
        }
      });

      if (openPending) {
        continue;
      }

      const createdPendencia = await client.pendenciaOperacional.create({
        data: {
          descricao: followUp.descricao,
          empresaId: input.companyId,
          origem: MANUAL_SCAN_ORIGIN,
          tipo: followUp.tipo
        }
      });

      createdPendencias.push(createdPendencia);
    }

    if (hasOperationalFollowUp) {
      await client.empresa.update({
        data: {
          pendenciaOperacional: true,
          regularizadaEm: null
        },
        where: {
          id: input.companyId
        }
      });
    }

    return createdPendencias;
  }

  async list(query: ListPendenciasQueryDto = {}): Promise<PendenciaItem[]> {
    const empresas = await this.prisma.empresa.findMany({
      orderBy: [
        {
          razaoSocial: 'asc'
        },
        {
          cnpj: 'asc'
        }
      ],
      select: {
        cnpj: true,
        id: true,
        naCarteira: true,
        nomeFantasia: true,
        observacoesOperacionais: true,
        pendenciaOperacional: true,
        razaoSocial: true,
        responsavelInterno: {
          select: {
            nome: true
          }
        },
        responsavelInternoId: true,
        statusAcesso: true,
        statusProcuracao: true,
        ultimaConferenciaOperacionalEm: true
      },
      where: this.buildWhere(query)
    });

    const pendencias: PendenciaItem[] = [];

    for (const empresa of empresas) {
      if (
        query.tipoPendencia === undefined ||
        query.tipoPendencia === TipoPendenciaEnum.ACESSO
      ) {
        this.pushAcessoPendencia(empresa, pendencias);
      }

      if (
        query.tipoPendencia === undefined ||
        query.tipoPendencia === TipoPendenciaEnum.PROCURACAO
      ) {
        this.pushProcuracaoPendencia(empresa, pendencias);
      }

      if (
        query.tipoPendencia === undefined ||
        query.tipoPendencia === TipoPendenciaEnum.OPERACIONAL
      ) {
        this.pushOperacionalPendencia(empresa, pendencias);
      }
    }

    return pendencias.sort((left, right) => {
      if (left.empresaNome !== right.empresaNome) {
        return left.empresaNome.localeCompare(right.empresaNome, 'pt-BR');
      }

      return (
        TIPO_PENDENCIA_ORDEM[left.tipoPendencia] -
        TIPO_PENDENCIA_ORDEM[right.tipoPendencia]
      );
    });
  }

  private buildWhere(query: ListPendenciasQueryDto): Prisma.EmpresaWhereInput {
    const where: Prisma.EmpresaWhereInput = {
      naCarteira: true
    };

    if (query.empresaId) {
      where.id = query.empresaId;
    }

    if (query.responsavelInternoId) {
      where.responsavelInternoId = query.responsavelInternoId;
    }

    return where;
  }

  private pushAcessoPendencia(
    empresa: PendenciaEmpresa,
    pendencias: PendenciaItem[]
  ) {
    if (!STATUS_ACESSO_NAO_REGULAR.has(empresa.statusAcesso)) {
      return;
    }

    pendencias.push({
      empresaCnpj: empresa.cnpj,
      empresaId: empresa.id,
      empresaNome: empresa.razaoSocial,
      empresaNomeFantasia: empresa.nomeFantasia,
      linkTratamento: `/empresas/${empresa.id}`,
      motivo: STATUS_ACESSO_MOTIVO[empresa.statusAcesso],
      observacaoOperacional: empresa.observacoesOperacionais,
      responsavelInternoId: empresa.responsavelInternoId,
      responsavelInternoNome:
        empresa.responsavelInterno?.nome?.trim() || SEM_RESPONSAVEL_LABEL,
      statusAtual: empresa.statusAcesso,
      tipoPendencia: TipoPendenciaEnum.ACESSO,
      ultimaConferenciaOperacionalEm: empresa.ultimaConferenciaOperacionalEm
    });
  }

  private pushProcuracaoPendencia(
    empresa: PendenciaEmpresa,
    pendencias: PendenciaItem[]
  ) {
    if (!STATUS_PROCURACAO_NAO_REGULAR.has(empresa.statusProcuracao)) {
      return;
    }

    pendencias.push({
      empresaCnpj: empresa.cnpj,
      empresaId: empresa.id,
      empresaNome: empresa.razaoSocial,
      empresaNomeFantasia: empresa.nomeFantasia,
      linkTratamento: `/empresas/${empresa.id}`,
      motivo: STATUS_PROCURACAO_MOTIVO[empresa.statusProcuracao],
      observacaoOperacional: empresa.observacoesOperacionais,
      responsavelInternoId: empresa.responsavelInternoId,
      responsavelInternoNome:
        empresa.responsavelInterno?.nome?.trim() || SEM_RESPONSAVEL_LABEL,
      statusAtual: empresa.statusProcuracao,
      tipoPendencia: TipoPendenciaEnum.PROCURACAO,
      ultimaConferenciaOperacionalEm: empresa.ultimaConferenciaOperacionalEm
    });
  }

  private pushOperacionalPendencia(
    empresa: PendenciaEmpresa,
    pendencias: PendenciaItem[]
  ) {
    if (!empresa.pendenciaOperacional) {
      return;
    }

    pendencias.push({
      empresaCnpj: empresa.cnpj,
      empresaId: empresa.id,
      empresaNome: empresa.razaoSocial,
      empresaNomeFantasia: empresa.nomeFantasia,
      linkTratamento: `/empresas/${empresa.id}`,
      motivo: 'Pendencia operacional manual registrada.',
      observacaoOperacional: empresa.observacoesOperacionais,
      responsavelInternoId: empresa.responsavelInternoId,
      responsavelInternoNome:
        empresa.responsavelInterno?.nome?.trim() || SEM_RESPONSAVEL_LABEL,
      statusAtual: 'PENDENTE',
      tipoPendencia: TipoPendenciaEnum.OPERACIONAL,
      ultimaConferenciaOperacionalEm: empresa.ultimaConferenciaOperacionalEm
    });
  }

  async listCompanyPendencias(
    companyId: string,
    take = 5
  ): Promise<PendenciaOperacionalRecord[]> {
    return this.prisma.pendenciaOperacional.findMany({
      orderBy: [
        {
          status: 'asc'
        },
        {
          createdAt: 'desc'
        }
      ],
      take,
      where: {
        empresaId: companyId
      }
    });
  }

  async resolveCompanyPendencia(
    companyId: string,
    pendenciaId: string
  ): Promise<PendenciaOperacionalRecord> {
    return this.prisma.$transaction(async (client) => {
      const pendencia = await client.pendenciaOperacional.findFirst({
        select: {
          empresaId: true,
          id: true,
          status: true,
          tipo: true
        },
        where: {
          empresaId: companyId,
          id: pendenciaId,
          status: StatusPendenciaOperacional.ABERTA
        }
      });

      if (!pendencia) {
        throw new NotFoundException('Pendencia operacional nao encontrada.');
      }

      const resolvedAt = new Date();
      const resolvedPendencia = await client.pendenciaOperacional.update({
        data: {
          resolvedAt,
          status: StatusPendenciaOperacional.RESOLVIDA
        },
        where: {
          id: pendencia.id
        }
      });

      if (pendencia.tipo === TipoPendenciaOperacional.OPERACIONAL) {
        await client.empresa.update({
          data: {
            pendenciaOperacional: false,
            regularizadaEm: resolvedAt
          },
          where: {
            id: companyId
          }
        });
      }

      return resolvedPendencia;
    });
  }
}
