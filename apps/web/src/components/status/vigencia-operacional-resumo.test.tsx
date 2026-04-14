import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { VigenciaOperacionalResumo } from './vigencia-operacional-resumo';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-14T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

test('renderiza a leitura resumida usada em /empresas', () => {
  const html = renderToStaticMarkup(
    <VigenciaOperacionalResumo
      certificadoDigitalValidoAte="2026-04-13T09:00:00.000Z"
      procuracaoValidaAte="2026-05-20T09:00:00.000Z"
    />
  );

  expect(html).toContain('Certificado');
  expect(html).toContain('Procuração');
  expect(html).toContain('Vencido');
  expect(html).toContain('Regular');
  expect(html).toContain('bg-rose-50');
  expect(html).toContain('bg-emerald-50');
});

test('renderiza a leitura resumida usada em /carteira e lida com campos vazios', () => {
  const html = renderToStaticMarkup(
    <VigenciaOperacionalResumo
      certificadoDigitalValidoAte={null}
      procuracaoValidaAte={undefined}
    />
  );

  expect(html).toContain('Sem informação');
  expect((html.match(/Sem informação/g) ?? []).length).toBe(2);
  expect(html).toContain('bg-slate-50');
});
