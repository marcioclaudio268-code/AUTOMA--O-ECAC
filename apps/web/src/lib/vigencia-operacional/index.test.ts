import { expect, test } from 'vitest';

import {
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
