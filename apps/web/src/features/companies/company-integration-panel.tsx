'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import {
  executeCompanyIntegration,
  getCompanyIntegration,
  upsertCompanyIntegration,
  type CompanyIntegration,
  type CompanyIntegrationExecutionResponse,
  type CompanyIntegrationUpsertInput,
  type StatusIntegracao,
  type TipoIntegracao
} from '@/lib/api';
import {
  STATUS_INTEGRACAO_LABELS,
  STATUS_INTEGRACAO_OPTIONS,
  TIPO_INTEGRACAO_LABELS
} from '@/lib/constants';
import { formatDateTime, toDateTimeLocalValue } from '@/lib/formatters';

type CompanyIntegrationFormState = {
  mensagemErroAtual: string;
  observacoes: string;
  statusIntegracao: StatusIntegracao;
  ultimoErroEm: string;
  ultimoSucessoEm: string;
};

const PRIORITY_INTEGRATION_TYPE: TipoIntegracao = 'INTEGRA_CONTADOR';

const initialIntegrationFormState: CompanyIntegrationFormState = {
  mensagemErroAtual: '',
  observacoes: '',
  statusIntegracao: 'NAO_CONFIGURADA',
  ultimoErroEm: '',
  ultimoSucessoEm: ''
};

function toIntegrationFormState(
  integration: CompanyIntegration | null
): CompanyIntegrationFormState {
  if (!integration) {
    return initialIntegrationFormState;
  }

  return {
    mensagemErroAtual: integration.mensagemErroAtual ?? '',
    observacoes: integration.observacoes ?? '',
    statusIntegracao: integration.statusIntegracao,
    ultimoErroEm: toDateTimeLocalValue(integration.ultimoErroEm),
    ultimoSucessoEm: toDateTimeLocalValue(integration.ultimoSucessoEm)
  };
}

function buildPayload(
  form: CompanyIntegrationFormState
): CompanyIntegrationUpsertInput {
  return {
    mensagemErroAtual: form.mensagemErroAtual.trim() || null,
    observacoes: form.observacoes.trim() || null,
    statusIntegracao: form.statusIntegracao,
    ultimoErroEm: form.ultimoErroEm.trim()
      ? new Date(form.ultimoErroEm).toISOString()
      : null,
    ultimoSucessoEm: form.ultimoSucessoEm.trim()
      ? new Date(form.ultimoSucessoEm).toISOString()
      : null
  };
}

function formatIntegrationText(
  value: string | null | undefined,
  fallback: string
) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function formatIntegrationDate(value: string | null | undefined) {
  return value ? formatDateTime(value) : 'Nao registrada';
}

export function CompanyIntegrationPanel({
  companyId
}: {
  companyId: string;
}) {
  const router = useRouter();
  const executeLockRef = useRef(false);
  const saveLockRef = useRef(false);
  const [form, setForm] = useState<CompanyIntegrationFormState>(
    initialIntegrationFormState
  );
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      if (active) {
        setLoading(true);
        setError('');
        setMessage('');
      }

      if (!companyId) {
        if (active) {
          setError('Empresa invalida.');
          setLoading(false);
        }
        return;
      }

      try {
        const integration = await getCompanyIntegration(
          companyId,
          PRIORITY_INTEGRATION_TYPE
        );

        if (!active) {
          return;
        }

        setExists(true);
        setForm(toIntegrationFormState(integration));
      } catch (loadError) {
        if (!active) {
          return;
        }

        if (loadError instanceof Error && loadError.message === 'Nao autenticado.') {
          router.replace('/login');
          return;
        }

        if (
          loadError instanceof Error &&
          loadError.message === 'Integracao da empresa nao encontrada.'
        ) {
          setExists(false);
          setForm(initialIntegrationFormState);
        } else {
          setExists(false);
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Falha ao carregar integracao.'
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [companyId, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saveLockRef.current || isExecuting) {
      return;
    }

    saveLockRef.current = true;
    setIsSaving(true);
    setError('');
    setMessage('');

    try {
      if (!companyId) {
        throw new Error('Empresa invalida.');
      }

      const wasExisting = exists;
      const saved = await upsertCompanyIntegration(
        companyId,
        PRIORITY_INTEGRATION_TYPE,
        buildPayload(form)
      );

      setExists(true);
      setForm(toIntegrationFormState(saved));
      setMessage(
        wasExisting
          ? 'Integracao atualizada com sucesso.'
          : 'Integracao criada com sucesso.'
      );
    } catch (submitError) {
      if (
        submitError instanceof Error &&
        submitError.message === 'Nao autenticado.'
      ) {
        router.replace('/login');
        return;
      }

      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Falha ao salvar integracao.'
      );
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  }

  async function handleExecute() {
    if (executeLockRef.current || isSaving) {
      return;
    }

    executeLockRef.current = true;
    setIsExecuting(true);
    setError('');
    setMessage('');

    try {
      if (!companyId) {
        throw new Error('Empresa invalida.');
      }

      const response: CompanyIntegrationExecutionResponse =
        await executeCompanyIntegration(companyId, PRIORITY_INTEGRATION_TYPE);

      setExists(true);
      setForm(toIntegrationFormState(response.integration));

      if (response.execution.success) {
        setMessage(response.execution.message);
      } else {
        setError(response.execution.message);
      }
    } catch (executionError) {
      if (
        executionError instanceof Error &&
        executionError.message === 'Nao autenticado.'
      ) {
        router.replace('/login');
        return;
      }

      setError(
        executionError instanceof Error
          ? executionError.message
          : 'Falha ao executar integracao.'
      );
    } finally {
      executeLockRef.current = false;
      setIsExecuting(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-5 shadow-sm">
        <p className="text-sm text-sky-700">Carregando integracao prioritaria...</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-4 xl:max-w-2xl">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-sky-700">
              Integracao prioritaria
            </p>
            <h2 className="text-lg font-semibold text-slate-950">
              Base operacional da integracao por empresa
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-700">
              Este bloco persiste manualmente o registro de{' '}
              {TIPO_INTEGRACAO_LABELS[PRIORITY_INTEGRATION_TYPE]} sem acionar
              automacao, fila, cron ou leitura externa.
            </p>
          </div>

          <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border border-sky-200 bg-white/90 px-3 py-2">
              <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Tipo
              </dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">
                {PRIORITY_INTEGRATION_TYPE}
              </dd>
            </div>
            <div className="rounded-xl border border-sky-200 bg-white/90 px-3 py-2">
              <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Status
              </dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">
                {STATUS_INTEGRACAO_LABELS[form.statusIntegracao]}
              </dd>
            </div>
            <div className="rounded-xl border border-sky-200 bg-white/90 px-3 py-2">
              <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Registro
              </dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">
                {exists ? 'Persistido' : 'Ainda nao criado'}
              </dd>
            </div>
            <div className="rounded-xl border border-sky-200 bg-white/90 px-3 py-2">
              <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Ultimo sucesso
              </dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">
                {formatIntegrationDate(form.ultimoSucessoEm)}
              </dd>
            </div>
            <div className="rounded-xl border border-sky-200 bg-white/90 px-3 py-2">
              <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Ultimo erro
              </dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">
                {formatIntegrationDate(form.ultimoErroEm)}
              </dd>
            </div>
            <div className="rounded-xl border border-sky-200 bg-white/90 px-3 py-2">
              <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Falha atual
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-900">
                {formatIntegrationText(
                  form.mensagemErroAtual,
                  'Sem falha registrada.'
                )}
              </dd>
            </div>
          </dl>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">
              Observacoes
            </h3>
            <p className="whitespace-pre-wrap rounded-xl border border-sky-200 bg-white/90 px-3 py-2 text-sm text-slate-700">
              {formatIntegrationText(form.observacoes, 'Sem observacoes.')}
            </p>
          </div>
        </div>

        <div className="xl:w-[28rem]">
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <fieldset className="space-y-4" disabled={isSaving || isExecuting}>
              <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Execucao manual controlada
                  </h3>
                  <p className="text-xs leading-5 text-slate-600">
                    Aciona apenas a consulta de{' '}
                    {TIPO_INTEGRACAO_LABELS[PRIORITY_INTEGRATION_TYPE]} para
                    esta empresa e atualiza o registro operacional.
                  </p>
                </div>
                <button
                  className="inline-flex w-full items-center justify-center rounded-xl border border-sky-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSaving || isExecuting}
                  onClick={() => void handleExecute()}
                  type="button"
                >
                  {isExecuting ? 'Executando...' : 'Executar consulta agora'}
                </button>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  Status da integracao
                </label>
                <select
                  className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                  name="statusIntegracao"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      statusIntegracao: event.target.value as StatusIntegracao
                    }))
                  }
                  value={form.statusIntegracao}
                >
                  {STATUS_INTEGRACAO_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="block text-sm font-medium text-slate-700">
                    Ultimo sucesso
                  </span>
                  <input
                    className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                    name="ultimoSucessoEm"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        ultimoSucessoEm: event.target.value
                      }))
                    }
                    type="datetime-local"
                    value={form.ultimoSucessoEm}
                  />
                </label>

                <label className="space-y-2">
                  <span className="block text-sm font-medium text-slate-700">
                    Ultimo erro
                  </span>
                  <input
                    className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                    name="ultimoErroEm"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        ultimoErroEm: event.target.value
                      }))
                    }
                    type="datetime-local"
                    value={form.ultimoErroEm}
                  />
                </label>
              </div>

              <label className="space-y-2">
                <span className="block text-sm font-medium text-slate-700">
                  Mensagem de falha
                </span>
                <textarea
                  className="min-h-24 w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                  name="mensagemErroAtual"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      mensagemErroAtual: event.target.value
                    }))
                  }
                  value={form.mensagemErroAtual}
                />
              </label>

              <label className="space-y-2">
                <span className="block text-sm font-medium text-slate-700">
                  Observacoes
                </span>
                <textarea
                  className="min-h-28 w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                  name="observacoes"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      observacoes: event.target.value
                    }))
                  }
                  value={form.observacoes}
                />
              </label>
            </fieldset>

            {error ? (
              <p
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            {message ? (
              <p
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
                role="status"
              >
                {message}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                aria-busy={isSaving || isExecuting}
                disabled={isSaving || isExecuting}
                type="submit"
              >
                {isSaving
                  ? 'Salvando...'
                  : exists
                    ? 'Salvar integracao'
                    : 'Criar integracao'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
