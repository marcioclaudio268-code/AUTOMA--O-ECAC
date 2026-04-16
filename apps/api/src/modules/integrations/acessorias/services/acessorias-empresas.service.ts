import {
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  Prisma,
  PrioridadePendencia,
  ResultadoLogExecucao,
  StatusAcessoriasEmpresaVinculo,
  StatusExecucaoVarredura,
  StatusIntegracao,
  StatusIntegracaoAcessorias,
  StatusPendencia,
  TipoEventoOperacional,
  TipoIntegracao,
  TipoLogExecucao,
  TipoPendencia,
  TipoVarredura
} from '@prisma/client';

import { isBasicCnpj, normalizeCnpj } from '../../../../common/utils/cnpj';
import { PrismaService } from '../../../../prisma/prisma.service';
import { LogsService } from '../../../logs/logs.service';
import { ParcelamentosService } from '../../../parcelamentos/parcelamentos.service';
import type {
  ParcelamentoSnapshotInput,
  ParcelamentoSyncResult
} from '../../../parcelamentos/parcelamentos.types';

import { AcessoriasConfigService } from './acessorias-config.service';
import { AcessoriasConnectorService } from './acessorias-connector.service';
import { AcessoriasJobsService } from './acessorias-jobs.service';
import type {
  AcessoriasCompanyExternalRaw,
  AcessoriasCompanyLinkInput,
  AcessoriasCompanyLinkView,
  AcessoriasCompanyExecutionIntegrationView,
  AcessoriasCompanyExecutionResponse,
  AcessoriasCompanyExecutionVarreduraView,
  AcessoriasCompanySummaryView,
  AcessoriasCompanySyncResponse,
  AcessoriasCompanySyncSummaryView,
  AcessoriasParcelamentoExternalRaw
} from '../acessorias.types';

const companySummarySelect = {
  cnpj: true,
  id: true,
  nomeFantasia: true,
  razaoSocial: true
} as const;

const companyExecutionSelect = {
  cnpj: true,
  id: true,
  nomeFantasia: true,
  razaoSocial: true,
  responsavelInternoId: true
} as const;

const companyIntegrationSelect = {
  createdAt: true,
  empresaId: true,
  id: true,
  mensagemErroAtual: true,
  observacoes: true,
  statusIntegracao: true,
  tipoIntegracao: true,
  ultimaExecucaoEm: true,
  updatedAt: true,
  ultimoErroEm: true,
  ultimoSucessoEm: true
} as const;

const vinculoInclude = {
  empresa: {
    select: companySummarySelect
  }
} as const;

type CompanySummaryRecord = Prisma.EmpresaGetPayload<{
  select: typeof companySummarySelect;
}>;

type CompanyExecutionRecord = Prisma.EmpresaGetPayload<{
  select: typeof companyExecutionSelect;
}>;

type CompanyIntegrationRecord = Prisma.IntegracaoEmpresaGetPayload<{
  select: typeof companyIntegrationSelect;
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

type NormalizedExternalParcelamento = ParcelamentoSnapshotInput;

type ExecutionFailureReason =
  | 'SEM_CONFIGURACAO'
  | 'SEM_VINCULO'
  | 'VINCULO_INVALIDO'
  | 'EMPRESA_EXTERNA_AUSENTE'
  | 'RETORNO_INCONCLUSIVO'
  | 'CNPJ_INCONSISTENTE'
  | 'FALHA_CONEXAO';

type ExecutionOutcome =
  | {
      details: string;
      externalCompany: NormalizedExternalCompany;
      integrationMessage: string;
      integrationObservacoes: string;
      logDetails: string;
      logSummary: string;
      statusIntegracao: 'ATIVA';
      success: true;
    }
  | {
      actionRequired: boolean;
      details: string;
      integrationMessage: string;
      logDetails: string;
      logSummary: string;
      pendingDescription: string | null;
      pendingTitle: string | null;
      reason: ExecutionFailureReason;
      statusIntegracao: 'ERRO' | 'NECESSITA_CONFERENCIA';
      success: false;
    };

const MAX_COMPANY_PAGES = 25;
const ACESSORIAS_EXECUTION_PENDING_ORIGIN = 'ACESSORIAS_EXECUCAO_EMPRESA';
const ACESSORIAS_PARCELAMENTO_PENDING_ORIGIN = 'ACESSORIAS_PARCELAMENTO';

@Injectable()
export class AcessoriasEmpresasService {
  constructor(
    private readonly configService: AcessoriasConfigService,
    private readonly connectorService: AcessoriasConnectorService,
    private readonly jobsService: AcessoriasJobsService,
    private readonly logsService: LogsService,
    private readonly parcelamentosService: ParcelamentosService,
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

  async executeCompany(
    empresaId: string,
    executadoPorUsuarioInternoId?: string | null
  ): Promise<AcessoriasCompanyExecutionResponse> {
    const company = await this.prisma.empresa.findUnique({
      select: companyExecutionSelect,
      where: {
        id: empresaId
      }
    });

    if (!company) {
      throw new NotFoundException('Empresa interna nao encontrada.');
    }

    const linkedRecord = await this.prisma.acessoriasEmpresaVinculo.findFirst({
      include: vinculoInclude,
      orderBy: {
        updatedAt: 'desc'
      },
      where: {
        empresaId
      }
    });

    const startedAt = new Date();
    let outcome: ExecutionOutcome;
    let normalizedParcelamentos: NormalizedExternalParcelamento[] = [];

    try {
      const token = await this.configService.loadApiToken();

      if (!token) {
        outcome = this.buildExecutionFailureOutcome(
          'SEM_CONFIGURACAO',
          company,
          linkedRecord,
          'Configuracao Acessorias nao encontrada ou token nao informado.'
        );
      } else if (!linkedRecord || !linkedRecord.empresaId) {
        outcome = this.buildExecutionFailureOutcome(
          'SEM_VINCULO',
          company,
          linkedRecord,
          'Empresa nao possui vinculo Acessorias valido.'
        );
      } else if (
        linkedRecord.statusVinculo !== 'VINCULADA' ||
        !linkedRecord.sincronizacaoHabilitada
      ) {
        outcome = this.buildExecutionFailureOutcome(
          'VINCULO_INVALIDO',
          company,
          linkedRecord,
          'Empresa nao possui vinculo Acessorias valido.'
        );
      } else {
        const externalCompany = await this.findExternalCompanyById(
          token,
          linkedRecord.acessoriasEmpresaId
        );

        if (!externalCompany) {
          outcome = this.buildExecutionFailureOutcome(
            'EMPRESA_EXTERNA_AUSENTE',
            company,
            linkedRecord,
            'Empresa externa vinculada nao foi encontrada no retorno atual da Acessorias.'
          );
        } else if (
          !externalCompany.normalizedCnpj ||
          !isBasicCnpj(externalCompany.normalizedCnpj)
        ) {
          outcome = this.buildExecutionFailureOutcome(
            'RETORNO_INCONCLUSIVO',
            company,
            linkedRecord,
            'Retorno Acessorias inconclusivo para a empresa vinculada.'
          );
        } else if (
          externalCompany.normalizedCnpj !== company.cnpj
        ) {
          outcome = this.buildExecutionFailureOutcome(
            'CNPJ_INCONSISTENTE',
            company,
            linkedRecord,
            'Vinculo Acessorias inconsistente com o CNPJ da empresa.'
          );
        } else {
          const parcelamentos = await this.connectorService.fetchParcelamentos(
            token,
            {
              acessoriasEmpresaId: linkedRecord.acessoriasEmpresaId,
              cnpj: company.cnpj
            }
          );

          normalizedParcelamentos = this.normalizeExternalParcelamentos(
            parcelamentos.items
          );

          outcome = this.buildExecutionSuccessOutcome(
            company,
            linkedRecord,
            externalCompany,
            normalizedParcelamentos.length
          );
        }
      }
    } catch (error) {
      outcome = this.buildExecutionFailureOutcomeFromError(
        company,
        linkedRecord,
        error
      );
    }

    const finishedAt = new Date();

    return this.prisma.$transaction(async (client) => {
      let parcelamentoSync: ParcelamentoSyncResult | null = null;

      if (outcome.success) {
        parcelamentoSync = await this.parcelamentosService.syncCompanyParcelamentos(
          client,
          {
            companyCnpj: company.cnpj,
            companyId: company.id,
            companyName: company.razaoSocial,
            snapshots: normalizedParcelamentos,
            syncedAt: finishedAt
          }
        );
        outcome = this.mergeExecutionSuccessOutcome(outcome, parcelamentoSync);
      }

      const varredura = await client.varredura.create({
        data: {
          empresaId: company.id,
          finalizadoEm: finishedAt,
          iniciadoEm: startedAt,
          resumoResultado: outcome.success
            ? parcelamentoSync?.resumoResultado ?? outcome.details
            : outcome.details,
          statusExecucao: outcome.success
            ? StatusExecucaoVarredura.CONCLUIDA
            : StatusExecucaoVarredura.FALHA,
          tipoVarredura: TipoVarredura.ACESSORIAS
        }
      });

      const integration = await this.upsertCompanyIntegrationState(
        client,
        company.id,
        finishedAt,
        outcome
      );

      let pendenciaId: string | null = null;
      let ultimoEventoRelevanteEm: Date | null = null;
      let marcarPendenciaOperacional = false;

      if (!outcome.success) {
        if (outcome.actionRequired) {
          const pendencia = await this.createExecutionPendencia(
            client,
            company,
            outcome,
            finishedAt
          );

          pendenciaId = pendencia.id;
          marcarPendenciaOperacional = true;
        }

        const event = await client.eventoOperacional.create({
          data: {
            descricao: outcome.logDetails,
            empresaId: company.id,
            metadata: {
              actionRequired: outcome.actionRequired,
              companyId: company.id,
              companyCnpj: company.cnpj,
              companyName: company.razaoSocial,
              integrationStatus: outcome.statusIntegracao,
              integrationType: 'ACESSORIAS',
              linkedAcessoriasEmpresaId:
                linkedRecord?.acessoriasEmpresaId ?? null,
              reason: outcome.reason
            },
            tipoEvento: TipoEventoOperacional.VARREDURA_RELEVANTE,
            varreduraId: varredura.id
          }
        });

        ultimoEventoRelevanteEm = event.createdAt;
      } else if (
        parcelamentoSync?.hasRelevantChange &&
        parcelamentoSync.eventDescription &&
        parcelamentoSync.eventType
      ) {
        const event = await client.eventoOperacional.create({
          data: {
            descricao: parcelamentoSync.eventDescription,
            empresaId: company.id,
            metadata: {
              ...parcelamentoSync.eventMetadata,
              integrationType: 'ACESSORIAS',
              linkedAcessoriasEmpresaId:
                linkedRecord?.acessoriasEmpresaId ?? null
            },
            tipoEvento: parcelamentoSync.eventType,
            varreduraId: varredura.id
          }
        });

        ultimoEventoRelevanteEm = event.createdAt;
      }

      if (outcome.success && parcelamentoSync?.pendingRequired) {
        const pendencia = await this.createParcelamentoPendencia(
          client,
          company,
          parcelamentoSync,
          finishedAt
        );

        pendenciaId = pendencia.id;
        marcarPendenciaOperacional = true;
      }

      const companyUpdateData: Prisma.EmpresaUpdateInput = {
        ultimaVarreduraEm: finishedAt
      };

      if (ultimoEventoRelevanteEm) {
        companyUpdateData.ultimoEventoRelevanteEm = ultimoEventoRelevanteEm;
      }

      if (marcarPendenciaOperacional) {
        companyUpdateData.pendenciaOperacional = true;
        companyUpdateData.regularizadaEm = null;
      }

      await client.empresa.update({
        data: companyUpdateData,
        where: {
          id: company.id
        }
      });

      await this.logsService.recordExecution(client, {
        empresaId: company.id,
        executadoEm: finishedAt,
        executadoPorUsuarioInternoId,
        pendenciaId,
        resultado: outcome.success
          ? ResultadoLogExecucao.SUCESSO
          : ResultadoLogExecucao.FALHA,
        resumo: outcome.logSummary,
        detalhes: outcome.logDetails,
        tipo: TipoLogExecucao.REVISAO_OPERACIONAL
      });

      return {
        integration: this.mapIntegrationRecord(integration),
        message: outcome.integrationMessage,
        success: outcome.success,
        varredura: this.mapExecutionVarredura(varredura)
      };
    });
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

  private async findExternalCompanyById(
    token: string,
    externalId: string
  ): Promise<NormalizedExternalCompany | null> {
    let cursor: string | null = null;

    for (let page = 0; page < MAX_COMPANY_PAGES; page += 1) {
      const response = await this.connectorService.fetchCompanies(token, cursor);
      const match = response.items
        .map((item) => this.normalizeExternalCompany(item))
        .find((item) => item?.acessoriasEmpresaId === externalId);

      if (match) {
        return match;
      }

      const nextCursor = response.nextCursor ?? null;

      if (!nextCursor) {
        break;
      }

      cursor = nextCursor;
    }

    return null;
  }

  private buildExecutionSuccessOutcome(
    company: CompanyExecutionRecord,
    linkedRecord: VinculoRecord,
    externalCompany: NormalizedExternalCompany,
    parcelamentosCount: number
  ): Extract<ExecutionOutcome, { success: true }> {
    const integrationObservacoes = [
      `Ultima validacao confiavel Acessorias em ${company.razaoSocial}.`,
      `Vinculo externo ${linkedRecord.acessoriasEmpresaId} confirmado para o CNPJ ${company.cnpj}.`,
      `${parcelamentosCount} parcelamento(s) retornaram da leitura atual.`
    ].join(' ');

    return {
      details: [
        `Empresa interna ${company.razaoSocial} validada com a empresa externa ${externalCompany.nomeExterno}.`,
        `Vinculo Acessorias ${linkedRecord.acessoriasEmpresaId} confirmado para o CNPJ ${company.cnpj}.`,
        `${parcelamentosCount} parcelamento(s) lidos na execucao atual.`
      ].join(' '),
      externalCompany,
      integrationMessage: `Execucao Acessorias concluida com vinculo validado para ${company.razaoSocial}.`,
      integrationObservacoes,
      logDetails: [
        `Vinculo externo ${externalCompany.acessoriasEmpresaId} localizado.`,
        `CNPJ conferido: ${externalCompany.cnpjExterno ?? 'nao informado'}.`,
        `${parcelamentosCount} parcelamento(s) lidos.`
      ].join(' '),
      logSummary: `Execucao Acessorias concluida: ${company.razaoSocial}`,
      statusIntegracao: StatusIntegracao.ATIVA,
      success: true
    };
  }

  private mergeExecutionSuccessOutcome(
    outcome: Extract<ExecutionOutcome, { success: true }>,
    parcelamentoSync: ParcelamentoSyncResult
  ): Extract<ExecutionOutcome, { success: true }> {
    return {
      ...outcome,
      details: parcelamentoSync.resumoResultado,
      integrationMessage: parcelamentoSync.resumoResultado,
      integrationObservacoes: [
        outcome.integrationObservacoes,
        `${parcelamentoSync.activeCount} parcelamento(s) ativo(s) confirmados.`,
        parcelamentoSync.actionableCount > 0
          ? `${parcelamentoSync.actionableCount} parcelamento(s) exigem acao.`
          : 'Sem parcelamento acionavel na leitura atual.'
      ].join(' '),
      logDetails: [outcome.logDetails, parcelamentoSync.logDetails].join(' '),
      logSummary: parcelamentoSync.logSummary
    };
  }

  private buildExecutionFailureOutcomeFromError(
    company: CompanyExecutionRecord,
    linkedRecord: VinculoRecord | null,
    error: unknown
  ): Extract<ExecutionOutcome, { success: false }> {
    const message = this.normalizeErrorMessage(error);
    const lowerCaseMessage = message.toLowerCase();

    if (
      lowerCaseMessage.includes('acessorias_parcelamentos_url') &&
      (lowerCaseMessage.includes('nao configurada') ||
        lowerCaseMessage.includes('invalida'))
    ) {
      return this.buildExecutionFailureOutcome(
        'SEM_CONFIGURACAO',
        company,
        linkedRecord,
        message
      );
    }

    if (
      lowerCaseMessage.includes('parcelamentos') &&
      (lowerCaseMessage.includes('json valido') ||
        lowerCaseMessage.includes('lista reconhecivel') ||
        lowerCaseMessage.includes('inconclusivo'))
    ) {
      return this.buildExecutionFailureOutcome(
        'RETORNO_INCONCLUSIVO',
        company,
        linkedRecord,
        message
      );
    }

    return this.buildExecutionFailureOutcome(
      'FALHA_CONEXAO',
      company,
      linkedRecord,
      message
    );
  }

  private buildExecutionFailureOutcome(
    reason: ExecutionFailureReason,
    company: CompanyExecutionRecord,
    linkedRecord: VinculoRecord | null,
    message: string
  ): Extract<ExecutionOutcome, { success: false }> {
    const normalizedMessage =
      this.normalizeText(message, 'Falha na execucao Acessorias da empresa.');
    const actionRequired = this.shouldCreateExecutionPendencia(reason);
    const pendingTitle = actionRequired
      ? this.buildExecutionPendingTitle(reason)
      : null;
    const pendingDescription = actionRequired
      ? [
          normalizedMessage,
          `Empresa: ${company.razaoSocial}.`,
          linkedRecord?.acessoriasEmpresaId
            ? `Vinculo externo: ${linkedRecord.acessoriasEmpresaId}.`
            : 'Sem vinculo externo confirmado.',
          'Revisar o vinculo, o CNPJ e a disponibilidade da origem externa.'
        ].join(' ')
      : null;

    return {
      actionRequired,
      details: normalizedMessage,
      integrationMessage: normalizedMessage,
      logDetails: [
        normalizedMessage,
        `Motivo tecnico: ${reason}.`,
        linkedRecord?.acessoriasEmpresaId
          ? `Vinculo Acessorias ${linkedRecord.acessoriasEmpresaId}.`
          : 'Nenhum vinculo Acessorias valido localizado.'
      ].join(' '),
      logSummary: `Execucao Acessorias com falha: ${company.razaoSocial}`,
      pendingDescription,
      pendingTitle,
      reason,
      statusIntegracao: this.resolveExecutionFailureStatus(reason),
      success: false
    };
  }

  private buildExecutionPendingTitle(reason: ExecutionFailureReason): string {
    switch (reason) {
      case 'SEM_CONFIGURACAO':
        return 'Configurar Acessorias para a empresa';
      case 'SEM_VINCULO':
      case 'VINCULO_INVALIDO':
        return 'Vincular empresa ao Acessorias';
      case 'EMPRESA_EXTERNA_AUSENTE':
        return 'Sincronizar empresa Acessorias';
      case 'RETORNO_INCONCLUSIVO':
        return 'Conferir retorno Acessorias';
      case 'CNPJ_INCONSISTENTE':
        return 'Revisar vinculo Acessorias';
      case 'FALHA_CONEXAO':
      default:
        return 'Verificar acesso Acessorias';
    }
  }

  private resolveExecutionFailureStatus(
    reason: ExecutionFailureReason
  ): 'ERRO' | 'NECESSITA_CONFERENCIA' {
    switch (reason) {
      case 'EMPRESA_EXTERNA_AUSENTE':
      case 'RETORNO_INCONCLUSIVO':
      case 'FALHA_CONEXAO':
        return StatusIntegracao.NECESSITA_CONFERENCIA;
      case 'SEM_CONFIGURACAO':
      case 'SEM_VINCULO':
      case 'VINCULO_INVALIDO':
      case 'CNPJ_INCONSISTENTE':
      default:
        return StatusIntegracao.ERRO;
    }
  }

  private shouldCreateExecutionPendencia(
    reason: ExecutionFailureReason
  ): boolean {
    return reason !== 'FALHA_CONEXAO';
  }

  private async createExecutionPendencia(
    client: Prisma.TransactionClient,
    company: CompanyExecutionRecord,
    outcome: Extract<ExecutionOutcome, { success: false }>,
    finishedAt: Date
  ): Promise<{ id: string }> {
    const existing = await client.pendencia.findFirst({
      select: {
        id: true
      },
      where: {
        empresaId: company.id,
        origem: ACESSORIAS_EXECUTION_PENDING_ORIGIN,
        status: StatusPendencia.ABERTA,
        tipo: TipoPendencia.OPERACIONAL
      }
    });

    if (existing) {
      return existing;
    }

    return await client.pendencia.create({
      data: {
        abertaEm: finishedAt,
        descricao:
          outcome.pendingDescription ??
          'Execucao Acessorias exige conferencia operacional.',
        empresaId: company.id,
        origem: ACESSORIAS_EXECUTION_PENDING_ORIGIN,
        prioridade: PrioridadePendencia.ALTA,
        responsavelInternoId: company.responsavelInternoId,
        status: StatusPendencia.ABERTA,
        tipo: TipoPendencia.OPERACIONAL,
        titulo: outcome.pendingTitle ?? 'Conferir execucao Acessorias'
      },
      select: {
        id: true
      }
    });
  }

  private async createParcelamentoPendencia(
    client: Prisma.TransactionClient,
    company: CompanyExecutionRecord,
    syncResult: ParcelamentoSyncResult,
    finishedAt: Date
  ): Promise<{ id: string }> {
    const existing = await client.pendencia.findFirst({
      select: {
        id: true
      },
      where: {
        empresaId: company.id,
        origem: ACESSORIAS_PARCELAMENTO_PENDING_ORIGIN,
        status: StatusPendencia.ABERTA,
        tipo: TipoPendencia.OPERACIONAL
      }
    });

    if (existing) {
      return existing;
    }

    return await client.pendencia.create({
      data: {
        abertaEm: finishedAt,
        descricao:
          syncResult.pendingDescription ??
          'Parcelamentos exigem conferencia operacional.',
        empresaId: company.id,
        origem: ACESSORIAS_PARCELAMENTO_PENDING_ORIGIN,
        prioridade: PrioridadePendencia.ALTA,
        responsavelInternoId: company.responsavelInternoId,
        status: StatusPendencia.ABERTA,
        tipo: TipoPendencia.OPERACIONAL,
        titulo: syncResult.pendingTitle ?? 'Conferir parcelamentos da empresa'
      },
      select: {
        id: true
      }
    });
  }

  private async upsertCompanyIntegrationState(
    client: Prisma.TransactionClient,
    companyId: string,
    finishedAt: Date,
    outcome: ExecutionOutcome
  ): Promise<CompanyIntegrationRecord> {
    const existing = await client.integracaoEmpresa.findFirst({
      select: companyIntegrationSelect,
      orderBy: {
        updatedAt: 'desc'
      },
      where: {
        empresaId: companyId,
        tipoIntegracao: TipoIntegracao.API
      }
    });

    const data = {
      empresaId: companyId,
      mensagemErroAtual: outcome.success ? null : outcome.integrationMessage,
      observacoes: outcome.success
        ? outcome.integrationObservacoes
        : existing?.observacoes ?? null,
      statusIntegracao: outcome.statusIntegracao,
      tipoIntegracao: TipoIntegracao.API,
      ultimaExecucaoEm: finishedAt,
      ultimoErroEm: outcome.success
        ? existing?.ultimoErroEm ?? null
        : finishedAt,
      ultimoSucessoEm: outcome.success
        ? finishedAt
        : existing?.ultimoSucessoEm ?? null
    };

    if (existing) {
      return await client.integracaoEmpresa.update({
        data,
        select: companyIntegrationSelect,
        where: {
          id: existing.id
        }
      });
    }

    return await client.integracaoEmpresa.create({
      data: {
        ...data
      },
      select: companyIntegrationSelect
    });
  }

  private mapIntegrationRecord(
    record: CompanyIntegrationRecord
  ): AcessoriasCompanyExecutionIntegrationView {
    return {
      createdAt: record.createdAt.toISOString(),
      empresaId: record.empresaId,
      id: record.id,
      mensagemErroAtual: record.mensagemErroAtual,
      observacoes: record.observacoes,
      statusIntegracao: record.statusIntegracao,
      tipoIntegracao: record.tipoIntegracao,
      ultimaExecucaoEm: record.ultimaExecucaoEm?.toISOString() ?? null,
      updatedAt: record.updatedAt.toISOString(),
      ultimoErroEm: record.ultimoErroEm?.toISOString() ?? null,
      ultimoSucessoEm: record.ultimoSucessoEm?.toISOString() ?? null
    };
  }

  private mapExecutionVarredura(
    record: {
      createdAt: Date;
      empresaId: string;
      finalizadoEm: Date | null;
      id: string;
      iniciadoEm: Date;
      resumoResultado: string | null;
      statusExecucao: StatusExecucaoVarredura;
      tipoVarredura: TipoVarredura;
      updatedAt: Date;
    }
  ): AcessoriasCompanyExecutionVarreduraView {
    return {
      createdAt: record.createdAt.toISOString(),
      empresaId: record.empresaId,
      finalizadoEm: record.finalizadoEm?.toISOString() ?? null,
      id: record.id,
      iniciadoEm: record.iniciadoEm.toISOString(),
      resumoResultado: record.resumoResultado,
      statusExecucao: record.statusExecucao,
      tipoVarredura: record.tipoVarredura,
      updatedAt: record.updatedAt.toISOString()
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

  private normalizeExternalParcelamentos(
    rawItems: AcessoriasParcelamentoExternalRaw[]
  ): NormalizedExternalParcelamento[] {
    if (rawItems.length === 0) {
      return [];
    }

    const normalizedItems: NormalizedExternalParcelamento[] = [];
    const seenReferences = new Set<string>();

    for (const rawItem of rawItems) {
      const referenciaExterna = this.normalizeIdentifier(
        rawItem.id ??
          rawItem.parcelamentoId ??
          rawItem.codigo ??
          rawItem.referencia
      );
      const modalidade = this.normalizeText(
        rawItem.modalidade ?? rawItem.tipo ?? rawItem.descricao,
        ''
      );
      const situacao = this.normalizeText(rawItem.situacao ?? rawItem.status, '');
      const quantidadeParcelas = readNullableInteger(
        rawItem.quantidadeParcelas ?? rawItem.totalParcelas
      );
      const parcelaAtual = readNullableInteger(
        rawItem.parcelaAtual ?? rawItem.numeroParcelaAtual
      );
      const dataVencimentoRelevante = readNullableDate(
        rawItem.dataVencimentoRelevante ??
          rawItem.dataVencimento ??
          rawItem.proximoVencimento
      );
      const indicioAtraso =
        readBooleanFlag(
          rawItem.indicioAtraso ?? rawItem.emAtraso ?? rawItem.atrasado
        ) ?? /atras|vencid/i.test(situacao);
      const requerAcao =
        readBooleanFlag(rawItem.requerAcao) ?? indicioAtraso;

      if (
        !referenciaExterna ||
        !modalidade ||
        !situacao ||
        seenReferences.has(referenciaExterna)
      ) {
        throw new Error(
          'Retorno Acessorias inconclusivo para parcelamentos da empresa.'
        );
      }

      seenReferences.add(referenciaExterna);
      normalizedItems.push({
        dataVencimentoRelevante,
        indicioAtraso,
        modalidade,
        parcelaAtual,
        quantidadeParcelas,
        referenciaExterna,
        requerAcao,
        situacao
      });
    }

    return normalizedItems;
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

function readNullableInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    throw new Error('Retorno Acessorias inconclusivo para parcelamentos da empresa.');
  }

  const normalized = value.trim();

  if (!/^-?\d+$/.test(normalized)) {
    throw new Error('Retorno Acessorias inconclusivo para parcelamentos da empresa.');
  }

  return Number.parseInt(normalized, 10);
}

function readNullableDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value !== 'string') {
    throw new Error('Retorno Acessorias inconclusivo para parcelamentos da empresa.');
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Retorno Acessorias inconclusivo para parcelamentos da empresa.');
  }

  return date;
}

function readBooleanFlag(value: unknown): boolean | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value !== 'string') {
    throw new Error('Retorno Acessorias inconclusivo para parcelamentos da empresa.');
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'sim', 's', 'true', 'yes'].includes(normalized)) {
    return true;
  }

  if (['0', 'nao', 'n', 'false', 'no'].includes(normalized)) {
    return false;
  }

  throw new Error('Retorno Acessorias inconclusivo para parcelamentos da empresa.');
}
