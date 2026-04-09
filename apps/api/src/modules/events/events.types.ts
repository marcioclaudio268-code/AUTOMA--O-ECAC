import { Prisma } from '@prisma/client';

import type { OperationalStateSnapshot } from './operational-signals';

export type EventoOperacionalRecord = Prisma.EventoOperacionalGetPayload<{
  select: {
    createdAt: true;
    descricao: true;
    empresaId: true;
    id: true;
    metadata: true;
    tipoEvento: true;
    varreduraId: true;
  };
}>;

export type ManualScanEventInput = {
  companyId: string;
  findings: string[];
  resumoResultado: string;
  stateSnapshot: OperationalStateSnapshot;
  varreduraId: string;
};
