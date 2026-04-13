import { Prisma } from '@prisma/client';

import {
  SEM_RESPONSAVEL_LABEL,
  type CompanyOperationalHistory,
  type LogExecucaoRecord,
  type PendenciaRecord,
  type PrioridadePendencia
} from './pendencias.types';

const EXECUCAO_SISTEMA_LABEL = 'Sistema';

export const PENDENCIA_PRIORITY_ORDER: Record<PrioridadePendencia, number> = {
  ALTA: 0,
  MEDIA: 1,
  BAIXA: 2
};

export const pendenciaInclude = {
  atualizadaPorUsuarioInterno: {
    select: {
      email: true,
      id: true,
      nome: true
    }
  },
  criadaPorUsuarioInterno: {
    select: {
      email: true,
      id: true,
      nome: true
    }
  },
  empresa: {
    select: {
      cnpj: true,
      id: true,
      naCarteira: true,
      nomeFantasia: true,
      pendenciaOperacional: true,
      observacoesOperacionais: true,
      razaoSocial: true,
      responsavelInternoId: true,
      statusAcesso: true,
      statusProcuracao: true,
      ultimaConferenciaOperacionalEm: true,
      regularizadaEm: true
    }
  },
  responsavelInterno: {
    select: {
      ativo: true,
      email: true,
      id: true,
      nome: true
    }
  }
} as const;

export type PendenciaWithRelations = Prisma.PendenciaGetPayload<{
  include: typeof pendenciaInclude;
}>;

export const logInclude = {
  empresa: {
    select: {
      id: true,
      razaoSocial: true
    }
  },
  executadoPorUsuarioInterno: {
    select: {
      email: true,
      id: true,
      nome: true
    }
  },
  pendencia: {
    select: {
      id: true,
      status: true,
      titulo: true,
      tipo: true
    }
  }
} as const;

export type LogExecucaoWithRelations = Prisma.LogExecucaoGetPayload<{
  include: typeof logInclude;
}>;

export function mapPendenciaRecord(
  pendencia: PendenciaWithRelations
): PendenciaRecord {
  const statusAtual =
    pendencia.tipo === 'ACESSO'
      ? pendencia.empresa.statusAcesso
      : pendencia.tipo === 'PROCURACAO'
        ? pendencia.empresa.statusProcuracao
        : pendencia.status === 'ABERTA'
          ? 'PENDENTE'
          : pendencia.status;

  return {
    abertaEm: pendencia.abertaEm.toISOString(),
    atualizadaPorUsuarioInternoId: pendencia.atualizadaPorUsuarioInternoId,
    criadaPorUsuarioInternoId: pendencia.criadaPorUsuarioInternoId,
    createdAt: pendencia.createdAt.toISOString(),
    descricao: pendencia.descricao,
    empresa: {
      cnpj: pendencia.empresa.cnpj,
      id: pendencia.empresa.id,
      naCarteira: pendencia.empresa.naCarteira,
      nomeFantasia: pendencia.empresa.nomeFantasia,
      pendenciaOperacional: pendencia.empresa.pendenciaOperacional,
      observacoesOperacionais: pendencia.empresa.observacoesOperacionais,
      razaoSocial: pendencia.empresa.razaoSocial,
      responsavelInternoId: pendencia.empresa.responsavelInternoId,
      statusAcesso: pendencia.empresa.statusAcesso,
      statusProcuracao: pendencia.empresa.statusProcuracao,
      ultimaConferenciaOperacionalEm:
        pendencia.empresa.ultimaConferenciaOperacionalEm?.toISOString() ?? null,
      regularizadaEm: pendencia.empresa.regularizadaEm?.toISOString() ?? null
    },
    empresaCnpj: pendencia.empresa.cnpj,
    empresaNome: pendencia.empresa.razaoSocial,
    empresaNomeFantasia: pendencia.empresa.nomeFantasia,
    empresaId: pendencia.empresaId,
    fechadaEm: pendencia.fechadaEm?.toISOString() ?? null,
    id: pendencia.id,
    linkTratamento: `/empresas/${pendencia.empresaId}`,
    motivo: pendencia.titulo,
    origem: pendencia.origem,
    observacaoOperacional: pendencia.empresa.observacoesOperacionais,
    prioridade: pendencia.prioridade,
    criticidade: pendencia.prioridade,
    responsavelInternoId: pendencia.responsavelInternoId,
    responsavelInternoNome:
      pendencia.responsavelInterno?.nome?.trim() || SEM_RESPONSAVEL_LABEL,
    statusAtual,
    status: pendencia.status,
    tipoPendencia: pendencia.tipo,
    titulo: pendencia.titulo,
    tipo: pendencia.tipo,
    ultimaConferenciaOperacionalEm:
      pendencia.empresa.ultimaConferenciaOperacionalEm?.toISOString() ?? null,
    updatedAt: pendencia.updatedAt.toISOString()
  };
}

export function mapLogExecucaoRecord(
  log: LogExecucaoWithRelations
): LogExecucaoRecord {
  return {
    createdAt: log.createdAt.toISOString(),
    detalhes: log.detalhes,
    empresaId: log.empresaId,
    empresaNome: log.empresa.razaoSocial,
    executadoEm: log.executadoEm.toISOString(),
    executadoPorUsuarioInternoId: log.executadoPorUsuarioInternoId,
    executadoPorUsuarioInternoNome:
      log.executadoPorUsuarioInterno?.nome?.trim() || EXECUCAO_SISTEMA_LABEL,
    id: log.id,
    chaveIdempotencia: log.chaveIdempotencia,
    pendenciaId: log.pendenciaId,
    pendenciaStatus: log.pendencia?.status ?? null,
    pendenciaTipo: log.pendencia?.tipo ?? null,
    pendenciaTitulo: log.pendencia?.titulo ?? null,
    resultado: log.resultado,
    resumo: log.resumo,
    tipo: log.tipo
  };
}

export function sortPendencias(left: PendenciaRecord, right: PendenciaRecord) {
  if (left.status !== right.status) {
    return left.status === 'ABERTA' ? -1 : 1;
  }

  const priorityDelta =
    PENDENCIA_PRIORITY_ORDER[left.prioridade] -
    PENDENCIA_PRIORITY_ORDER[right.prioridade];

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  if (left.empresa.razaoSocial !== right.empresa.razaoSocial) {
    return left.empresa.razaoSocial.localeCompare(
      right.empresa.razaoSocial,
      'pt-BR'
    );
  }

  return right.abertaEm.localeCompare(left.abertaEm, 'pt-BR');
}

export function buildCompanyOperationalHistory(
  empresaId: string,
  empresaNome: string,
  logs: LogExecucaoRecord[],
  pendencias: PendenciaRecord[]
): CompanyOperationalHistory {
  return {
    empresaId,
    empresaNome,
    logs,
    pendencias
  };
}
