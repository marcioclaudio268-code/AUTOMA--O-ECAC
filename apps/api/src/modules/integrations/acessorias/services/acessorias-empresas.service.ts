import {
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  Prisma,
  StatusAcessoriasEmpresaVinculo,
  StatusIntegracaoAcessorias
} from '@prisma/client';

import { isBasicCnpj, normalizeCnpj } from '../../../../common/utils/cnpj';
import { PrismaService } from '../../../../prisma/prisma.service';

import { AcessoriasConfigService } from './acessorias-config.service';
import { AcessoriasConnectorService } from './acessorias-connector.service';
import { AcessoriasJobsService } from './acessorias-jobs.service';
import type {
  AcessoriasCompanyExternalRaw,
  AcessoriasCompanyLinkInput,
  AcessoriasCompanyLinkView,
  AcessoriasCompanySummaryView,
  AcessoriasCompanySyncResponse,
  AcessoriasCompanySyncSummaryView
} from '../acessorias.types';

const companySummarySelect = {
  cnpj: true,
  id: true,
  nomeFantasia: true,
  razaoSocial: true
} as const;

const vinculoInclude = {
  empresa: {
    select: companySummarySelect
  }
} as const;

type CompanySummaryRecord = Prisma.EmpresaGetPayload<{
  select: typeof companySummarySelect;
}>;

type VinculoRecord = Prisma.AcessoriasEmpresaVinculoGetPayload<{
  include: typeof vinculoInclude;
}>;

type NormalizedExternalCompany = {
  acessoriasEmpresaId: string;
  cnpjExterno: string | null;
  normalizedCnpj: string | null;
  nomeExterno: string;
};

type ResolvedLinkState = {
  empresaId: string | null;
  matchAutomatico: boolean;
  sincronizacaoHabilitada: boolean;
  statusVinculo: StatusAcessoriasEmpresaVinculo;
  ignorado: boolean;
};

type LoadedCompanies = {
  items: AcessoriasCompanyExternalRaw[];
  pages: number;
  lastCursor: string | null;
};

const MAX_COMPANY_PAGES = 25;

@Injectable()
export class AcessoriasEmpresasService {
  constructor(
    private readonly configService: AcessoriasConfigService,
    private readonly connectorService: AcessoriasConnectorService,
    private readonly jobsService: AcessoriasJobsService,
    private readonly prisma: PrismaService
  ) {}

  async syncCompanies(): Promise<AcessoriasCompanySyncResponse> {
    const job = await this.jobsService.createSyncCompaniesJob();
    const summary = this.createEmptySummary();
    const errors: string[] = [];

    try {
      const token = await this.configService.loadApiToken();

      if (!token) {
        const message =
          'Configuracao Acessorias nao encontrada ou token nao informado.';

        return await this.finishSyncWithFailure(
          job.id,
          new Date(),
          message,
          summary,
          message
        );
      }

      const externalCompanies = await this.loadExternalCompanies(token);
      const duplicateCnpjCounts = this.buildDuplicateCnpjCounts(
        externalCompanies.items
      );
      const seenExternalIds = new Set<string>();

      for (const rawCompany of externalCompanies.items) {
        summary.processados += 1;

        const normalized = this.normalizeExternalCompany(rawCompany);

        if (!normalized) {
          summary.ignorados += 1;
          continue;
        }

        if (seenExternalIds.has(normalized.acessoriasEmpresaId)) {
          summary.ignorados += 1;
          continue;
        }

        seenExternalIds.add(normalized.acessoriasEmpresaId);

        try {
          const existing = await this.prisma.acessoriasEmpresaVinculo.findUnique(
            {
              include: vinculoInclude,
              where: {
                acessoriasEmpresaId: normalized.acessoriasEmpresaId
              }
            }
          );
          const matchedCompany = await this.findMatchingCompany(
            normalized,
            duplicateCnpjCounts,
            existing
          );
          const internalConflict = await this.findInternalConflict(
            matchedCompany,
            normalized.acessoriasEmpresaId,
            existing
          );
          const desiredState = this.resolveDesiredState(
            existing,
            normalized,
            matchedCompany,
            duplicateCnpjCounts,
            internalConflict
          );
          const saved = await this.prisma.acessoriasEmpresaVinculo.upsert({
            create: this.buildCreateData(normalized, desiredState),
            include: vinculoInclude,
            update: this.buildUpdateData(normalized, desiredState),
            where: {
              acessoriasEmpresaId: normalized.acessoriasEmpresaId
            }
          });

          if (existing) {
            summary.atualizados += 1;
          } else {
            summary.criados += 1;
          }

          if (desiredState.matchAutomatico && !existing?.empresaId) {
            summary.vinculadosAutomaticamente += 1;
          }

          if (saved.statusVinculo !== 'VINCULADA') {
            if (desiredState.ignorado) {
              summary.ignorados += 1;
            } else {
              summary.pendentes += 1;
            }
          }
        } catch (error) {
          summary.falhas += 1;
          errors.push(
            this.normalizeErrorMessage(
              error,
              normalized.acessoriasEmpresaId
            )
          );
        }
      }

      const completedAt = new Date();
      const success = summary.falhas === 0;
      const integrationStatus = success
        ? StatusIntegracaoAcessorias.ATIVA
        : StatusIntegracaoAcessorias.ERRO;
      const message = success
        ? `Sincronizacao de empresas Acessorias concluida com ${summary.processados} registros processados.`
        : `Sincronizacao de empresas Acessorias concluida com ${summary.falhas} falhas.`;

      await this.persistCursor(
        externalCompanies.pages,
        externalCompanies.lastCursor,
        completedAt
      );

      const config = await this.configService.markConnectionStatus(
        integrationStatus,
        success ? null : message,
        {
          lastSyncAt: completedAt
        }
      );

      const jobView = success
        ? await this.jobsService.markSuccess(job.id, summary)
        : await this.jobsService.markFailure(
            job.id,
            [message, ...errors].join('\n'),
            summary
          );

      return {
        config,
        job: jobView,
        message,
        summary
      };
    } catch (error) {
      const message = this.normalizeErrorMessage(error);
      return await this.finishSyncWithFailure(
        job.id,
        new Date(),
        message,
        summary,
        message
      );
    }
  }

  async listCompanies(): Promise<AcessoriasCompanyLinkView[]> {
    const records = await this.prisma.acessoriasEmpresaVinculo.findMany({
      include: vinculoInclude,
      orderBy: [
        {
          updatedAt: 'desc'
        }
      ]
    });

    return records.map((record) => this.mapRecord(record));
  }

  async listVinculos(): Promise<AcessoriasCompanyLinkView[]> {
    const records = await this.prisma.acessoriasEmpresaVinculo.findMany({
      include: vinculoInclude,
      orderBy: [
        {
          updatedAt: 'desc'
        }
      ],
      where: {
        empresaId: {
          not: null
        }
      }
    });

    return records.map((record) => this.mapRecord(record));
  }

  async linkCompany(
    empresaId: string,
    dto: AcessoriasCompanyLinkInput
  ): Promise<AcessoriasCompanyLinkView> {
    const internalCompany = await this.prisma.empresa.findUnique({
      select: companySummarySelect,
      where: {
        id: empresaId
      }
    });

    if (!internalCompany) {
      throw new NotFoundException('Empresa interna nao encontrada.');
    }

    const externalId = this.normalizeIdentifier(dto.acessoriasEmpresaId);

    if (!externalId) {
      throw new NotFoundException('Empresa externa Acessorias nao encontrada.');
    }

    const externalRecord = await this.prisma.acessoriasEmpresaVinculo.findUnique(
      {
        include: vinculoInclude,
        where: {
          acessoriasEmpresaId: externalId
        }
      }
    );

    if (!externalRecord) {
      throw new NotFoundException('Empresa externa Acessorias nao encontrada.');
    }

    const linkedToAnotherCompany = await this.prisma.acessoriasEmpresaVinculo.findUnique(
      {
        select: {
          id: true
        },
        where: {
          empresaId
        }
      }
    );

    if (linkedToAnotherCompany && linkedToAnotherCompany.id !== externalRecord.id) {
      throw new ConflictException(
        'Esta empresa interna ja possui um vinculo Acessorias.'
      );
    }

    const updated = await this.prisma.acessoriasEmpresaVinculo.update({
      data: {
        empresa: {
          connect: {
            id: internalCompany.id
          }
        },
        matchAutomatico: false,
        sincronizacaoHabilitada: true,
        statusVinculo: 'VINCULADA',
        ultimaSincronizacaoEm: new Date()
      },
      include: vinculoInclude,
      where: {
        id: externalRecord.id
      }
    });

    return this.mapRecord(updated);
  }

  async unlinkCompany(empresaId: string): Promise<AcessoriasCompanyLinkView> {
    const linkedRecord = await this.prisma.acessoriasEmpresaVinculo.findUnique({
      include: vinculoInclude,
      where: {
        empresaId
      }
    });

    if (!linkedRecord) {
      throw new NotFoundException('Vinculo Acessorias nao encontrado.');
    }

    const updated = await this.prisma.acessoriasEmpresaVinculo.update({
      data: {
        empresa: {
          disconnect: true
        },
        matchAutomatico: false,
        sincronizacaoHabilitada: false,
        statusVinculo: 'IGNORADA',
        ultimaSincronizacaoEm: new Date()
      },
      include: vinculoInclude,
      where: {
        id: linkedRecord.id
      }
    });

    return this.mapRecord(updated);
  }

  private async finishSyncWithFailure(
    jobId: string,
    syncAt: Date,
    message: string,
    summary: AcessoriasCompanySyncSummaryView,
    jobMessage: string
  ): Promise<AcessoriasCompanySyncResponse> {
    const config = await this.configService.markConnectionStatus(
      StatusIntegracaoAcessorias.ERRO,
      message,
      {
        lastSyncAt: syncAt
      }
    );
    const jobView = await this.jobsService.markFailure(
      jobId,
      jobMessage,
      {
        ...summary,
        falhas: Math.max(summary.falhas, 1)
      }
    );

    return {
      config,
      job: jobView,
      message,
      summary
    };
  }

  private async loadExternalCompanies(token: string): Promise<LoadedCompanies> {
    const collected: AcessoriasCompanyExternalRaw[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    let lastCursor: string | null = null;
    let pages = 0;

    for (let page = 0; page < MAX_COMPANY_PAGES; page += 1) {
      lastCursor = cursor;
      const response = await this.connectorService.fetchCompanies(token, cursor);
      collected.push(...response.items);
      pages += 1;
      const nextCursor = response.nextCursor ?? null;

      if (!nextCursor) {
        cursor = null;
        break;
      }

      if (seenCursors.has(nextCursor)) {
        throw new Error('Cursor Acessorias de empresas repetido.');
      }

      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }

    if (cursor) {
      throw new Error('Limite de paginas Acessorias excedido.');
    }

    return {
      items: collected,
      lastCursor,
      pages
    };
  }

  private async persistCursor(
    totalPages: number,
    lastCursor: string | null,
    lastSyncAt: Date
  ): Promise<void> {
    await this.prisma.acessoriasSyncCursor.upsert({
      create: {
        id: 'acessorias-empresas',
        tipoCursor: 'EMPRESAS',
        ultimaExecucaoEm: lastSyncAt,
        ultimaPagina: totalPages,
        valorCursor: lastCursor
      },
      update: {
        ultimaExecucaoEm: lastSyncAt,
        ultimaPagina: totalPages,
        valorCursor: lastCursor
      },
      where: {
        tipoCursor: 'EMPRESAS'
      }
    });
  }

  private buildDuplicateCnpjCounts(
    companies: AcessoriasCompanyExternalRaw[]
  ): Map<string, number> {
    const counts = new Map<string, number>();

    for (const rawCompany of companies) {
      const normalized = this.normalizeExternalCompany(rawCompany);

      if (!normalized?.normalizedCnpj) {
        continue;
      }

      counts.set(
        normalized.normalizedCnpj,
        (counts.get(normalized.normalizedCnpj) ?? 0) + 1
      );
    }

    return counts;
  }

  private async findMatchingCompany(
    normalized: NormalizedExternalCompany,
    duplicateCnpjCounts: Map<string, number>,
    existing: VinculoRecord | null
  ): Promise<CompanySummaryRecord | null> {
    if (!normalized.normalizedCnpj || !isBasicCnpj(normalized.normalizedCnpj)) {
      return null;
    }

    if ((duplicateCnpjCounts.get(normalized.normalizedCnpj) ?? 0) > 1) {
      return null;
    }

    if (existing?.statusVinculo === 'IGNORADA' || existing?.statusVinculo === 'AMBIGUA') {
      return null;
    }

    return await this.prisma.empresa.findUnique({
      select: companySummarySelect,
      where: {
        cnpj: normalized.normalizedCnpj
      }
    });
  }

  private async findInternalConflict(
    matchedCompany: CompanySummaryRecord | null,
    externalId: string,
    existing: VinculoRecord | null
  ): Promise<boolean> {
    if (!matchedCompany || existing?.empresaId) {
      return false;
    }

    const conflicting = await this.prisma.acessoriasEmpresaVinculo.findUnique({
      select: {
        acessoriasEmpresaId: true,
        id: true
      },
      where: {
        empresaId: matchedCompany.id
      }
    });

    return Boolean(
      conflicting && conflicting.acessoriasEmpresaId !== externalId
    );
  }

  private resolveDesiredState(
    existing: VinculoRecord | null,
    normalized: NormalizedExternalCompany,
    matchedCompany: CompanySummaryRecord | null,
    duplicateCnpjCounts: Map<string, number>,
    internalConflict: boolean
  ): ResolvedLinkState {
    if (existing?.empresaId) {
      return {
        empresaId: existing.empresaId,
        ignorado: false,
        matchAutomatico: existing.matchAutomatico,
        sincronizacaoHabilitada: true,
        statusVinculo: 'VINCULADA'
      };
    }

    if (existing?.statusVinculo === 'IGNORADA') {
      return {
        empresaId: null,
        ignorado: true,
        matchAutomatico: false,
        sincronizacaoHabilitada: false,
        statusVinculo: 'IGNORADA'
      };
    }

    if (existing?.statusVinculo === 'AMBIGUA') {
      return {
        empresaId: null,
        ignorado: false,
        matchAutomatico: false,
        sincronizacaoHabilitada: false,
        statusVinculo: 'AMBIGUA'
      };
    }

    const isValidCnpj =
      !!normalized.normalizedCnpj && isBasicCnpj(normalized.normalizedCnpj);
    const isDuplicate =
      !!normalized.normalizedCnpj &&
      (duplicateCnpjCounts.get(normalized.normalizedCnpj) ?? 0) > 1;

    if (!isValidCnpj || isDuplicate) {
      return {
        empresaId: null,
        ignorado: false,
        matchAutomatico: false,
        sincronizacaoHabilitada: false,
        statusVinculo: 'AMBIGUA'
      };
    }

    if (internalConflict) {
      return {
        empresaId: null,
        ignorado: false,
        matchAutomatico: false,
        sincronizacaoHabilitada: false,
        statusVinculo: 'AMBIGUA'
      };
    }

    if (matchedCompany) {
      return {
        empresaId: matchedCompany.id,
        ignorado: false,
        matchAutomatico: true,
        sincronizacaoHabilitada: true,
        statusVinculo: 'VINCULADA'
      };
    }

      return {
        empresaId: null,
        ignorado: false,
        matchAutomatico: false,
        sincronizacaoHabilitada: false,
        statusVinculo: 'NAO_VINCULADA'
      };
  }

  private buildCreateData(
    normalized: NormalizedExternalCompany,
    state: ResolvedLinkState
  ): Prisma.AcessoriasEmpresaVinculoUncheckedCreateInput {
    return {
      ...(state.empresaId ? { empresaId: state.empresaId } : {}),
      acessoriasEmpresaId: normalized.acessoriasEmpresaId,
      cnpjExterno: normalized.cnpjExterno ?? '',
      matchAutomatico: state.matchAutomatico,
      nomeExterno: normalized.nomeExterno,
      sincronizacaoHabilitada: state.sincronizacaoHabilitada,
      statusVinculo: state.statusVinculo,
      ultimaSincronizacaoEm: new Date()
    };
  }

  private buildUpdateData(
    normalized: NormalizedExternalCompany,
    state: ResolvedLinkState
  ): Prisma.AcessoriasEmpresaVinculoUncheckedUpdateInput {
    return {
      cnpjExterno: normalized.cnpjExterno ?? '',
      ...(state.empresaId !== null
        ? { empresaId: state.empresaId }
        : { empresaId: null }),
      matchAutomatico: state.matchAutomatico,
      nomeExterno: normalized.nomeExterno,
      sincronizacaoHabilitada: state.sincronizacaoHabilitada,
      statusVinculo: state.statusVinculo,
      ultimaSincronizacaoEm: new Date()
    };
  }

  private normalizeExternalCompany(
    rawCompany: AcessoriasCompanyExternalRaw
  ): NormalizedExternalCompany | null {
    const acessoriasEmpresaId = this.normalizeIdentifier(
      rawCompany.id ?? rawCompany.empresaId ?? rawCompany.codigo
    );

    if (!acessoriasEmpresaId) {
      return null;
    }

    const normalizedCnpj = normalizeCnpj(
      rawCompany.cnpj ?? rawCompany.cnpjExterno
    );
    const nomeExterno = this.normalizeText(
      rawCompany.razaoSocial ?? rawCompany.nome ?? rawCompany.nomeFantasia,
      acessoriasEmpresaId
    );

    return {
      acessoriasEmpresaId,
      cnpjExterno: normalizedCnpj ?? null,
      normalizedCnpj: normalizedCnpj ?? null,
      nomeExterno
    };
  }

  private mapRecord(record: VinculoRecord): AcessoriasCompanyLinkView {
    return {
      acessoriasEmpresaId: record.acessoriasEmpresaId,
      cnpjExterno: record.cnpjExterno,
      createdAt: record.createdAt.toISOString(),
      empresa: record.empresa ? this.mapCompany(record.empresa) : null,
      empresaId: record.empresaId,
      id: record.id,
      matchAutomatico: record.matchAutomatico,
      nomeExterno: record.nomeExterno,
      sincronizacaoHabilitada: record.sincronizacaoHabilitada,
      statusVinculo: record.statusVinculo,
      ultimaSincronizacaoEm:
        record.ultimaSincronizacaoEm?.toISOString() ?? null,
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private mapCompany(
    company: CompanySummaryRecord
  ): AcessoriasCompanySummaryView {
    return {
      cnpj: company.cnpj,
      id: company.id,
      nomeFantasia: company.nomeFantasia,
      razaoSocial: company.razaoSocial
    };
  }

  private createEmptySummary(): AcessoriasCompanySyncSummaryView {
    return {
      atualizados: 0,
      criados: 0,
      falhas: 0,
      ignorados: 0,
      pendentes: 0,
      processados: 0,
      vinculadosAutomaticamente: 0
    };
  }

  private normalizeIdentifier(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeText(value: string | null | undefined, fallback: string): string {
    if (value === undefined || value === null) {
      return fallback;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : fallback;
  }

  private normalizeErrorMessage(error: unknown, externalId?: string): string {
    if (error instanceof Error && error.message.trim()) {
      return externalId
        ? `Empresa Acessorias ${externalId}: ${error.message.trim()}`
        : error.message.trim();
    }

    return externalId
      ? `Empresa Acessorias ${externalId}: falha inesperada.`
      : 'Falha inesperada na sincronizacao de empresas Acessorias.';
  }
}
