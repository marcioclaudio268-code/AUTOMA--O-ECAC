import {
  StatusAcessoEmpresa,
  StatusProcuracaoEmpresa
} from '@prisma/client';

export type OperationalSignals = {
  pendenciaOperacional: boolean;
  statusAcesso: StatusAcessoEmpresa;
  statusProcuracao: StatusProcuracaoEmpresa;
};

export type OperationalStateSnapshot = OperationalSignals & {
  signature: string;
};

const ACCESS_NAO_REGULAR = new Set<StatusAcessoEmpresa>([
  StatusAcessoEmpresa.BLOQUEADO,
  StatusAcessoEmpresa.INDISPONIVEL,
  StatusAcessoEmpresa.NAO_VERIFICADO
]);

export function deriveOperationalFindings(
  signals: OperationalSignals
): string[] {
  const findings: string[] = [];

  if (ACCESS_NAO_REGULAR.has(signals.statusAcesso)) {
    findings.push('Acesso irregular');
  }

  if (signals.statusProcuracao !== StatusProcuracaoEmpresa.VALIDA) {
    findings.push('Procuracao irregular');
  }

  if (signals.pendenciaOperacional) {
    findings.push('Pendencia operacional manual');
  }

  return findings;
}

export function buildOperationalSummary(signals: OperationalSignals): string {
  const findings = deriveOperationalFindings(signals);

  if (findings.length === 0) {
    return 'Nenhuma irregularidade encontrada.';
  }

  return findings.join(' | ');
}

export function buildOperationalStateSignature(
  signals: OperationalSignals
): string {
  return [
    signals.statusAcesso,
    signals.statusProcuracao,
    signals.pendenciaOperacional ? '1' : '0'
  ].join('|');
}

export function buildOperationalStateSnapshot(
  signals: OperationalSignals
): OperationalStateSnapshot {
  return {
    ...signals,
    signature: buildOperationalStateSignature(signals)
  };
}

export function buildOperationalEventDescription(findings: string[]): string {
  if (findings.length === 0) {
    return 'Estado operacional regular confirmado na varredura manual.';
  }

  return `Varredura manual identificou: ${findings.join(' | ')}.`;
}
