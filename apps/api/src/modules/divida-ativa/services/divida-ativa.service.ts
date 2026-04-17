import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  PrioridadePendencia,
  ResultadoLogExecucao,
  StatusAcessoriasEmpresaVinculo,
  StatusExecucaoVarredura,
  StatusIntegracao,
  StatusPendencia,
  TipoEventoOperacional,
  TipoIntegracao,
  TipoLogExecucao,
  TipoPendencia,
  TipoVarredura
} from '@prisma/client';

import { isBasicCnpj, normalizeCnpj } from '../../../common/utils/cnpj';
import { PrismaService } from '../../../prisma/prisma.service';
import { LogsService } from '../../logs/logs.service';
import { AcessoriasConfigService } from '../../integrations/acessorias/services/acessorias-config.service';
import { AcessoriasConnectorService } from '../../integrations/acessorias/services/acessorias-connector.service';
import type {
  AcessoriasCompanyExternalRaw,
  AcessoriasDividaAtivaExternalRaw
} from '../../integrations/acessorias/acessorias.types';
import type {
  DividaAtivaChangeView,
  DividaAtivaExecutionIntegrationView,
  DividaAtivaExecutionResponse,
  DividaAtivaExecutionVarreduraView,
  DividaAtivaSnapshotInput,
  DividaAtivaSyncResult
} from '../divida-ativa.types';

type CompanyExecutionRecord = Prisma.EmpresaGetPayload<{
  select: typeof companyExecutionSelect;
}>;

type CompanyIntegrationRecord = Prisma.IntegracaoEmpresaGetPayload<{
  select: typeof companyIntegrationSelect;
}>;

type VinculoRecord = Prisma.AcessoriasEmpresaVinculoGetPayload<{
  include: typeof vinculoInclude;
}>;

type DividaAtivaRecord = Prisma.DividaAtivaGetPayload<{
  select: typeof dividaAtivaSelect;
}>;

type NormalizedExternalCompany = {
  acessoriasEmpresaId: string;
  cnpjExterno: string | null;
  normalizedCnpj: string | null;
  nomeExterno: string;
};

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

type SyncInput = {
  companyCnpj: string;
  companyId: string;
  companyName: string;
  snapshots: DividaAtivaSnapshotInput[];
  syncedAt: Date;
};

type ChangeAccumulator = {
  changes: DividaAtivaChangeView[];
  createdCount: number;
  deactivatedCount: number;
  updatedCount: number;
};

const MAX_COMPANY_PAGES = 25;
const MAX_PENDING_ITEMS = 3;
const DIVIDA_ATIVA_PENDING_ORIGIN = 'DIVIDA_ATIVA_EXECUCAO_EMPRESA';

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
    select: {
      cnpj: true,
      id: true,
      nomeFantasia: true,
      razaoSocial: true
    }
  }
} as const;

const dividaAtivaSelect = {
  ativo: true,
  createdAt: true,
  dataInscricao: true,
  empresaId: true,
  id: true,
  numeroInscricao: true,
  referenciaExterna: true,
  requerAcao: true,
  situacao: true,
  tipoDivida: true,
  ultimaAtualizacaoEm: true,
  updatedAt: true
} as const;

@Injectable()
export class DividaAtivaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: AcessoriasConfigService,
    private readonly connectorService: AcessoriasConnectorService,
    private readonly logsService: LogsService
  ) {}

  async executeCompany(
    empresaId: string,
    executadoPorUsuarioInternoId?: string | null
  ): Promise<DividaAtivaExecutionResponse> {
    const company = await this.prisma.empresa.findUnique({
      select: companyExecutionSelect,
      where: { id: empresaId }
    });

    if (!company) {
      throw new NotFoundException('Empresa interna nao encontrada.');
    }

    const linkedRecord = await this.prisma.acessoriasEmpresaVinculo.findFirst({
      include: vinculoInclude,
      orderBy: { updatedAt: 'desc' },
      where: { empresaId }
    });

    const startedAt = new Date();
    let outcome: ExecutionOutcome;
    let normalizedSnapshots: DividaAtivaSnapshotInput[] = [];

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
        linkedRecord.statusVinculo !== StatusAcessoriasEmpresaVinculo.VINCULADA ||
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
        } else if (externalCompany.normalizedCnpj !== company.cnpj) {
          outcome = this.buildExecutionFailureOutcome(
            'CNPJ_INCONSISTENTE',
            company,
            linkedRecord,
            'Vinculo Acessorias inconsistente com o CNPJ da empresa.'
          );
        } else {
          const externalResponse = await this.connectorService.fetchDividaAtiva(
            token,
            {
              acessoriasEmpresaId: linkedRecord.acessoriasEmpresaId,
              cnpj: company.cnpj
            }
          );

          normalizedSnapshots = this.normalizeExternalDividaAtiva(
            externalResponse.items
          );
          outcome = this.buildExecutionSuccessOutcome(
            company,
            linkedRecord,
            externalCompany,
            normalizedSnapshots
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
      let syncResult: DividaAtivaSyncResult | null = null;

      if (outcome.success) {
        syncResult = await this.syncCompanyDividaAtiva(client, {
          companyCnpj: company.cnpj,
          companyId: company.id,
          companyName: company.razaoSocial,
          snapshots: normalizedSnapshots,
          syncedAt: finishedAt
        });
      }

      const varredura = await client.varredura.create({
        data: {
          empresaId: company.id,
          finalizadoEm: finishedAt,
          iniciadoEm: startedAt,
          resumoResultado: outcome.success
            ? syncResult?.resumoResultado ?? outcome.details
            : outcome.details,
          statusExecucao: outcome.success
            ? StatusExecucaoVarredura.CONCLUIDA
            : StatusExecucaoVarredura.FALHA,
          tipoVarredura: TipoVarredura.DIVIDA_ATIVA
        }
      });

      const integration = await this.upsertCompanyIntegrationState(
        client,
        company.id,
        finishedAt,
        outcome,
        syncResult
      );

      let pendenciaId: string | null = null;
      let ultimoEventoRelevanteEm: Date | null = null;
      let marcarPendenciaOperacional = false;

      if (!outcome.success) {
        if (outcome.actionRequired) {
          const pendencia = await this.createOperationalPendencia(
            client,
            company,
            outcome.pendingTitle ?? 'Conferir divida ativa da empresa',
            outcome.pendingDescription ?? 'Divida ativa exige conferencia operacional.',
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
              companyCnpj: company.cnpj,
              companyId: company.id,
              companyName: company.razaoSocial,
              integrationStatus: outcome.statusIntegracao,
              integrationType: 'DIVIDA_ATIVA',
              linkedAcessoriasEmpresaId: linkedRecord?.acessoriasEmpresaId ?? null,
              reason: outcome.reason
            },
            tipoEvento: TipoEventoOperacional.VARREDURA_RELEVANTE,
            varreduraId: varredura.id
          }
        });

        ultimoEventoRelevanteEm = event.createdAt;
      } else if (
        syncResult?.hasRelevantChange &&
        syncResult.eventDescription &&
        syncResult.eventType
      ) {
        const event = await client.eventoOperacional.create({
          data: {
            descricao: syncResult.eventDescription,
            empresaId: company.id,
            metadata: {
              ...syncResult.eventMetadata,
              integrationType: 'DIVIDA_ATIVA',
              linkedAcessoriasEmpresaId: linkedRecord?.acessoriasEmpresaId ?? null
            },
            tipoEvento: syncResult.eventType,
            varreduraId: varredura.id
          }
        });

        ultimoEventoRelevanteEm = event.createdAt;
      }

      if (outcome.success && syncResult?.pendingRequired) {
        const pendencia = await this.createOperationalPendencia(
          client,
          company,
          syncResult.pendingTitle ?? 'Conferir divida ativa da empresa',
          syncResult.pendingDescription ?? 'Divida ativa exige conferencia operacional.',
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
        where: { id: company.id }
      });

      await this.logsService.recordExecution(client, {
        empresaId: company.id,
        executadoEm: finishedAt,
        executadoPorUsuarioInternoId,
        pendenciaId,
        resultado: outcome.success
          ? syncResult?.hasRelevantChange
            ? ResultadoLogExecucao.SUCESSO
            : ResultadoLogExecucao.SEM_ALTERACAO
          : ResultadoLogExecucao.FALHA,
        resumo: outcome.logSummary,
        detalhes: outcome.logDetails,
        tipo: TipoLogExecucao.CONFERENCIA_OPERACIONAL
      });

      const summary = outcome.success
        ? {
            activeCount: syncResult?.activeCount ?? 0,
            actionableCount: syncResult?.actionableCount ?? 0,
            createdCount: syncResult?.createdCount ?? 0,
            deactivatedCount: syncResult?.deactivatedCount ?? 0,
            semOcorrencia: syncResult?.semOcorrencia ?? false,
            updatedCount: syncResult?.updatedCount ?? 0
          }
        : this.emptySummary();

      return {
        integration: this.mapIntegrationRecord(integration),
        message: outcome.success
          ? syncResult?.resumoResultado ?? outcome.integrationMessage
          : outcome.integrationMessage,
        success: outcome.success,
        summary,
        varredura: this.mapVarreduraRecord(varredura)
      };
    });
  }

  private async syncCompanyDividaAtiva(
    client: Prisma.TransactionClient,
    input: SyncInput
  ): Promise<DividaAtivaSyncResult> {
    const existing = await client.dividaAtiva.findMany({
      orderBy: [{ tipoDivida: 'asc' }, { createdAt: 'asc' }],
      select: dividaAtivaSelect,
      where: { empresaId: input.companyId }
    });
    const existingByReference = new Map(
      existing.map((item) => [item.referenciaExterna, item])
    );
    const seenReferences = new Set<string>();
    const changeAccumulator: ChangeAccumulator = {
      changes: [],
      createdCount: 0,
      deactivatedCount: 0,
      updatedCount: 0
    };

    for (const snapshot of input.snapshots) {
      seenReferences.add(snapshot.referenciaExterna);
      const current = existingByReference.get(snapshot.referenciaExterna);

      if (!current) {
        await client.dividaAtiva.create({
          data: {
            ativo: true,
            dataInscricao: snapshot.dataInscricao,
            empresaId: input.companyId,
            numeroInscricao: snapshot.numeroInscricao,
            referenciaExterna: snapshot.referenciaExterna,
            requerAcao: snapshot.requerAcao,
            situacao: snapshot.situacao,
            tipoDivida: snapshot.tipoDivida,
            ultimaAtualizacaoEm: input.syncedAt
          }
        });

        changeAccumulator.createdCount += 1;
        changeAccumulator.changes.push({
          referenciaExterna: snapshot.referenciaExterna,
          resumo: `Nova divida ativa ${snapshot.tipoDivida} identificada em ${snapshot.situacao}.`,
          situacaoAtual: snapshot.situacao,
          tipo: 'CRIADA'
        });
        continue;
      }

      const fieldChanges = this.describeFieldChanges(current, snapshot);
      const wasInactive = !current.ativo;
      const hasRelevantChange = wasInactive || fieldChanges.length > 0;

      await client.dividaAtiva.update({
        data: {
          ativo: true,
          dataInscricao: snapshot.dataInscricao,
          numeroInscricao: snapshot.numeroInscricao,
          requerAcao: snapshot.requerAcao,
          situacao: snapshot.situacao,
          tipoDivida: snapshot.tipoDivida,
          ultimaAtualizacaoEm: input.syncedAt
        },
        where: { id: current.id }
      });

      if (!hasRelevantChange) {
        continue;
      }

      changeAccumulator.updatedCount += 1;
      changeAccumulator.changes.push({
        referenciaExterna: snapshot.referenciaExterna,
        resumo: wasInactive
          ? `Divida ativa ${snapshot.tipoDivida} voltou a aparecer em ${snapshot.situacao}.`
          : `Divida ativa ${snapshot.tipoDivida} atualizada: ${fieldChanges.join(' ')}`,
        situacaoAtual: snapshot.situacao,
        tipo: wasInactive ? 'REATIVADA' : 'ATUALIZADA'
      });
    }

    for (const current of existing) {
      if (!current.ativo || seenReferences.has(current.referenciaExterna)) {
        continue;
      }

      await client.dividaAtiva.update({
        data: {
          ativo: false,
          ultimaAtualizacaoEm: input.syncedAt
        },
        where: { id: current.id }
      });

      changeAccumulator.deactivatedCount += 1;
      changeAccumulator.changes.push({
        referenciaExterna: current.referenciaExterna,
        resumo: `Divida ativa ${current.tipoDivida} deixou de constar no retorno atual.`,
        situacaoAtual: current.situacao,
        tipo: 'DESATIVADA'
      });
    }

    const activeItems = await client.dividaAtiva.findMany({
      orderBy: [
        { requerAcao: 'desc' },
        { dataInscricao: 'asc' },
        { tipoDivida: 'asc' },
        { numeroInscricao: 'asc' }
      ],
      select: dividaAtivaSelect,
      where: {
        ativo: true,
        empresaId: input.companyId
      }
    });
    const actionableItems = activeItems.filter((item) => item.requerAcao);
    const hasRelevantChange = changeAccumulator.changes.length > 0;

    return {
      activeCount: activeItems.length,
      actionableCount: actionableItems.length,
      changes: changeAccumulator.changes,
      createdCount: changeAccumulator.createdCount,
      deactivatedCount: changeAccumulator.deactivatedCount,
      eventDescription: hasRelevantChange
        ? this.buildEventDescription(
            input.companyName,
            changeAccumulator.changes,
            actionableItems.length
          )
        : null,
      eventMetadata: hasRelevantChange
        ? {
            actionableCount: actionableItems.length,
            activeCount: activeItems.length,
            changes: changeAccumulator.changes,
            companyCnpj: input.companyCnpj,
            companyId: input.companyId,
            companyName: input.companyName
          }
        : null,
      eventType: hasRelevantChange
        ? actionableItems.length > 0
          ? TipoEventoOperacional.VARREDURA_RELEVANTE
          : TipoEventoOperacional.MUDANCA_ESTADO
        : null,
      hasRelevantChange,
      logDetails: this.buildLogDetails(
        input.companyName,
        changeAccumulator,
        activeItems.length,
        actionableItems.length
      ),
      logSummary: this.buildLogSummary(
        input.companyName,
        activeItems.length,
        actionableItems.length
      ),
      pendingDescription: actionableItems.length
        ? this.buildPendingDescription(input.companyName, actionableItems)
        : null,
      pendingRequired: actionableItems.length > 0,
      pendingTitle: actionableItems.length
        ? 'Conferir divida ativa da empresa'
        : null,
      resumoResultado: this.buildResumoResultado(
        input.companyName,
        activeItems.length,
        actionableItems.length,
        changeAccumulator
      ),
      semOcorrencia: activeItems.length === 0,
      snapshots: input.snapshots,
      updatedCount: changeAccumulator.updatedCount
    };
  }
  private buildExecutionSuccessOutcome(
    company: CompanyExecutionRecord,
    linkedRecord: VinculoRecord,
    externalCompany: NormalizedExternalCompany,
    snapshots: DividaAtivaSnapshotInput[]
  ): Extract<ExecutionOutcome, { success: true }> {
    const activeCount = snapshots.length;
    const actionableCount = snapshots.filter((item) => item.requerAcao).length;
    const semOcorrencia = activeCount === 0;

    return {
      details: semOcorrencia
        ? `Sem ocorrencia de divida ativa para ${company.razaoSocial}.`
        : `Divida ativa lida para ${company.razaoSocial}: ${activeCount} item(ns) identificado(s).`,
      externalCompany,
      integrationMessage: semOcorrencia
        ? `Sem ocorrencia de divida ativa para ${company.razaoSocial}.`
        : `Leitura de divida ativa concluida para ${company.razaoSocial}.`,
      integrationObservacoes: [
        `Ultima validacao confiavel de divida ativa em ${company.razaoSocial}.`,
        `Vinculo externo ${linkedRecord.acessoriasEmpresaId} confirmado para o CNPJ ${company.cnpj}.`,
        `${activeCount} registro(s) lido(s) na execucao atual.`,
        actionableCount > 0
          ? `${actionableCount} item(ns) exigem acao humana.`
          : 'Sem item acionavel na leitura atual.'
      ].join(' '),
      logDetails: [
        `Vinculo externo ${externalCompany.acessoriasEmpresaId} localizado.`,
        `CNPJ conferido: ${externalCompany.cnpjExterno ?? 'nao informado'}.`,
        semOcorrencia
          ? 'Sem ocorrencia de divida ativa na leitura atual.'
          : `${activeCount} registro(s) de divida ativa lidos.`
      ].join(' '),
      logSummary: `Execucao divida ativa concluida: ${company.razaoSocial}`,
      statusIntegracao: StatusIntegracao.ATIVA,
      success: true
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
      lowerCaseMessage.includes('acessorias_divida_ativa_url') &&
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
      lowerCaseMessage.includes('lista reconhecivel') ||
      lowerCaseMessage.includes('sem lista') ||
      lowerCaseMessage.includes('inconclusivo')
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
    const normalizedMessage = this.normalizeText(
      message,
      'Falha na execucao da divida ativa da empresa.'
    );
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
          'Revisar o vinculo, a configuracao e a disponibilidade da origem externa.'
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
      logSummary: `Execucao divida ativa com falha: ${company.razaoSocial}`,
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
        return 'Configurar Acessorias para a divida ativa';
      case 'SEM_VINCULO':
      case 'VINCULO_INVALIDO':
        return 'Vincular empresa ao Acessorias para divida ativa';
      case 'EMPRESA_EXTERNA_AUSENTE':
        return 'Sincronizar empresa Acessorias';
      case 'RETORNO_INCONCLUSIVO':
        return 'Conferir retorno de divida ativa';
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

  private shouldCreateExecutionPendencia(reason: ExecutionFailureReason): boolean {
    return reason !== 'FALHA_CONEXAO';
  }

  private async createOperationalPendencia(
    client: Prisma.TransactionClient,
    company: CompanyExecutionRecord,
    title: string,
    description: string,
    finishedAt: Date
  ): Promise<{ id: string }> {
    const existing = await client.pendencia.findFirst({
      select: { id: true },
      where: {
        empresaId: company.id,
        origem: DIVIDA_ATIVA_PENDING_ORIGIN,
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
        descricao: description,
        empresaId: company.id,
        origem: DIVIDA_ATIVA_PENDING_ORIGIN,
        prioridade: PrioridadePendencia.ALTA,
        responsavelInternoId: company.responsavelInternoId,
        status: StatusPendencia.ABERTA,
        tipo: TipoPendencia.OPERACIONAL,
        titulo: title
      },
      select: { id: true }
    });
  }

  private async upsertCompanyIntegrationState(
    client: Prisma.TransactionClient,
    companyId: string,
    finishedAt: Date,
    outcome: ExecutionOutcome,
    syncResult: DividaAtivaSyncResult | null
  ): Promise<CompanyIntegrationRecord> {
    const existing = await client.integracaoEmpresa.findFirst({
      select: companyIntegrationSelect,
      orderBy: { updatedAt: 'desc' },
      where: {
        empresaId: companyId,
        tipoIntegracao: TipoIntegracao.API
      }
    });

    const data = {
      empresaId: companyId,
      mensagemErroAtual: outcome.success ? null : outcome.integrationMessage,
      observacoes: outcome.success
        ? syncResult?.resumoResultado ?? outcome.integrationObservacoes
        : existing?.observacoes ?? null,
      statusIntegracao: outcome.statusIntegracao,
      tipoIntegracao: TipoIntegracao.API,
      ultimaExecucaoEm: finishedAt,
      ultimoErroEm: outcome.success ? existing?.ultimoErroEm ?? null : finishedAt,
      ultimoSucessoEm: outcome.success ? finishedAt : existing?.ultimoSucessoEm ?? null
    };

    if (existing) {
      return await client.integracaoEmpresa.update({
        data,
        select: companyIntegrationSelect,
        where: { id: existing.id }
      });
    }

    return await client.integracaoEmpresa.create({
      data,
      select: companyIntegrationSelect
    });
  }
  private mapIntegrationRecord(
    record: CompanyIntegrationRecord
  ): DividaAtivaExecutionIntegrationView {
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

  private mapVarreduraRecord(
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
  ): DividaAtivaExecutionVarreduraView {
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

  private normalizeExternalDividaAtiva(
    rawItems: AcessoriasDividaAtivaExternalRaw[]
  ): DividaAtivaSnapshotInput[] {
    if (rawItems.length === 0) {
      return [];
    }

    const normalizedItems: DividaAtivaSnapshotInput[] = [];
    const seenReferences = new Set<string>();

    for (const rawItem of rawItems) {
      const referenciaExterna = this.normalizeIdentifier(
        rawItem.id ??
          rawItem.codigo ??
          rawItem.referencia ??
          rawItem.inscricao ??
          rawItem.numeroInscricao
      );
      const numeroInscricao = this.normalizeText(
        rawItem.numeroInscricao ?? rawItem.inscricao ?? rawItem.codigo,
        ''
      );
      const tipoDivida = this.normalizeText(
        rawItem.tipo ?? rawItem.descricao,
        ''
      );
      const situacao = this.normalizeText(rawItem.situacao ?? rawItem.status, '');
      const dataInscricao = readNullableDate(rawItem.dataInscricao);
      const actionSignal = /atras|venc|cobr|ajuiz|execu|pend/i.test(
        situacao.toLowerCase()
      );
      const requerAcao =
        readBooleanFlag(
          rawItem.requerAcao ??
            rawItem.acaoNecessaria ??
            rawItem.necessidadeConferencia ??
            rawItem.pendente
        ) ?? actionSignal;

      if (
        !referenciaExterna ||
        !numeroInscricao ||
        !tipoDivida ||
        !situacao ||
        seenReferences.has(referenciaExterna)
      ) {
        throw new Error(
          'Retorno Acessorias inconclusivo para a divida ativa da empresa.'
        );
      }

      seenReferences.add(referenciaExterna);
      normalizedItems.push({
        dataInscricao,
        numeroInscricao,
        referenciaExterna,
        requerAcao,
        situacao,
        tipoDivida
      });
    }

    return normalizedItems;
  }

  private buildResumoResultado(
    companyName: string,
    activeCount: number,
    actionableCount: number,
    changeAccumulator: ChangeAccumulator
  ): string {
    const parts = [
      activeCount === 0
        ? `Sem ocorrencia de divida ativa para ${companyName}.`
        : `Divida ativa lida para ${companyName}: ${activeCount} item(ns) ativo(s).`
    ];

    if (changeAccumulator.changes.length > 0) {
      parts.push(`Mudancas relevantes: ${changeAccumulator.changes.length}.`);
    }

    if (actionableCount > 0) {
      parts.push(`${actionableCount} item(ns) exigem acao humana.`);
    }

    return parts.join(' ');
  }

  private buildLogSummary(
    companyName: string,
    activeCount: number,
    actionableCount: number
  ): string {
    return [
      `Execucao divida ativa: ${companyName}.`,
      activeCount === 0 ? 'Sem ocorrencia atual.' : `${activeCount} item(ns) ativos.`,
      actionableCount > 0
        ? `${actionableCount} exigem acao.`
        : 'Sem acao humana automatica.'
    ].join(' ');
  }

  private buildLogDetails(
    companyName: string,
    changeAccumulator: ChangeAccumulator,
    activeCount: number,
    actionableCount: number
  ): string {
    const parts = [
      `Divida ativa consolidada para ${companyName}.`,
      `Criados: ${changeAccumulator.createdCount}.`,
      `Atualizados: ${changeAccumulator.updatedCount}.`,
      `Desativados: ${changeAccumulator.deactivatedCount}.`,
      `Ativos: ${activeCount}.`,
      `Acionaveis: ${actionableCount}.`
    ];

    if (changeAccumulator.changes.length > 0) {
      parts.push(
        `Mudancas: ${changeAccumulator.changes.map((item) => item.resumo).join(' ')}`
      );
    }

    return parts.join(' ');
  }

  private buildEventDescription(
    companyName: string,
    changes: DividaAtivaChangeView[],
    actionableCount: number
  ): string {
    const parts = [
      `Mudancas de divida ativa detectadas em ${companyName}.`,
      changes.map((item) => item.resumo).join(' ')
    ];

    if (actionableCount > 0) {
      parts.push(
        `${actionableCount} item(ns) permanecem com necessidade de acao.`
      );
    }

    return parts.join(' ').trim();
  }

  private buildPendingDescription(
    companyName: string,
    actionableItems: DividaAtivaRecord[]
  ): string {
    const highlights = actionableItems.slice(0, MAX_PENDING_ITEMS).map((item) => {
      const suffix = item.dataInscricao
        ? ` inscricao em ${formatNullableDate(item.dataInscricao)}`
        : '';
      return `${item.tipoDivida} em ${item.situacao}${suffix}`;
    });

    return [
      `Divida ativa de ${companyName} exige conferencia operacional.`,
      `Itens em destaque: ${highlights.join('; ')}.`,
      actionableItems.length > MAX_PENDING_ITEMS
        ? `Outros ${actionableItems.length - MAX_PENDING_ITEMS} item(ns) tambem exigem acao.`
        : null
    ]
      .filter(Boolean)
      .join(' ');
  }

  private describeFieldChanges(
    current: DividaAtivaRecord,
    snapshot: DividaAtivaSnapshotInput
  ): string[] {
    const changes: string[] = [];

    if (current.numeroInscricao !== snapshot.numeroInscricao) {
      changes.push(
        `inscricao de ${current.numeroInscricao} para ${snapshot.numeroInscricao}.`
      );
    }

    if (current.tipoDivida !== snapshot.tipoDivida) {
      changes.push(`tipo de ${current.tipoDivida} para ${snapshot.tipoDivida}.`);
    }

    if (current.situacao !== snapshot.situacao) {
      changes.push(`situacao de ${current.situacao} para ${snapshot.situacao}.`);
    }

    if (!isSameDate(current.dataInscricao, snapshot.dataInscricao)) {
      changes.push(
        `data de inscricao de ${formatNullableDate(current.dataInscricao)} para ${formatNullableDate(snapshot.dataInscricao)}.`
      );
    }

    if (current.requerAcao !== snapshot.requerAcao) {
      changes.push(
        snapshot.requerAcao
          ? 'marcado como requer acao.'
          : 'marcado como sem acao imediata.'
      );
    }

    return changes;
  }

  private emptySummary() {
    return {
      activeCount: 0,
      actionableCount: 0,
      createdCount: 0,
      deactivatedCount: 0,
      semOcorrencia: true,
      updatedCount: 0
    };
  }

  private normalizeIdentifier(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeText(
    value: string | null | undefined,
    fallback: string
  ): string {
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
      : 'Falha inesperada na execucao da divida ativa.';
  }
}

function formatNullableDate(value: Date | null): string {
  return value ? value.toISOString() : 'sem data';
}

function isSameDate(left: Date | null, right: Date | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return left.getTime() === right.getTime();
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
    throw new Error('Retorno Acessorias inconclusivo para a divida ativa da empresa.');
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'sim', 's', 'true', 'yes'].includes(normalized)) {
    return true;
  }

  if (['0', 'nao', 'n', 'false', 'no'].includes(normalized)) {
    return false;
  }

  throw new Error('Retorno Acessorias inconclusivo para a divida ativa da empresa.');
}

function readNullableDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value !== 'string') {
    throw new Error('Retorno Acessorias inconclusivo para a divida ativa da empresa.');
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Retorno Acessorias inconclusivo para a divida ativa da empresa.');
  }

  return date;
}
