import { afterEach, expect, test, vi } from 'vitest';

import { registerCompanyCheck } from './index';

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
