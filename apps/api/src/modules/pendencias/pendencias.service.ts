import {
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { LogsService } from '../logs/logs.service';
import { CreatePendenciaDto } from './dto/create-pendencia.dto';
import { ListCompanyPendenciasQueryDto } from './dto/list-company-pendencias-query.dto';
import { ListPendenciasQueryDto } from './dto/list-pendencias-query.dto';
import { UpdatePendenciaDto } from './dto/update-pendencia.dto';
import {
  mapPendenciaRecord,
  pendenciaInclude,
  sortPendencias,
  type PendenciaWithRelations
} from './pendencias.mappers';
import {
  type PendenciaRecord,
  PrioridadePendenciaEnum,
  ResultadoLogExecucaoEnum,
  StatusPendenciaEnum,
  TipoLogExecucaoEnum,
  TipoPendenciaEnum
} from './pendencias.types';

type PendenciaWriteClient = Prisma.TransactionClient | PrismaClient;

type OperationalCompanyRow = {
  id: string;
  naCarteira: boolean;
  pendenciaOperacional: boolean;
  razaoSocial: string;
  regularizadaEm: Date | null;
  responsavelInternoId: string | null;
};

type ManualScanFollowUp = {
  descricao: string;
  finding: string;
  prioridade: (typeof PrioridadePendenciaEnum)[keyof typeof PrioridadePendenciaEnum];
  tipo: (typeof TipoPendenciaEnum)[keyof typeof TipoPendenciaEnum];
  titulo: string;
};

const DEFAULT_PENDENCIA_ORIGEM = 'MANUAL';
const MANUAL_SCAN_ORIGIN = 'VARREDURA_MANUAL';

const MANUAL_SCAN_FOLLOW_UPS: ManualScanFollowUp[] = [
  {
    descricao: 'Acesso irregular identificado na varredura manual.',
    finding: 'Acesso irregular',
    prioridade: PrioridadePendenciaEnum.ALTA,
    tipo: TipoPendenciaEnum.ACESSO,
    titulo: 'Pendencia de acesso irregular'
  },
  {
    descricao: 'Procuracao irregular identificada na varredura manual.',
    finding: 'Procuracao irregular',
    prioridade: PrioridadePendenciaEnum.MEDIA,
    tipo: TipoPendenciaEnum.PROCURACAO,
    titulo: 'Pendencia de procuracao irregular'
  },
  {
    descricao: 'Pendencia operacional manual identificada na varredura manual.',
    finding: 'Pendencia operacional manual',
    prioridade: PrioridadePendenciaEnum.ALTA,
    tipo: TipoPendenciaEnum.OPERACIONAL,
    titulo: 'Pendencia operacional manual'
  }
];

const DEFAULT_TITLES: Record<
  (typeof TipoPendenciaEnum)[keyof typeof TipoPendenciaEnum],
  string
> = {
  ACESSO: 'Pendencia de acesso manual',
  OPERACIONAL: 'Pendencia operacional manual',
  PROCURACAO: 'Pendencia de procuracao manual'
};

const DEFAULT_DESCRIPTIONS: Record<
  (typeof TipoPendenciaEnum)[keyof typeof TipoPendenciaEnum],
  string
> = {
  ACESSO: 'Pendencia de acesso registrada manualmente.',
  OPERACIONAL: 'Pendencia operacional registrada manualmente.',
  PROCURACAO: 'Pendencia de procuracao registrada manualmente.'
};

const DEFAULT_PRIORITIES: Record<
  (typeof TipoPendenciaEnum)[keyof typeof TipoPendenciaEnum],
  (typeof PrioridadePendenciaEnum)[keyof typeof PrioridadePendenciaEnum]
> = {
  ACESSO: PrioridadePendenciaEnum.ALTA,
  OPERACIONAL: PrioridadePendenciaEnum.ALTA,
  PROCURACAO: PrioridadePendenciaEnum.MEDIA
};

@Injectable()
export class PendenciasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logsService: LogsService
  ) {}

  async recordManualScanPendencias(
    client: Prisma.TransactionClient,
    input: {
      companyId: string;
      findings: string[];
    }
  ): Promise<PendenciaRecord[]> {
    const createdPendencias: PendenciaRecord[] = [];
    const company = await this.assertCompanyExists(client, input.companyId);
    const hasOperationalFollowUp = MANUAL_SCAN_FOLLOW_UPS.some(
      (item) =>
        item.tipo === TipoPendenciaEnum.OPERACIONAL &&
        input.findings.includes(item.finding)
    );

    for (const followUp of MANUAL_SCAN_FOLLOW_UPS.filter((item) =>
      input.findings.includes(item.finding)
    )) {
      const openPendencia = await client.pendencia.findFirst({
        include: pendenciaInclude,
        where: {
          empresaId: input.companyId,
          origem: MANUAL_SCAN_ORIGIN,
          status: StatusPendenciaEnum.ABERTA,
          tipo: followUp.tipo
        }
      });

      if (openPendencia) {
        continue;
      }

      const created = await client.pendencia.create({
        data: {
          descricao: followUp.descricao,
          empresaId: input.companyId,
          origem: MANUAL_SCAN_ORIGIN,
          prioridade: followUp.prioridade,
          responsavelInternoId: company.responsavelInternoId,
          tipo: followUp.tipo,
          titulo: followUp.titulo
        },
        include: pendenciaInclude
      });

      createdPendencias.push(mapPendenciaRecord(created as PendenciaWithRelations));
    }

    if (hasOperationalFollowUp) {
      await this.refreshOperationalSummary(client, input.companyId, null);
    }

    return createdPendencias;
  }

  async list(
    query: ListPendenciasQueryDto = {}
  ): Promise<PendenciaRecord[]> {
    const pendencias = await this.prisma.pendencia.findMany({
      include: pendenciaInclude,
      orderBy: [
        {
          status: 'asc'
        },
        {
          abertaEm: 'desc'
        }
      ],
      take: query.take ?? 100,
      where: this.buildListWhere(query)
    });

    return pendencias.map(mapPendenciaRecord).sort(sortPendencias);
  }

  async listCompanyPendencias(
    companyId: string,
    query: ListCompanyPendenciasQueryDto = {}
  ): Promise<PendenciaRecord[]> {
    await this.assertCompanyExists(this.prisma, companyId);

    const pendencias = await this.prisma.pendencia.findMany({
      include: pendenciaInclude,
      orderBy: [
        {
          status: 'asc'
        },
        {
          abertaEm: 'desc'
        }
      ],
      take: query.take ?? 10,
      where: this.buildCompanyWhere(companyId, query)
    });

    return pendencias.map(mapPendenciaRecord).sort(sortPendencias);
  }

  async findOne(id: string): Promise<PendenciaRecord> {
    const pendencia = await this.prisma.pendencia.findUnique({
      include: pendenciaInclude,
      where: {
        id
      }
    });

    if (!pendencia) {
      throw new NotFoundException('Pendencia nao encontrada.');
    }

    return mapPendenciaRecord(pendencia as PendenciaWithRelations);
  }

  async createCompanyPendencia(
    companyId: string,
    dto: CreatePendenciaDto,
    executadoPorUsuarioInternoId?: string | null
  ): Promise<PendenciaRecord> {
    return this.prisma.$transaction(async (client) =>
      this.createCompanyPendenciaInTransaction(
        client,
        companyId,
        dto,
        executadoPorUsuarioInternoId
      )
    );
  }

  async update(
    id: string,
    dto: UpdatePendenciaDto,
    executadoPorUsuarioInternoId?: string | null
  ): Promise<PendenciaRecord> {
    return this.prisma.$transaction(async (client) => {
      const pendencia = await client.pendencia.findUnique({
        include: pendenciaInclude,
        where: {
          id
        }
      });

      if (!pendencia) {
        throw new NotFoundException('Pendencia nao encontrada.');
      }

      const data: Prisma.PendenciaUncheckedUpdateInput = {};
      let statusChanged = false;

      if (dto.titulo !== undefined) {
        const titulo = normalizeText(dto.titulo);

        if (titulo !== undefined) {
          data.titulo = titulo;
        }
      }

      if (dto.descricao !== undefined) {
        const descricao = normalizeText(dto.descricao);

        if (descricao !== undefined) {
          data.descricao = descricao;
        }
      }

      if (dto.origem !== undefined) {
        const origem = normalizeText(dto.origem);

        if (origem !== undefined) {
          data.origem = origem;
        }
      }

      if (dto.prioridade !== undefined) {
        data.prioridade = dto.prioridade;
      }

      if (dto.responsavelInternoId !== undefined) {
        const responsavelInternoId = normalizeNullableText(
          dto.responsavelInternoId
        );

        if (responsavelInternoId !== undefined) {
          data.responsavelInternoId = responsavelInternoId;
        }
      }

      if (dto.status !== undefined && dto.status !== pendencia.status) {
        statusChanged = true;
        data.status = dto.status;
        data.fechadaEm =
          dto.status === StatusPendenciaEnum.RESOLVIDA ? new Date() : null;
      }

      if (Object.keys(data).length === 0) {
        return mapPendenciaRecord(pendencia as PendenciaWithRelations);
      }

      if (executadoPorUsuarioInternoId !== undefined) {
        data.atualizadaPorUsuarioInternoId = executadoPorUsuarioInternoId;
      }

      const updated = await client.pendencia.update({
        data,
        include: pendenciaInclude,
        where: {
          id: pendencia.id
        }
      });

      if (updated.tipo === TipoPendenciaEnum.OPERACIONAL && statusChanged) {
        await this.refreshOperationalSummary(
          client,
          updated.empresaId,
          updated.status === StatusPendenciaEnum.RESOLVIDA
            ? updated.fechadaEm ?? new Date()
            : null
        );
      }

      if (statusChanged) {
        await this.logsService.recordExecution(client, {
          detalhes: `Pendencia ${updated.status === StatusPendenciaEnum.RESOLVIDA ? 'resolvida' : 'reaberta'}.`,
          empresaId: updated.empresaId,
          executadoPorUsuarioInternoId,
          pendenciaId: updated.id,
          resultado: ResultadoLogExecucaoEnum.SUCESSO,
          resumo:
            updated.status === StatusPendenciaEnum.RESOLVIDA
              ? `Pendencia regularizada: ${updated.titulo}`
              : `Pendencia reaberta: ${updated.titulo}`,
          tipo:
            updated.status === StatusPendenciaEnum.RESOLVIDA
              ? TipoLogExecucaoEnum.REGULARIZACAO_PENDENCIA
              : TipoLogExecucaoEnum.REGISTRO_PENDENCIA
        });
      } else {
        await this.logsService.recordExecution(client, {
          detalhes: 'Campos de pendencia ajustados manualmente.',
          empresaId: updated.empresaId,
          executadoPorUsuarioInternoId,
          pendenciaId: updated.id,
          resultado: ResultadoLogExecucaoEnum.SUCESSO,
          resumo: `Pendencia atualizada: ${updated.titulo}`,
          tipo: TipoLogExecucaoEnum.REGISTRO_PENDENCIA
        });
      }

      return mapPendenciaRecord(updated as PendenciaWithRelations);
    });
  }

  async resolveCompanyPendencia(
    companyId: string,
    pendenciaId: string,
    executadoPorUsuarioInternoId?: string | null,
    chaveIdempotencia?: string | null
  ): Promise<PendenciaRecord> {
    return this.prisma.$transaction(async (client) => {
      const pendencia = await client.pendencia.findFirst({
        include: pendenciaInclude,
        where: {
          empresaId: companyId,
          id: pendenciaId
        }
      });

      if (!pendencia) {
        throw new NotFoundException('Pendencia nao encontrada.');
      }

      if (pendencia.status === StatusPendenciaEnum.RESOLVIDA) {
        return mapPendenciaRecord(pendencia as PendenciaWithRelations);
      }

      const resolvedAt = new Date();
      const resolved = await client.pendencia.update({
        data: {
          atualizadaPorUsuarioInternoId:
            executadoPorUsuarioInternoId ?? pendencia.atualizadaPorUsuarioInternoId,
          fechadaEm: resolvedAt,
          status: StatusPendenciaEnum.RESOLVIDA
        },
        include: pendenciaInclude,
        where: {
          id: pendencia.id
        }
      });

      if (resolved.tipo === TipoPendenciaEnum.OPERACIONAL) {
        await this.refreshOperationalSummary(client, companyId, resolvedAt);
      }

      await this.logsService.recordExecution(client, {
        chaveIdempotencia,
        detalhes: `Pendencia ${resolved.status.toLowerCase()} pelo fluxo da empresa.`,
        empresaId: companyId,
        executadoPorUsuarioInternoId,
        pendenciaId: resolved.id,
        resultado: ResultadoLogExecucaoEnum.SUCESSO,
        resumo: `Pendencia regularizada: ${resolved.titulo}`,
        tipo: TipoLogExecucaoEnum.REGULARIZACAO_PENDENCIA
      });

      return mapPendenciaRecord(resolved as PendenciaWithRelations);
    });
  }

  async resolveFirstOpenOperationalPendencia(
    companyId: string,
    executadoPorUsuarioInternoId?: string | null,
    chaveIdempotencia?: string | null
  ): Promise<PendenciaRecord | null> {
    return this.prisma.$transaction(async (client) => {
      const pendencia = await client.pendencia.findFirst({
        include: pendenciaInclude,
        orderBy: {
          abertaEm: 'asc'
        },
        where: {
          empresaId: companyId,
          status: StatusPendenciaEnum.ABERTA,
          tipo: TipoPendenciaEnum.OPERACIONAL
        }
      });

      if (!pendencia) {
        const company = await this.assertCompanyExists(client, companyId);

        if (!company.pendenciaOperacional) {
          return null;
        }

        const resolvedAt = new Date();
        await this.refreshOperationalSummary(client, companyId, resolvedAt);
        await this.logsService.recordExecution(client, {
          chaveIdempotencia,
          detalhes:
            'Nenhuma pendencia operacional aberta foi encontrada; resumo operacional ajustado.',
          empresaId: companyId,
          executadoPorUsuarioInternoId,
          resultado: ResultadoLogExecucaoEnum.SUCESSO,
          resumo: 'Resumo operacional regularizado sem pendencia aberta.',
          tipo: TipoLogExecucaoEnum.REGULARIZACAO_PENDENCIA
        });

        return null;
      }

      const resolvedAt = new Date();
      const resolved = await client.pendencia.update({
        data: {
          atualizadaPorUsuarioInternoId:
            executadoPorUsuarioInternoId ?? null,
          fechadaEm: resolvedAt,
          status: StatusPendenciaEnum.RESOLVIDA
        },
        include: pendenciaInclude,
        where: {
          id: pendencia.id
        }
      });

      await this.refreshOperationalSummary(client, companyId, resolvedAt);
      await this.logsService.recordExecution(client, {
        chaveIdempotencia,
        detalhes: 'Pendencia operacional regularizada pelo atalho da empresa.',
        empresaId: companyId,
        executadoPorUsuarioInternoId,
        pendenciaId: resolved.id,
        resultado: ResultadoLogExecucaoEnum.SUCESSO,
        resumo: `Pendencia regularizada: ${resolved.titulo}`,
        tipo: TipoLogExecucaoEnum.REGULARIZACAO_PENDENCIA
      });

      return mapPendenciaRecord(resolved as PendenciaWithRelations);
    });
  }

  async ensureCompanyOperationalCheck(
    companyId: string,
    executadoPorUsuarioInternoId?: string | null,
    chaveIdempotencia?: string | null
  ): Promise<{ updatedAt: string }> {
    return this.prisma.$transaction(async (client) => {
      await this.assertCompanyExists(client, companyId);
      const now = new Date();

      await client.empresa.update({
        data: {
          ultimaConferenciaOperacionalEm: now
        },
        where: {
          id: companyId
        }
      });

      await this.logsService.recordExecution(client, {
        chaveIdempotencia,
        empresaId: companyId,
        executadoEm: now,
        executadoPorUsuarioInternoId,
        resultado: ResultadoLogExecucaoEnum.SUCESSO,
        resumo: 'Conferencia operacional registrada.',
        tipo: TipoLogExecucaoEnum.CONFERENCIA_OPERACIONAL
      });

      return {
        updatedAt: now.toISOString()
      };
    });
  }

  async removeCompanyFromWallet(
    companyId: string,
    executadoPorUsuarioInternoId?: string | null,
    chaveIdempotencia?: string | null
  ): Promise<{ updatedAt: string }> {
    return this.prisma.$transaction(async (client) => {
      const company = await this.assertCompanyExists(client, companyId);

      if (!company.naCarteira) {
        const now = new Date();
        return {
          updatedAt: now.toISOString()
        };
      }

      const now = new Date();

      await client.empresa.update({
        data: {
          naCarteira: false
        },
        where: {
          id: companyId
        }
      });

      await this.logsService.recordExecution(client, {
        chaveIdempotencia,
        empresaId: companyId,
        executadoEm: now,
        executadoPorUsuarioInternoId,
        resultado: ResultadoLogExecucaoEnum.SUCESSO,
        resumo: 'Empresa retirada da carteira.',
        tipo: TipoLogExecucaoEnum.RETIRADA_CARTEIRA
      });

      return {
        updatedAt: now.toISOString()
      };
    });
  }

  private async createCompanyPendenciaInTransaction(
    client: PendenciaWriteClient,
    companyId: string,
    dto: CreatePendenciaDto,
    executadoPorUsuarioInternoId?: string | null
  ): Promise<PendenciaRecord> {
    const company = await this.assertCompanyExists(client, companyId);
    const tipo = dto.tipo ?? TipoPendenciaEnum.OPERACIONAL;
    const prioridade = dto.prioridade ?? DEFAULT_PRIORITIES[tipo];
    const titulo = normalizeText(dto.titulo) ?? DEFAULT_TITLES[tipo];
    const descricao = normalizeText(dto.descricao) ?? DEFAULT_DESCRIPTIONS[tipo];
    const origem = normalizeText(dto.origem) ?? DEFAULT_PENDENCIA_ORIGEM;
    const responsavelInternoId =
      normalizeNullableText(dto.responsavelInternoId) ?? company.responsavelInternoId;
    const existing = await client.pendencia.findFirst({
      include: pendenciaInclude,
      where: {
        empresaId: companyId,
        origem,
        prioridade,
        responsavelInternoId,
        status: StatusPendenciaEnum.ABERTA,
        tipo,
        titulo
      }
    });

    if (existing && normalizeText(existing.descricao) === descricao) {
      return mapPendenciaRecord(existing as PendenciaWithRelations);
    }

    const data: Prisma.PendenciaUncheckedCreateInput = {
      abertaEm: new Date(),
      descricao,
      empresaId: companyId,
      origem,
      prioridade,
      status: StatusPendenciaEnum.ABERTA,
      tipo,
      titulo
    };

    if (executadoPorUsuarioInternoId !== undefined) {
      data.atualizadaPorUsuarioInternoId = executadoPorUsuarioInternoId;
      data.criadaPorUsuarioInternoId = executadoPorUsuarioInternoId;
    }

    if (responsavelInternoId !== undefined) {
      data.responsavelInternoId = responsavelInternoId;
    }

    const created = await client.pendencia.create({
      data,
      include: pendenciaInclude
    });

    if (tipo === TipoPendenciaEnum.OPERACIONAL) {
      await this.refreshOperationalSummary(client, companyId, null);
    }

    await this.logsService.recordExecution(client, {
      chaveIdempotencia: dto.chaveIdempotencia,
      detalhes: `Pendencia criada com origem ${origem}.`,
      empresaId: companyId,
      executadoPorUsuarioInternoId,
      pendenciaId: created.id,
      resultado: ResultadoLogExecucaoEnum.SUCESSO,
      resumo: `Pendencia registrada: ${created.titulo}`,
      tipo: TipoLogExecucaoEnum.REGISTRO_PENDENCIA
    });

    return mapPendenciaRecord(created as PendenciaWithRelations);
  }

  private buildListWhere(
    query: ListPendenciasQueryDto
  ): Prisma.PendenciaWhereInput {
    const where: Prisma.PendenciaWhereInput = {
      empresa: {
        naCarteira: true
      }
    };

    if (query.empresaId) {
      where.empresaId = query.empresaId;
    }

    if (query.responsavelInternoId) {
      where.responsavelInternoId = query.responsavelInternoId;
    }

    const status = query.status;
    if (status) {
      where.status = status;
    }

    const prioridade = query.prioridade ?? query.criticidade;
    if (prioridade) {
      where.prioridade = prioridade;
    }

    if (query.tipoPendencia) {
      where.tipo = query.tipoPendencia;
    }

    return where;
  }

  private buildCompanyWhere(
    companyId: string,
    query: ListCompanyPendenciasQueryDto
  ): Prisma.PendenciaWhereInput {
    const where: Prisma.PendenciaWhereInput = {
      empresaId: companyId
    };

    if (query.responsavelInternoId) {
      where.responsavelInternoId = query.responsavelInternoId;
    }

    const status = query.status;
    if (status) {
      where.status = status;
    }

    const prioridade = query.prioridade ?? query.criticidade;
    if (prioridade) {
      where.prioridade = prioridade;
    }

    if (query.tipoPendencia) {
      where.tipo = query.tipoPendencia;
    }

    return where;
  }

  private async assertCompanyExists(
    client: PendenciaWriteClient,
    companyId: string
  ): Promise<OperationalCompanyRow> {
    const company = await client.empresa.findUnique({
      select: {
        id: true,
        naCarteira: true,
        pendenciaOperacional: true,
        razaoSocial: true,
        regularizadaEm: true,
        responsavelInternoId: true
      },
      where: {
        id: companyId
      }
    });

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    return company;
  }

  private async refreshOperationalSummary(
    client: PendenciaWriteClient,
    companyId: string,
    regularizadaEm: Date | null
  ): Promise<void> {
    const openOperationalPendencias = await client.pendencia.count({
      where: {
        empresaId: companyId,
        status: StatusPendenciaEnum.ABERTA,
        tipo: TipoPendenciaEnum.OPERACIONAL
      }
    });

    await client.empresa.update({
      data: {
        pendenciaOperacional: openOperationalPendencias > 0,
        regularizadaEm: openOperationalPendencias === 0 ? regularizadaEm : null
      },
      where: {
        id: companyId
      }
    });
  }
}

function normalizeText(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeNullableText(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
