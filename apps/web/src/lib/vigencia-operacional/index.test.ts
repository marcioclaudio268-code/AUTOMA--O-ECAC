import { expect, test } from 'vitest';

import {
  buildVigenciaOperacionalBadge,
  classifyVigenciaOperacional,
  formatVigenciaOperacionalLabel
} from './index';

test('classifica vigencia operacional sem informacao, vencido, a vencer e regular', () => {
  const referenceDate = new Date('2026-04-14T12:00:00.000Z');
  const vencido = new Date(referenceDate);
  vencido.setDate(vencido.getDate() - 1);
  const aVencer = new Date(referenceDate);
  aVencer.setDate(aVencer.getDate() + 30);
  const regular = new Date(referenceDate);
  regular.setDate(regular.getDate() + 31);

  expect(classifyVigenciaOperacional(undefined, referenceDate)).toBe(
    'SEM_INFORMACAO'
  );
  expect(classifyVigenciaOperacional(null, referenceDate)).toBe(
    'SEM_INFORMACAO'
  );
  expect(classifyVigenciaOperacional(vencido.toISOString(), referenceDate)).toBe(
    'VENCIDO'
  );
  expect(classifyVigenciaOperacional(aVencer.toISOString(), referenceDate)).toBe(
    'A_VENCER'
  );
  expect(classifyVigenciaOperacional(regular.toISOString(), referenceDate)).toBe(
    'REGULAR'
  );
});

test('formata os rótulos de vigencia operacional', () => {
  expect(formatVigenciaOperacionalLabel('SEM_INFORMACAO')).toBe(
    'Sem informacao'
  );
  expect(formatVigenciaOperacionalLabel('VENCIDO')).toBe('Vencido');
  expect(formatVigenciaOperacionalLabel('A_VENCER')).toBe('A vencer');
  expect(formatVigenciaOperacionalLabel('REGULAR')).toBe('Regular');
});

test('monta o resumo visual de vigencia para listagens', () => {
  const referenceDate = new Date('2026-04-14T12:00:00.000Z');
  const vencido = new Date(referenceDate);
  vencido.setDate(vencido.getDate() - 1);
  const aVencer = new Date(referenceDate);
  aVencer.setDate(aVencer.getDate() + 30);
  const regular = new Date(referenceDate);
  regular.setDate(regular.getDate() + 31);

  expect(buildVigenciaOperacionalBadge(undefined)).toEqual({
    label: 'Sem informacao',
    status: 'SEM_INFORMACAO',
    tone: 'neutral'
  });
  expect(
    buildVigenciaOperacionalBadge(null, {
      missingLabel: 'Sem informação',
      referenceDate
    })
  ).toEqual({
    label: 'Sem informação',
    status: 'SEM_INFORMACAO',
    tone: 'neutral'
  });
  expect(
    buildVigenciaOperacionalBadge(vencido.toISOString(), {
      expiredLabel: 'Vencida',
      referenceDate
    })
  ).toEqual({
    label: 'Vencida',
    status: 'VENCIDO',
    tone: 'danger'
  });
  expect(
    buildVigenciaOperacionalBadge(aVencer.toISOString(), { referenceDate })
  ).toEqual({
    label: 'A vencer',
    status: 'A_VENCER',
    tone: 'warning'
  });
  expect(
    buildVigenciaOperacionalBadge(regular.toISOString(), { referenceDate })
  ).toEqual({
    label: 'Regular',
    status: 'REGULAR',
    tone: 'success'
  });
});
