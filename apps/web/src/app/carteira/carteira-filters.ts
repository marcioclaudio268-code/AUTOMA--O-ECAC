import type {
  CompanyListFilters,
  CompanyListItem,
  StatusAcessoEmpresa,
  StatusProcuracaoEmpresa
} from '../../lib/api';
import {
  classifyVigenciaOperacional,
  type VigenciaOperacionalStatus
} from '../../lib/vigencia-operacional';

type FilterOption<T extends string> = {
  label: string;
  value: T;
};

export type CarteiraVigenciaFilterValue =
  | ''
  | VigenciaOperacionalStatus;

export type CarteiraFilterState = {
  certificadoDigitalVigencia: CarteiraVigenciaFilterValue;
  pendenciaOperacional: '' | 'true' | 'false';
  procuracaoVigencia: CarteiraVigenciaFilterValue;
  responsavelInternoId: string;
  statusAcesso: StatusAcessoEmpresa | '';
  statusProcuracao: StatusProcuracaoEmpresa | '';
};

export const CERTIFICADO_VIGENCIA_OPTIONS: FilterOption<CarteiraVigenciaFilterValue>[] =
  [
    { label: 'Todos', value: '' },
    { label: 'Sem informacao', value: 'SEM_INFORMACAO' },
    { label: 'Vencido', value: 'VENCIDO' },
    { label: 'A vencer', value: 'A_VENCER' },
    { label: 'Regular', value: 'REGULAR' }
  ];

export const PROCURACAO_VIGENCIA_OPTIONS: FilterOption<CarteiraVigenciaFilterValue>[] =
  [
    { label: 'Todos', value: '' },
    { label: 'Sem informacao', value: 'SEM_INFORMACAO' },
    { label: 'Vencida', value: 'VENCIDO' },
    { label: 'A vencer', value: 'A_VENCER' },
    { label: 'Regular', value: 'REGULAR' }
  ];

export const initialFilters: CarteiraFilterState = {
  certificadoDigitalVigencia: '',
  pendenciaOperacional: '',
  procuracaoVigencia: '',
  responsavelInternoId: '',
  statusAcesso: '',
  statusProcuracao: ''
};

function matchesVigenciaFilter(
  value: string | null | undefined,
  filter: CarteiraVigenciaFilterValue,
  referenceDate: Date = new Date()
) {
  return !filter || classifyVigenciaOperacional(value, referenceDate) === filter;
}

export function buildQueryFilters(
  filters: CarteiraFilterState
): Omit<CompanyListFilters, 'naCarteira'> {
  const query: Omit<CompanyListFilters, 'naCarteira'> = {};

  if (filters.responsavelInternoId.trim()) {
    query.responsavelInternoId = filters.responsavelInternoId.trim();
  }

  if (filters.pendenciaOperacional !== '') {
    query.pendenciaOperacional = filters.pendenciaOperacional === 'true';
  }

  if (filters.statusAcesso) {
    query.statusAcesso = filters.statusAcesso;
  }

  if (filters.statusProcuracao) {
    query.statusProcuracao = filters.statusProcuracao;
  }

  return query;
}

export function matchesCarteiraFilters(
  company: CompanyListItem,
  filters: CarteiraFilterState,
  referenceDate: Date = new Date()
) {
  if (
    filters.responsavelInternoId &&
    company.responsavelInternoId !== filters.responsavelInternoId
  ) {
    return false;
  }

  if (filters.statusAcesso && company.statusAcesso !== filters.statusAcesso) {
    return false;
  }

  if (
    filters.statusProcuracao &&
    company.statusProcuracao !== filters.statusProcuracao
  ) {
    return false;
  }

  if (filters.pendenciaOperacional !== '') {
    const expectedPending = filters.pendenciaOperacional === 'true';

    if (company.pendenciaOperacional !== expectedPending) {
      return false;
    }
  }

  if (
    !matchesVigenciaFilter(
      company.certificadoDigitalValidoAte,
      filters.certificadoDigitalVigencia,
      referenceDate
    )
  ) {
    return false;
  }

  if (
    !matchesVigenciaFilter(
      company.procuracaoValidaAte,
      filters.procuracaoVigencia,
      referenceDate
    )
  ) {
    return false;
  }

  return true;
}

export function filterCarteiraItems(
  items: CompanyListItem[],
  filters: CarteiraFilterState,
  referenceDate: Date = new Date()
) {
  return items.filter((item) => matchesCarteiraFilters(item, filters, referenceDate));
}
