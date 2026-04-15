import { STATUS_ACESSO_LABELS, STATUS_PROCURACAO_LABELS } from '../../../lib/constants';
import type { CompanyDetailItem, CompanyOperationalHistory } from '../../../lib/api';

export type OperationalAttentionTone = 'success' | 'warning' | 'danger' | 'neutral';

export type OperationalAttention = {
  items: string[];
  tone: OperationalAttentionTone;
  title: string;
};

type OperationalPendenciaSource = Pick<CompanyDetailItem, 'pendenciaOperacional'>;
type OperationalAttentionSource = Pick<
  CompanyDetailItem,
  'statusAcesso' | 'statusProcuracao'
>;
type OperationalHistorySource = Pick<CompanyOperationalHistory, 'pendenciasAbertas'>;

export function resolveOperationalPendenciaAberta(
  company: OperationalPendenciaSource | null | undefined,
  operationalHistory: OperationalHistorySource | null | undefined
): boolean {
  if (operationalHistory) {
    return operationalHistory.pendenciasAbertas.length > 0;
  }

  return company?.pendenciaOperacional === true;
}

export function describeOperationalAttention(
  company: OperationalAttentionSource,
  hasOpenOperationalPendencia: boolean
): OperationalAttention {
  const items: string[] = [];
  let tone: OperationalAttentionTone = 'success';

  if (company.statusAcesso !== 'DISPONIVEL') {
    items.push(`Acesso: ${STATUS_ACESSO_LABELS[company.statusAcesso]}`);
    tone = company.statusAcesso === 'NAO_VERIFICADO' ? tone : 'danger';
  }

  if (company.statusProcuracao !== 'VALIDA') {
    items.push(`Procuracao: ${STATUS_PROCURACAO_LABELS[company.statusProcuracao]}`);
    tone =
      company.statusProcuracao === 'NAO_VERIFICADA' && tone !== 'danger'
        ? 'warning'
        : 'danger';
  }

  if (hasOpenOperationalPendencia) {
    items.push('Pendencia operacional aberta');
    tone = 'danger';
  }

  if (items.length === 0) {
    return {
      items,
      tone: 'success',
      title: 'Estado operacional regular'
    };
  }

  return {
    items,
    tone,
    title: tone === 'danger' ? 'Tratamento requerido' : 'Acompanhar confirmacao'
  };
}
