import { expect, test } from 'vitest';

import type { CompanyListItem } from '../../lib/api';

import {
  buildQueryFilters,
  filterCarteiraItems,
  initialFilters,
  type CarteiraFilterState
} from './carteira-filters';

const referenceDate = new Date('2026-04-14T12:00:00.000Z');

function offsetDate(days: number) {
  const date = new Date(referenceDate);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

type CompanyOverrides = {
  [K in keyof CompanyListItem]?: CompanyListItem[K] | undefined;
};

function buildCompany(
  overrides: CompanyOverrides = {}
): CompanyListItem {
  return {
    cnpj: '12345678000100',
    certificadoDigitalImplementadoEm: '2026-04-01T10:00:00.000Z',
    certificadoDigitalValidoAte: offsetDate(31),
    createdAt: '2026-04-01T10:00:00.000Z',
    id: 'empresa-1',
    naCarteira: true,
    nomeFantasia: 'Empresa Teste',
    observacoesOperacionais: null,
    pendenciaOperacional: false,
    procuracaoImplementadaEm: '2026-04-01T10:00:00.000Z',
    procuracaoValidaAte: offsetDate(31),
    razaoSocial: 'Empresa Teste LTDA',
    regimeTributario: 'SIMPLES_NACIONAL',
    responsavelInterno: {
      ativo: true,
      email: 'responsavel@example.com',
      id: 'responsavel-1',
      nome: 'Responsavel Um',
      usuarioInternoId: 'usuario-1'
    },
    responsavelInternoId: 'responsavel-1',
    regularizadaEm: null,
    statusAcesso: 'DISPONIVEL',
    statusProcuracao: 'VALIDA',
    ultimaConferenciaAcessoEm: '2026-04-01T10:00:00.000Z',
    ultimaConferenciaOperacionalEm: null,
    ultimaConferenciaProcuracaoEm: '2026-04-01T10:00:00.000Z',
    ultimaVarreduraEm: null,
    ultimoEventoRelevanteEm: null,
    updatedAt: '2026-04-14T12:00:00.000Z',
    ...overrides
  } as CompanyListItem;
}

function buildFilters(
  overrides: Partial<CarteiraFilterState>
): CarteiraFilterState {
  return {
    ...initialFilters,
    ...overrides
  };
}

function expectOnlyCompany(
  items: CompanyListItem[],
  filters: CarteiraFilterState
) {
  expect(filterCarteiraItems(items, filters, referenceDate).map((item) => item.id))
    .toEqual(['empresa-1']);
}

function buildCertificateControlValue(
  filter: CarteiraFilterState['certificadoDigitalVigencia']
) {
  return filter === 'A_VENCER' ? offsetDate(31) : offsetDate(30);
}

function buildProcuracaoControlValue(
  filter: CarteiraFilterState['procuracaoVigencia']
) {
  return filter === 'A_VENCER' ? offsetDate(31) : offsetDate(30);
}

test.each([
  {
    certificadoDigitalValidoAte: undefined,
    label: 'sem informacao',
    value: 'SEM_INFORMACAO' as const
  },
  {
    certificadoDigitalValidoAte: offsetDate(-1),
    label: 'vencido',
    value: 'VENCIDO' as const
  },
  {
    certificadoDigitalValidoAte: offsetDate(30),
    label: 'a vencer',
    value: 'A_VENCER' as const
  },
  {
    certificadoDigitalValidoAte: offsetDate(31),
    label: 'regular',
    value: 'REGULAR' as const
  }
])('filtra vigencia de certificado = $label', (scenario) => {
  const target = buildCompany({
    certificadoDigitalValidoAte: scenario.certificadoDigitalValidoAte,
    procuracaoValidaAte: offsetDate(31)
  });
  const control = buildCompany({
    id: 'empresa-2',
    certificadoDigitalValidoAte: buildCertificateControlValue(scenario.value),
    procuracaoValidaAte: offsetDate(31)
  });

  expectOnlyCompany(
    [target, control],
    buildFilters({ certificadoDigitalVigencia: scenario.value })
  );
});

test.each([
  {
    label: 'sem informacao',
    procuracaoValidaAte: null,
    value: 'SEM_INFORMACAO' as const
  },
  {
    label: 'vencida',
    procuracaoValidaAte: offsetDate(-1),
    value: 'VENCIDO' as const
  },
  {
    label: 'a vencer',
    procuracaoValidaAte: offsetDate(30),
    value: 'A_VENCER' as const
  },
  {
    label: 'regular',
    procuracaoValidaAte: offsetDate(31),
    value: 'REGULAR' as const
  }
])('filtra vigencia de procuracao = $label', (scenario) => {
  const target = buildCompany({
    certificadoDigitalValidoAte: offsetDate(31),
    procuracaoValidaAte: scenario.procuracaoValidaAte
  });
  const control = buildCompany({
    id: 'empresa-2',
    certificadoDigitalValidoAte: offsetDate(31),
    procuracaoValidaAte: buildProcuracaoControlValue(scenario.value)
  });

  expectOnlyCompany(
    [target, control],
    buildFilters({ procuracaoVigencia: scenario.value })
  );
});

test('combina filtros de vigencia com os filtros já existentes da carteira', () => {
  const match = buildCompany({
    certificadoDigitalValidoAte: offsetDate(30),
    pendenciaOperacional: false,
    procuracaoValidaAte: offsetDate(31),
    responsavelInternoId: 'responsavel-1',
    statusAcesso: 'DISPONIVEL',
    statusProcuracao: 'VALIDA'
  });
  const other = buildCompany({
    certificadoDigitalValidoAte: offsetDate(30),
    id: 'empresa-2',
    pendenciaOperacional: false,
    procuracaoValidaAte: offsetDate(31),
    responsavelInternoId: 'responsavel-2',
    responsavelInterno: {
      ativo: true,
      email: 'responsavel2@example.com',
      id: 'responsavel-2',
      nome: 'Responsavel Dois',
      usuarioInternoId: 'usuario-2'
    },
    statusAcesso: 'INDISPONIVEL',
    statusProcuracao: 'INVALIDA'
  });

  const filters = buildFilters({
    certificadoDigitalVigencia: 'A_VENCER',
    pendenciaOperacional: 'false',
    procuracaoVigencia: 'REGULAR',
    responsavelInternoId: 'responsavel-1',
    statusAcesso: 'DISPONIVEL',
    statusProcuracao: 'VALIDA'
  });

  expectOnlyCompany([match, other], filters);
  expect(buildQueryFilters(filters)).toEqual({
    pendenciaOperacional: false,
    responsavelInternoId: 'responsavel-1',
    statusAcesso: 'DISPONIVEL',
    statusProcuracao: 'VALIDA'
  });
});

test('limpar filtros restaura o estado padrao', () => {
  const items = [
    buildCompany({
      certificadoDigitalValidoAte: undefined,
      id: 'empresa-1',
      procuracaoValidaAte: offsetDate(-1)
    }),
    buildCompany({
      certificadoDigitalValidoAte: offsetDate(31),
      id: 'empresa-2',
      procuracaoValidaAte: offsetDate(31)
    })
  ];

  const activeFilters = buildFilters({
    certificadoDigitalVigencia: 'SEM_INFORMACAO',
    pendenciaOperacional: 'true',
    procuracaoVigencia: 'VENCIDO',
    responsavelInternoId: 'responsavel-1',
    statusAcesso: 'BLOQUEADO',
    statusProcuracao: 'INVALIDA'
  });

  expect(filterCarteiraItems(items, activeFilters, referenceDate)).toHaveLength(0);
  expect(filterCarteiraItems(items, initialFilters, referenceDate)).toHaveLength(2);
  expect(buildQueryFilters(initialFilters)).toEqual({});
});
