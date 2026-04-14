import { expect, test } from 'vitest';

import {
  describeOperationalAttention,
  resolveOperationalPendenciaAberta
} from './operational-pendencia';

function buildHistory(count: number) {
  return {
    pendenciasAbertas: Array.from({ length: count }, (_, index) => ({
      id: `pendencia-${index + 1}`
    }))
  } as Parameters<typeof resolveOperationalPendenciaAberta>[1];
}

test('empresa com pendenciaOperacional verdadeira mas sem pendencias abertas reais nao permanece bloqueada quando o historico carrega vazio', () => {
  expect(
    resolveOperationalPendenciaAberta({ pendenciaOperacional: true }, buildHistory(0))
  ).toBe(false);
});

test('empresa com pendencias abertas reais permanece bloqueada', () => {
  expect(
    resolveOperationalPendenciaAberta({ pendenciaOperacional: false }, buildHistory(1))
  ).toBe(true);
});

test('o helper usa fallback conservador enquanto o historico ainda nao existe', () => {
  expect(resolveOperationalPendenciaAberta({ pendenciaOperacional: true }, null)).toBe(
    true
  );
  expect(
    resolveOperationalPendenciaAberta({ pendenciaOperacional: false }, undefined)
  ).toBe(false);
});

test('card, resumo e acoes rapidas passam a compartilhar a mesma base de verdade', () => {
  const attention = describeOperationalAttention(
    {
      statusAcesso: 'DISPONIVEL',
      statusProcuracao: 'VALIDA'
    },
    false
  );

  expect(attention).toEqual({
    items: [],
    tone: 'success',
    title: 'Estado operacional regular'
  });

  const blockedAttention = describeOperationalAttention(
    {
      statusAcesso: 'DISPONIVEL',
      statusProcuracao: 'VALIDA'
    },
    true
  );

  expect(blockedAttention.tone).toBe('danger');
  expect(blockedAttention.items).toContain('Pendencia operacional aberta');
  expect(blockedAttention.title).toBe('Tratamento requerido');
});
