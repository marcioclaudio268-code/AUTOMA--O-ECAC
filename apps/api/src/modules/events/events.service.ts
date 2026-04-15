import { Injectable } from '@nestjs/common';
import { Prisma, TipoEventoOperacional } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { buildOperationalEventDescription } from './operational-signals';
import type {
  EventoOperacionalRecord,
  ManualScanEventInput
} from './events.types';

type EventWriteClient = Prisma.TransactionClient;

function readStateSignature(metadata: Prisma.JsonValue | null | undefined) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const signature = (metadata as { stateSignature?: unknown }).stateSignature;

  return typeof signature === 'string' && signature.trim().length > 0
    ? signature
    : null;
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async recordManualScanOutcome(
    client: EventWriteClient,
    input: ManualScanEventInput
  ): Promise<EventoOperacionalRecord | null> {
    const lastEvent = await client.eventoOperacional.findFirst({
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        metadata: true
      },
      where: {
        empresaId: input.companyId
      }
    });

    const previousStateSignature = readStateSignature(lastEvent?.metadata);
    const hasFindings = input.findings.length > 0;
    const hasStateChange =
      previousStateSignature !== null &&
      previousStateSignature !== input.stateSnapshot.signature;

    if (!hasFindings && !hasStateChange) {
      return null;
    }

    const createdEvent = await client.eventoOperacional.create({
      data: {
        descricao: buildOperationalEventDescription(input.findings),
        empresaId: input.companyId,
        metadata: {
          findings: input.findings,
          previousStateSignature,
          resumoResultado: input.resumoResultado,
          stateSignature: input.stateSnapshot.signature,
          stateSnapshot: input.stateSnapshot
        },
        tipoEvento:
          input.findings.length > 0
            ? TipoEventoOperacional.VARREDURA_RELEVANTE
            : TipoEventoOperacional.MUDANCA_ESTADO,
        varreduraId: input.varreduraId
      }
    });

    await client.empresa.update({
      data: {
        ultimoEventoRelevanteEm: createdEvent.createdAt
      },
      where: {
        id: input.companyId
      }
    });

    return createdEvent;
  }

  async listRecent(
    companyId: string,
    take = 5
  ): Promise<EventoOperacionalRecord[]> {
    return this.prisma.eventoOperacional.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take,
      where: {
        empresaId: companyId
      }
    });
  }
}
