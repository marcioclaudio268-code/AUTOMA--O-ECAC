import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TipoEventoOperacional,
  type Parcelamento as ParcelamentoRecord
} from '@prisma/client';

import type {
  ParcelamentoChangeView,
  ParcelamentoSnapshotInput,
  ParcelamentoSyncResult
} from './parcelamentos.types';

type ParcelamentoWriteClient = Prisma.TransactionClient;

type SyncInput = {
  companyCnpj: string;
  companyId: string;
  companyName: string;
  snapshots: ParcelamentoSnapshotInput[];
  syncedAt: Date;
};

type ChangeAccumulator = {
  changes: ParcelamentoChangeView[];
  createdCount: number;
  deactivatedCount: number;
  updatedCount: number;
};

const MAX_PENDING_ITEMS = 3;

@Injectable()
export class ParcelamentosService {
  async syncCompanyParcelamentos(
    client: ParcelamentoWriteClient,
    input: SyncInput
  ): Promise<ParcelamentoSyncResult> {
    const existing = await client.parcelamento.findMany({
      orderBy: [
        {
          modalidade: 'asc'
        },
        {
          createdAt: 'asc'
        }
      ],
      where: {
        empresaId: input.companyId
      }
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
        await client.parcelamento.create({
          data: {
            ativo: true,
            dataVencimentoRelevante: snapshot.dataVencimentoRelevante,
            empresaId: input.companyId,
            indicioAtraso: snapshot.indicioAtraso,
            modalidade: snapshot.modalidade,
            parcelaAtual: snapshot.parcelaAtual,
            quantidadeParcelas: snapshot.quantidadeParcelas,
            referenciaExterna: snapshot.referenciaExterna,
            requerAcao: snapshot.requerAcao,
            situacao: snapshot.situacao,
            ultimaAtualizacaoEm: input.syncedAt
          }
        });

        changeAccumulator.createdCount += 1;
        changeAccumulator.changes.push({
          referenciaExterna: snapshot.referenciaExterna,
          resumo: `Novo parcelamento ${snapshot.modalidade} identificado em ${snapshot.situacao}.`,
          situacaoAtual: snapshot.situacao,
          tipo: 'CRIADO'
        });
        continue;
      }

      const fieldChanges = this.describeFieldChanges(current, snapshot);
      const wasInactive = !current.ativo;
      const hasRelevantChange = wasInactive || fieldChanges.length > 0;

      await client.parcelamento.update({
        data: {
          ativo: true,
          dataVencimentoRelevante: snapshot.dataVencimentoRelevante,
          indicioAtraso: snapshot.indicioAtraso,
          modalidade: snapshot.modalidade,
          parcelaAtual: snapshot.parcelaAtual,
          quantidadeParcelas: snapshot.quantidadeParcelas,
          requerAcao: snapshot.requerAcao,
          situacao: snapshot.situacao,
          ultimaAtualizacaoEm: input.syncedAt
        },
        where: {
          id: current.id
        }
      });

      if (!hasRelevantChange) {
        continue;
      }

      changeAccumulator.updatedCount += 1;
      changeAccumulator.changes.push({
        referenciaExterna: snapshot.referenciaExterna,
        resumo: wasInactive
          ? `Parcelamento ${snapshot.modalidade} voltou a aparecer em ${snapshot.situacao}.`
          : `Parcelamento ${snapshot.modalidade} atualizado: ${fieldChanges.join(' ')}`,
        situacaoAtual: snapshot.situacao,
        tipo: wasInactive ? 'REATIVADO' : 'ATUALIZADO'
      });
    }

    for (const current of existing) {
      if (!current.ativo || seenReferences.has(current.referenciaExterna)) {
        continue;
      }

      await client.parcelamento.update({
        data: {
          ativo: false,
          ultimaAtualizacaoEm: input.syncedAt
        },
        where: {
          id: current.id
        }
      });

      changeAccumulator.deactivatedCount += 1;
      changeAccumulator.changes.push({
        referenciaExterna: current.referenciaExterna,
        resumo: `Parcelamento ${current.modalidade} deixou de constar no retorno atual.`,
        situacaoAtual: current.situacao,
        tipo: 'DESATIVADO'
      });
    }

    const activeItems = await client.parcelamento.findMany({
      orderBy: [
        {
          requerAcao: 'desc'
        },
        {
          dataVencimentoRelevante: 'asc'
        },
        {
          modalidade: 'asc'
        }
      ],
      where: {
        ativo: true,
        empresaId: input.companyId
      }
    });
    const actionableItems = activeItems.filter(
      (item) => item.requerAcao || item.indicioAtraso
    );
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
        ? 'Conferir parcelamentos da empresa'
        : null,
      resumoResultado: this.buildResumoResultado(
        input.companyName,
        activeItems.length,
        actionableItems.length,
        changeAccumulator
      ),
      updatedCount: changeAccumulator.updatedCount
    };
  }

  private buildResumoResultado(
    companyName: string,
    activeCount: number,
    actionableCount: number,
    changeAccumulator: ChangeAccumulator
  ): string {
    const parts = [
      `Parcelamentos lidos para ${companyName}: ${activeCount} ativo(s).`
    ];

    if (changeAccumulator.changes.length > 0) {
      parts.push(
        `Mudancas relevantes: ${changeAccumulator.changes.length}.`
      );
    }

    if (actionableCount > 0) {
      parts.push(
        `${actionableCount} parcelamento(s) exigem acao humana.`
      );
    }

    return parts.join(' ');
  }

  private buildLogSummary(
    companyName: string,
    activeCount: number,
    actionableCount: number
  ): string {
    return [
      `Execucao Acessorias com parcelamentos: ${companyName}.`,
      `${activeCount} ativo(s).`,
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
      `Parcelamentos consolidados para ${companyName}.`,
      `Criados: ${changeAccumulator.createdCount}.`,
      `Atualizados: ${changeAccumulator.updatedCount}.`,
      `Desativados: ${changeAccumulator.deactivatedCount}.`,
      `Ativos: ${activeCount}.`,
      `Acionaveis: ${actionableCount}.`
    ];

    if (changeAccumulator.changes.length > 0) {
      parts.push(
        `Mudancas: ${changeAccumulator.changes
          .map((item) => item.resumo)
          .join(' ')}`
      );
    }

    return parts.join(' ');
  }

  private buildEventDescription(
    companyName: string,
    changes: ParcelamentoChangeView[],
    actionableCount: number
  ): string {
    const parts = [
      `Mudancas de parcelamento detectadas em ${companyName}.`,
      changes.map((item) => item.resumo).join(' ')
    ];

    if (actionableCount > 0) {
      parts.push(
        `${actionableCount} parcelamento(s) permanecem com necessidade de acao.`
      );
    }

    return parts.join(' ').trim();
  }

  private buildPendingDescription(
    companyName: string,
    actionableItems: ParcelamentoRecord[]
  ): string {
    const highlights = actionableItems
      .slice(0, MAX_PENDING_ITEMS)
      .map((item) => {
        const suffix = item.dataVencimentoRelevante
          ? ` com vencimento relevante em ${item.dataVencimentoRelevante.toISOString()}`
          : '';
        return `${item.modalidade} em ${item.situacao}${suffix}`;
      });

    return [
      `Parcelamentos de ${companyName} exigem conferencia operacional.`,
      `Itens em destaque: ${highlights.join('; ')}.`,
      actionableItems.length > MAX_PENDING_ITEMS
        ? `Outros ${actionableItems.length - MAX_PENDING_ITEMS} item(ns) tambem exigem acao.`
        : null
    ]
      .filter(Boolean)
      .join(' ');
  }

  private describeFieldChanges(
    current: ParcelamentoRecord,
    snapshot: ParcelamentoSnapshotInput
  ): string[] {
    const changes: string[] = [];

    if (current.modalidade !== snapshot.modalidade) {
      changes.push(
        `modalidade de ${current.modalidade} para ${snapshot.modalidade}.`
      );
    }

    if (current.situacao !== snapshot.situacao) {
      changes.push(
        `situacao de ${current.situacao} para ${snapshot.situacao}.`
      );
    }

    if (current.quantidadeParcelas !== snapshot.quantidadeParcelas) {
      changes.push(
        `quantidade de parcelas de ${formatNullableNumber(
          current.quantidadeParcelas
        )} para ${formatNullableNumber(snapshot.quantidadeParcelas)}.`
      );
    }

    if (current.parcelaAtual !== snapshot.parcelaAtual) {
      changes.push(
        `parcela atual de ${formatNullableNumber(
          current.parcelaAtual
        )} para ${formatNullableNumber(snapshot.parcelaAtual)}.`
      );
    }

    if (
      !isSameDate(
        current.dataVencimentoRelevante,
        snapshot.dataVencimentoRelevante
      )
    ) {
      changes.push(
        `vencimento relevante de ${formatNullableDate(
          current.dataVencimentoRelevante
        )} para ${formatNullableDate(snapshot.dataVencimentoRelevante)}.`
      );
    }

    if (current.indicioAtraso !== snapshot.indicioAtraso) {
      changes.push(
        snapshot.indicioAtraso
          ? 'indicacao de atraso ativada.'
          : 'indicacao de atraso removida.'
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
}

function formatNullableDate(value: Date | null): string {
  return value ? value.toISOString() : 'sem data';
}

function formatNullableNumber(value: number | null): string {
  return value === null ? 'sem informacao' : String(value);
}

function isSameDate(left: Date | null, right: Date | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return left.getTime() === right.getTime();
}
