'use client';

import Link from 'next/link';
import {
  type FormEvent,
  useEffect,
  useState
} from 'react';
import { useRouter } from 'next/navigation';

import {
  listPendencias,
  type PendenciaListFilters,
  type PendenciaListItem,
  type StatusAcessoEmpresa,
  type StatusProcuracaoEmpresa,
  type TipoPendencia
} from '@/lib/api';
import { requireSession, signOut } from '@/lib/auth';
import { formatCnpj, formatDateTime } from '@/lib/formatters';

type PendenciasFormState = {
  empresaId: string;
  responsavelInternoId: string;
  tipoPendencia: '' | TipoPendencia;
};

const INITIAL_FORM_STATE: PendenciasFormState = {
  empresaId: '',
  responsavelInternoId: '',
  tipoPendencia: ''
};

const PENDENCIA_TIPO_META: Record<
  TipoPendencia,
  {
    accentClass: string;
    badgeClass: string;
    shortLabel: string;
  }
> = {
  ACESSO: {
    accentClass: 'border-t-rose-500',
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
    shortLabel: 'Acesso'
  },
  OPERACIONAL: {
    accentClass: 'border-t-amber-500',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
    shortLabel: 'Operacional'
  },
  PROCURACAO: {
    accentClass: 'border-t-violet-500',
    badgeClass: 'border-violet-200 bg-violet-50 text-violet-700',
    shortLabel: 'Procuracao'
  }
};

const STATUS_ACESSO_LABELS: Record<StatusAcessoEmpresa, string> = {
  BLOQUEADO: 'Bloqueado',
  DISPONIVEL: 'Disponivel',
  INDISPONIVEL: 'Indisponivel',
  NAO_VERIFICADO: 'Nao verificado'
};

const STATUS_PROCURACAO_LABELS: Record<StatusProcuracaoEmpresa, string> = {
  INVALIDA: 'Invalida',
  NAO_VERIFICADA: 'Nao verificada',
  PENDENTE: 'Pendente',
  VALIDA: 'Valida'
};

function isTipoPendencia(value: string): value is TipoPendencia {
  return value === 'ACESSO' || value === 'PROCURACAO' || value === 'OPERACIONAL';
}

function parseFormState(searchParams: URLSearchParams): PendenciasFormState {
  const empresaId = searchParams.get('empresaId')?.trim() ?? '';
  const responsavelInternoId = searchParams.get('responsavelInternoId')?.trim() ?? '';
  const tipoPendenciaRaw = searchParams.get('tipoPendencia')?.trim() ?? '';

  return {
    empresaId,
    responsavelInternoId,
    tipoPendencia: isTipoPendencia(tipoPendenciaRaw) ? tipoPendenciaRaw : ''
  };
}

function buildApiFilters(form: PendenciasFormState): PendenciaListFilters {
  const filters: PendenciaListFilters = {};

  if (form.empresaId.trim()) {
    filters.empresaId = form.empresaId.trim();
  }

  if (form.responsavelInternoId.trim()) {
    filters.responsavelInternoId = form.responsavelInternoId.trim();
  }

  if (form.tipoPendencia) {
    filters.tipoPendencia = form.tipoPendencia;
  }

  return filters;
}

function buildQueryString(form: PendenciasFormState): string {
  const params = new URLSearchParams();

  if (form.empresaId.trim()) {
    params.set('empresaId', form.empresaId.trim());
  }

  if (form.responsavelInternoId.trim()) {
    params.set('responsavelInternoId', form.responsavelInternoId.trim());
  }

  if (form.tipoPendencia) {
    params.set('tipoPendencia', form.tipoPendencia);
  }

  return params.toString();
}

function getStatusLabel(item: PendenciaListItem): string {
  if (item.tipoPendencia === 'ACESSO') {
    return (
      STATUS_ACESSO_LABELS[item.statusAtual as StatusAcessoEmpresa] ??
      item.statusAtual
    );
  }

  if (item.tipoPendencia === 'PROCURACAO') {
    return (
      STATUS_PROCURACAO_LABELS[item.statusAtual as StatusProcuracaoEmpresa] ??
      item.statusAtual
    );
  }

  return item.statusAtual === 'PENDENTE' ? 'Pendente' : item.statusAtual;
}

function getGroupLabel(item: PendenciaListItem): string {
  return item.responsavelInternoId ? 'Com responsavel' : 'Sem responsavel';
}

function formatResponsavelLabel(item: PendenciaListItem): string {
  return item.responsavelInternoNome;
}

export default function PendenciasPage() {
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const [queryString, setQueryString] = useState('');
  const [formState, setFormState] = useState<PendenciasFormState>(() =>
    parseFormState(new URLSearchParams())
  );
  const [items, setItems] = useState<PendenciaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userName, setUserName] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [reloadIndex, setReloadIndex] = useState(0);

  useEffect(() => {
    const initialQueryString =
      typeof window === 'undefined'
        ? ''
        : window.location.search.replace(/^\?/, '');

    setQueryString(initialQueryString);
    setFormState(parseFormState(new URLSearchParams(initialQueryString)));
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    let active = true;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const user = await requireSession();

        if (!active) {
          return;
        }

        setUserName(user.nome);

        const data = await listPendencias(
          buildApiFilters(parseFormState(new URLSearchParams(queryString)))
        );

        if (!active) {
          return;
        }

        setItems(data);
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

        setItems([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Falha ao carregar pendencias.'
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
  }, [isHydrated, queryString, reloadIndex, router]);

  async function handleLogout() {
    setIsSigningOut(true);

    try {
      await signOut();
    } catch {
      // Logout best effort; redirect below still closes the session view.
    } finally {
      router.replace('/login');
      setIsSigningOut(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const queryString = buildQueryString(formState);
    setQueryString(queryString);
    router.replace(queryString ? `/pendencias?${queryString}` : '/pendencias');
  }

  function handleClearFilters() {
    setFormState(INITIAL_FORM_STATE);
    setQueryString('');
    router.replace('/pendencias');
  }

  if (loading) {
    return (
      <main
        aria-busy="true"
        className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <div className="h-3 w-32 rounded-full bg-slate-200" />
              <div className="h-8 w-56 rounded-full bg-slate-200" />
              <div className="h-4 w-full max-w-xl rounded-full bg-slate-200" />
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="h-10 w-28 rounded-xl bg-slate-200" />
              <div className="h-10 w-24 rounded-xl bg-slate-200" />
            </div>
          </header>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="space-y-3">
              <div className="h-3 w-44 rounded-full bg-slate-200" />
              <div className="h-7 w-72 rounded-full bg-slate-200" />
              <div className="h-4 w-full max-w-2xl rounded-full bg-slate-200" />
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  className="rounded-xl border border-slate-200 p-4"
                  key={`filter-skeleton-${index}`}
                >
                  <div className="h-3 w-24 rounded-full bg-slate-200" />
                  <div className="mt-3 h-10 rounded-xl bg-slate-100" />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="h-4 w-44 rounded-full bg-slate-200" />
              <div className="h-8 w-24 rounded-full bg-slate-200" />
            </div>
            <div className="mt-5 space-y-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  className="rounded-2xl border border-slate-200 p-5"
                  key={`card-skeleton-${index}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="h-4 w-44 rounded-full bg-slate-200" />
                    <div className="h-9 w-28 rounded-full bg-slate-200" />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }).map((__, detailIndex) => (
                      <div
                        className="h-10 rounded-xl bg-slate-100"
                        key={`card-detail-skeleton-${index}-${detailIndex}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
              ECAC AUTOMACAO
            </p>
            <h1 className="text-3xl font-semibold text-slate-950">Pendencias</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Fila derivada diretamente da base local de empresas. Cada item abre
              a empresa de origem para tratamento.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
              href="/dashboard"
            >
              Dashboard
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
              href="/empresas"
            >
              Empresas
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
            className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800"
            role="alert"
          >
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-rose-900">
                Nao foi possivel carregar as pendencias.
              </h2>
              <p className="text-sm leading-6 text-rose-800">{error}</p>
            </div>
            <div>
              <button
                className="inline-flex items-center justify-center rounded-xl bg-rose-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-800"
                onClick={() => setReloadIndex((current) => current + 1)}
                type="button"
              >
                Tentar novamente
              </button>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                Filtros simples
              </p>
              <h2 className="text-lg font-semibold text-slate-950">
                Ajuste a fila por empresa, responsavel ou tipo
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                O filtro principal continua no backend. A interface apenas reflete
                o estado atual da consulta.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {items.length} item{items.length === 1 ? '' : 's'}
            </div>
          </div>

          <form className="mt-5 grid gap-4 lg:grid-cols-3" onSubmit={handleSubmit}>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Empresa ID</span>
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                name="empresaId"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    empresaId: event.target.value
                  }))
                }
                placeholder="Filtrar por id da empresa"
                value={formState.empresaId}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Responsavel interno ID
              </span>
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                name="responsavelInternoId"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    responsavelInternoId: event.target.value
                  }))
                }
                placeholder="Filtrar por id do responsavel"
                value={formState.responsavelInternoId}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Tipo de pendencia
              </span>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                name="tipoPendencia"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    tipoPendencia: event.target.value
                      ? (event.target.value as TipoPendencia)
                      : ''
                  }))
                }
                value={formState.tipoPendencia}
              >
                <option value="">Todas</option>
                <option value="ACESSO">Acesso</option>
                <option value="PROCURACAO">Procuracao</option>
                <option value="OPERACIONAL">Operacional</option>
              </select>
            </label>

            <div className="flex flex-wrap gap-3 lg:col-span-3">
              <button
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                type="submit"
              >
                Aplicar filtros
              </button>
              <button
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
                onClick={handleClearFilters}
                type="button"
              >
                Limpar filtros
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                Fila operacional
              </p>
              <h2 className="text-lg font-semibold text-slate-950">
                Pendencias derivadas das empresas na carteira
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                Acesso irregular, procuração irregular e pendência operacional
                manual geram itens distintos para tratamento.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Sessao ativa de {userName || 'usuario'}
            </div>
          </div>

          {items.length === 0 ? (
            <div className="py-8 text-sm text-slate-600">
              Nenhuma pendencia encontrada para os filtros atuais.
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {items.map((item) => {
                const meta = PENDENCIA_TIPO_META[item.tipoPendencia];

                return (
                  <article
                    className={`rounded-2xl border border-slate-200 border-t-4 bg-white p-5 shadow-sm ${meta.accentClass}`}
                    key={`${item.empresaId}-${item.tipoPendencia}`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-medium ${meta.badgeClass}`}
                          >
                            {meta.shortLabel}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                            {getStatusLabel(item)}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-lg font-semibold text-slate-950">
                            {item.empresaNome}
                          </h3>
                          {item.empresaNomeFantasia ? (
                            <p className="text-sm text-slate-600">
                              {item.empresaNomeFantasia}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <Link
                        className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
                        href={item.linkTratamento}
                      >
                        Abrir empresa
                      </Link>
                    </div>

                    <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      <div className="space-y-1">
                        <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          CNPJ
                        </dt>
                        <dd className="text-sm font-medium text-slate-900">
                          {formatCnpj(item.empresaCnpj)}
                        </dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Responsavel interno
                        </dt>
                        <dd className="text-sm font-medium text-slate-900">
                          {formatResponsavelLabel(item)}
                        </dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Grupo
                        </dt>
                        <dd className="text-sm font-medium text-slate-900">
                          {getGroupLabel(item)}
                        </dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Motivo
                        </dt>
                        <dd className="text-sm font-medium text-slate-900">
                          {item.motivo}
                        </dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Observacao operacional
                        </dt>
                        <dd className="text-sm font-medium text-slate-900">
                          {item.observacaoOperacional || '-'}
                        </dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Ultima conferencia operacional
                        </dt>
                        <dd className="text-sm font-medium text-slate-900">
                          {formatDateTime(item.ultimaConferenciaOperacionalEm)}
                        </dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
