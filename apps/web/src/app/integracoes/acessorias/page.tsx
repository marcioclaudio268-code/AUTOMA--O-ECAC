'use client';

import React from 'react';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import {
  createAcessoriasConfig,
  getAcessoriasConfig,
  listAcessoriasJobs,
  testAcessoriasConnection,
  updateAcessoriasConfig,
  type AcessoriasConfigRecord,
  type AcessoriasJobRecord
} from '@/lib/api';
import { requireSession, signOut } from '@/lib/auth';
import {
  STATUS_INTEGRACAO_ACESSORIAS_LABELS,
  STATUS_JOB_ACESSORIAS_LABELS,
  TIPO_JOB_ACESSORIAS_LABELS
} from '@/lib/constants';
import { formatDateTime } from '@/lib/formatters';

const RECENT_JOBS_LIMIT = 5;

type FeedbackTone = 'error' | 'success';

type FeedbackState = {
  message: string;
  tone: FeedbackTone;
};

function getIntegrationToneClass(status: AcessoriasConfigRecord['status']): string {
  switch (status) {
    case 'ATIVA':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'CONFIGURADA':
      return 'border-slate-200 bg-slate-50 text-slate-700';
    case 'ERRO':
      return 'border-rose-200 bg-rose-50 text-rose-800';
    case 'NAO_CONFIGURADA':
    default:
      return 'border-amber-200 bg-amber-50 text-amber-800';
  }
}

function getJobToneClass(status: AcessoriasJobRecord['status']): string {
  switch (status) {
    case 'SUCESSO':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'FALHA':
      return 'border-rose-200 bg-rose-50 text-rose-800';
    case 'INICIADO':
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

function formatNullableDate(value: string | null): string {
  return formatDateTime(value);
}

function formatNullableText(value: string | null): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : '-';
}

function AcessoriasPage() {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [config, setConfig] = useState<AcessoriasConfigRecord | null>(null);
  const [jobs, setJobs] = useState<AcessoriasJobRecord[]>([]);
  const [apiToken, setApiToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [reloadIndex, setReloadIndex] = useState(0);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const fetchState = useCallback(async () => {
    const user = await requireSession();

    const [configData, jobData] = await Promise.all([
      getAcessoriasConfig(),
      listAcessoriasJobs({ take: RECENT_JOBS_LIMIT })
    ]);

    return {
      configData,
      jobData,
      user
    };
  }, []);

  const refreshState = useCallback(async () => {
    const nextState = await fetchState();

    setUserName(nextState.user.nome);
    setConfig(nextState.configData);
    setJobs(nextState.jobData);
  }, [fetchState]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');
      setFeedback(null);

      try {
        const nextState = await fetchState();

        if (!active) {
          return;
        }

        setUserName(nextState.user.nome);
        setConfig(nextState.configData);
        setJobs(nextState.jobData);
      } catch (loadError) {
        if (!active) {
          return;
        }

        if (
          loadError instanceof Error &&
          loadError.message === 'Nao autenticado.'
        ) {
          router.replace('/login');
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Falha ao carregar a integracao Acessorias.'
        );
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
  }, [fetchState, reloadIndex, router]);

  async function handleLogout() {
    setIsSigningOut(true);

    try {
      await signOut();
    } catch {
      // Logout best effort; the redirect below still clears the session view.
    } finally {
      router.replace('/login');
      setIsSigningOut(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setFeedback(null);

    const token = apiToken.trim();

    if (!token) {
      setFeedback({
        message: 'Informe um token para salvar a configuracao.',
        tone: 'error'
      });
      return;
    }

    setIsSaving(true);

    try {
      if (config?.createdAt) {
        await updateAcessoriasConfig({
          apiToken: token
        });
        setFeedback({
          message: 'Configuracao Acessorias atualizada com sucesso.',
          tone: 'success'
        });
      } else {
        await createAcessoriasConfig({
          apiToken: token
        });
        setFeedback({
          message: 'Configuracao Acessorias criada com sucesso.',
          tone: 'success'
        });
      }

      setApiToken('');
      await refreshState();
    } catch (saveError) {
      setFeedback({
        message:
          saveError instanceof Error
            ? saveError.message
            : 'Falha ao salvar a configuracao Acessorias.',
        tone: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTestConnection() {
    setError('');
    setFeedback(null);
    setIsTesting(true);

    try {
      const result = await testAcessoriasConnection();

      setFeedback({
        message: result.message,
        tone: result.success ? 'success' : 'error'
      });

      await refreshState();
    } catch (testError) {
      setFeedback({
        message:
          testError instanceof Error
            ? testError.message
            : 'Falha ao testar a conexao Acessorias.',
        tone: 'error'
      });
    } finally {
      setIsTesting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <div className="h-3 w-36 rounded-full bg-slate-200" />
              <div className="h-8 w-80 rounded-full bg-slate-200" />
              <div className="h-4 w-full max-w-2xl rounded-full bg-slate-200" />
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="h-10 w-24 rounded-xl bg-slate-200" />
              <div className="h-10 w-24 rounded-xl bg-slate-200" />
            </div>
          </header>

          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
              <div className="h-3 w-32 rounded-full bg-slate-200" />
              <div className="mt-4 h-8 w-48 rounded-full bg-slate-200" />
              <div className="mt-4 h-4 w-full rounded-full bg-slate-200" />
              <div className="mt-6 h-10 w-full rounded-xl bg-slate-200" />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <div className="h-3 w-32 rounded-full bg-slate-200" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    className="h-16 rounded-xl border border-slate-200 bg-slate-100"
                    key={`job-skeleton-${index}`}
                  />
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const currentStatus = config?.status ?? 'NAO_CONFIGURADA';

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
              ECAC AUTOMAÇÃO
            </p>
            <h1 className="text-3xl font-semibold text-slate-950">
              Integração Acessorias
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              Conector opcional para validar o acesso externo e registrar a
              trilha de jobs sem criar dependencia arquitetural do Acessorias.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
              href="/empresas"
            >
              Empresas
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
              href="/dashboard"
            >
              Dashboard
            </Link>
            <button
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSigningOut}
              onClick={() => void handleLogout()}
              type="button"
            >
              {isSigningOut ? 'Saindo...' : 'Sair'}
            </button>
          </div>
        </header>

        {error ? (
          <section
            className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800"
            role="alert"
          >
            <h2 className="text-base font-semibold text-rose-900">
              Nao foi possivel carregar a integracao.
            </h2>
            <p className="mt-2 text-sm leading-6 text-rose-800">{error}</p>
            <button
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-rose-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-800"
              onClick={() => setReloadIndex((current) => current + 1)}
              type="button"
            >
              Tentar novamente
            </button>
          </section>
        ) : null}

        {feedback ? (
          <section
            className={`rounded-2xl border p-5 ${
              feedback.tone === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
            role="status"
          >
            <p className="text-sm leading-6">{feedback.message}</p>
          </section>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                  Status da integracao
                </p>
                <h2 className="mt-2 text-lg font-semibold text-slate-950">
                  {STATUS_INTEGRACAO_ACESSORIAS_LABELS[currentStatus]}
                </h2>
              </div>
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getIntegrationToneClass(
                  currentStatus
                )}`}
              >
                {STATUS_INTEGRACAO_ACESSORIAS_LABELS[currentStatus]}
              </span>
            </div>

            <dl className="mt-6 space-y-4 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">Token</dt>
                <dd className="text-right font-medium text-slate-900">
                  {config?.apiTokenConfigurado
                    ? config.apiTokenMascarado ?? '********'
                    : 'Nao configurado'}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">Ultima sincronizacao</dt>
                <dd className="text-right font-medium text-slate-900">
                  {formatNullableDate(config?.ultimaSincronizacaoEm ?? null)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">Ultimo erro</dt>
                <dd className="max-w-48 text-right font-medium text-slate-900">
                  {formatNullableText(config?.mensagemErroAtual ?? null)}
                </dd>
              </div>
            </dl>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <div className="flex flex-col gap-2 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                  Configuracao
                </p>
                <h2 className="mt-2 text-lg font-semibold text-slate-950">
                  Token e validacao da conexao
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Salve o token antes de testar a conexao. O teste usa o token
                  persistido e registra um job auditavel.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {config?.createdAt ? 'Configuracao existente' : 'Nova configuracao'}
              </div>
            </div>

            <form className="mt-5 space-y-4" onSubmit={(event) => void handleSave(event)}>
              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-slate-700"
                  htmlFor="apiToken"
                >
                  Token da API
                </label>
                <input
                  autoComplete="off"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                  id="apiToken"
                  name="apiToken"
                  onChange={(event) => setApiToken(event.target.value)}
                  placeholder="Cole o token da Acessorias"
                  type="password"
                  value={apiToken}
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSaving}
                  type="submit"
                >
                  {isSaving ? 'Salvando...' : 'Salvar configuracao'}
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isTesting}
                  onClick={() => void handleTestConnection()}
                  type="button"
                >
                  {isTesting ? 'Testando...' : 'Testar conexao'}
                </button>
              </div>
            </form>
          </article>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                Jobs recentes
              </p>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">
                Historico de execucoes da integracao
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                O primeiro bloco nesta etapa e somente a infraestrutura: salvar
                a configuracao, testar a conexao e rastrear cada tentativa.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {jobs.length} job{jobs.length === 1 ? '' : 's'} recente
              {jobs.length === 1 ? '' : 's'}
            </div>
          </div>

          {jobs.length === 0 ? (
            <div className="py-8 text-sm text-slate-600">
              Nenhum job registrado ainda.
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-3 py-3 font-medium">Tipo</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Iniciado</th>
                    <th className="px-3 py-3 font-medium">Finalizado</th>
                    <th className="px-3 py-3 font-medium">Processados</th>
                    <th className="px-3 py-3 font-medium">Falhas</th>
                    <th className="px-3 py-3 font-medium">Erro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs.map((job) => (
                    <tr key={job.id} className="align-top">
                      <td className="px-3 py-4 text-slate-700">
                        {TIPO_JOB_ACESSORIAS_LABELS[job.tipoJob]}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getJobToneClass(
                            job.status
                          )}`}
                        >
                          {STATUS_JOB_ACESSORIAS_LABELS[job.status]}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {formatDateTime(job.iniciadoEm)}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {formatDateTime(job.finalizadoEm)}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {job.processados}
                      </td>
                      <td className="px-3 py-4 text-slate-700">{job.falhas}</td>
                      <td className="px-3 py-4 text-slate-700">
                        {formatNullableText(job.detalhesErro)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default AcessoriasPage;
