import { afterEach, expect, test, vi } from 'vitest';

import {
  registerCompanyCheck,
  registerCompanyOperationalReview
} from './index';

const OPERATIONAL_CHECK_BLOCKED_MESSAGE =
  'Nao e possivel registrar conferencia operacional enquanto houver pendencia operacional aberta.';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('registerCompanyCheck expõe mensagem de negocio quando a API bloqueia a conferência', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 409,
    text: async () =>
      JSON.stringify({
        error: 'Conflict',
        message: OPERATIONAL_CHECK_BLOCKED_MESSAGE,
        statusCode: 409
      })
  } as Response);

  vi.stubGlobal('fetch', fetchMock);

  await expect(registerCompanyCheck('empresa-123')).rejects.toThrow(
    OPERATIONAL_CHECK_BLOCKED_MESSAGE
  );

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/companies/empresa-123/operational/check'),
    expect.objectContaining({
      method: 'POST'
    })
  );
});

test('registerCompanyOperationalReview chama o endpoint certo e retorna o timestamp da revisao', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 201,
    text: async () =>
      JSON.stringify({
        updatedAt: '2026-04-14T12:00:00.000Z'
      })
  } as Response);

  vi.stubGlobal('fetch', fetchMock);

  const result = await registerCompanyOperationalReview('empresa-123', {
    chaveIdempotencia: 'review-1'
  });

  expect(result).toEqual({
    updatedAt: '2026-04-14T12:00:00.000Z'
  });
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/companies/empresa-123/operational/review'),
    expect.objectContaining({
      body: JSON.stringify({
        chaveIdempotencia: 'review-1'
      }),
      method: 'POST'
    })
  );
});
