'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import {
  getPendencia,
  listPendencias,
  listResponsaveis,
  updatePendencia,
  type PendenciaListFilters,
  type PendenciaListItem,
  type PendenciaRecord,
  type PrioridadePendencia,
  type ResponsavelInternoRecord,
  type StatusPendencia,
  type TipoPendencia
} from '@/lib/api';
import { requireSession, signOut } from '@/lib/auth';
import { formatCnpj, formatDateTime } from '@/lib/formatters';

type FilterState = {
  empresaId: string;
  prioridade: '' | PrioridadePendencia;
  responsavelInternoId: string;
  status: '' | StatusPendencia;
  tipoPendencia: '' | TipoPendencia;
};

type DetailFormState = {
  descricao: string;
  responsavelInternoId: string;
  status: StatusPendencia;
};

type MutationAction = 'observacao' | 'responsavel' | 'status';

const INITIAL_FILTER_STATE: FilterState = {
  empresaId: '',
  prioridade: '',
  responsavelInternoId: '',
  status: '',
  tipoPendencia: ''
};

const INITIAL_DETAIL_FORM: DetailFormState = {
  descricao: '',
  responsavelInternoId: '',
  status: 'ABERTA'
};

const STATUS_LABELS: Record<StatusPendencia, string> = {
  ABERTA: 'Aberta',
  RESOLVIDA: 'Resolvida'
};

const PRIORIDADE_LABELS: Record<PrioridadePendencia, string> = {
  ALTA: 'Alta',
  BAIXA: 'Baixa',
  MEDIA: 'Media'
};

const TIPO_LABELS: Record<TipoPendencia, string> = {
  ACESSO: 'Acesso',
  OPERACIONAL: 'Operacional',
  PROCURACAO: 'Procuracao'
};

function isTipoPendencia(value: string): value is TipoPendencia {
  return value === 'ACESSO' || value === 'OPERACIONAL' || value === 'PROCURACAO';
}

function isStatusPendencia(value: string): value is StatusPendencia {
  return value === 'ABERTA' || value === 'RESOLVIDA';
}

function isPrioridadePendencia(value: string): value is PrioridadePendencia {
  return value === 'ALTA' || value === 'MEDIA' || value === 'BAIXA';
}

function parseFilters(searchParams: URLSearchParams): FilterState {
  const tipoPendencia = searchParams.get('tipoPendencia')?.trim() ?? '';
  const status = searchParams.get('status')?.trim() ?? '';
  const prioridade = searchParams.get('prioridade')?.trim() ?? '';

  return {
    empresaId: searchParams.get('empresaId')?.trim() ?? '',
    prioridade: isPrioridadePendencia(prioridade) ? prioridade : '',
    responsavelInternoId:
      searchParams.get('responsavelInternoId')?.trim() ?? '',
    status: isStatusPendencia(status) ? status : '',
    tipoPendencia: isTipoPendencia(tipoPendencia) ? tipoPendencia : ''
  };
}

function buildFilters(form: FilterState): PendenciaListFilters {
  const filters: PendenciaListFilters = {};

  if (form.empresaId.trim()) {
    filters.empresaId = form.empresaId.trim();
  }

  if (form.prioridade) {
    filters.prioridade = form.prioridade;
  }

  if (form.responsavelInternoId.trim()) {
    filters.responsavelInternoId = form.responsavelInternoId.trim();
  }

  if (form.status) {
    filters.status = form.status;
  }

  if (form.tipoPendencia) {
    filters.tipoPendencia = form.tipoPendencia;
  }

  return filters;
}

function buildQueryString(form: FilterState): string {
  const params = new URLSearchParams();

  if (form.empresaId.trim()) {
    params.set('empresaId', form.empresaId.trim());
  }

  if (form.prioridade) {
    params.set('prioridade', form.prioridade);
  }

  if (form.responsavelInternoId.trim()) {
    params.set('responsavelInternoId', form.responsavelInternoId.trim());
  }

  if (form.status) {
    params.set('status', form.status);
  }

  if (form.tipoPendencia) {
    params.set('tipoPendencia', form.tipoPendencia);
  }

  return params.toString();
}

function toDetailForm(pendencia: PendenciaRecord): DetailFormState {
  return {
    descricao: pendencia.descricao,
    responsavelInternoId: pendencia.responsavelInternoId ?? '',
    status: pendencia.status
  };
}

function formatOptionalDate(value: string | null | undefined): string {
  return value ? formatDateTime(value) : '-';
}

function formatOptionalText(
  value: string | null | undefined,
  fallback = '-'
): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function formatResponsavelOption(responsavel: ResponsavelInternoRecord): string {
  return `${responsavel.nome} (${responsavel.email})${
    responsavel.ativo ? '' : ' - Inativo'
  }`;
}

export default function PendenciasPage() {
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const [queryString, setQueryString] = useState('');
  const [formState, setFormState] = useState<FilterState>(() =>
    parseFilters(new URLSearchParams())
  );
  const [items, setItems] = useState<PendenciaListItem[]>([]);
  const [responsaveis, setResponsaveis] = useState<ResponsavelInternoRecord[]>(
    []
  );
  const [selectedPendenciaId, setSelectedPendenciaId] = useState('');
  const [selectedPendencia, setSelectedPendencia] =
    useState<PendenciaRecord | null>(null);
  const [detailForm, setDetailForm] = useState<DetailFormState>(
    INITIAL_DETAIL_FORM
  );
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [message, setMessage] = useState('');
  const [userName, setUserName] = useState('');
  const [reloadIndex, setReloadIndex] = useState(0);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [activeMutation, setActiveMutation] = useState<MutationAction | null>(
    null
  );

  useEffect(() => {
    const currentQuery =
      typeof window === 'undefined'
        ? ''
        : window.location.search.replace(/^\?/, '');

    setQueryString(currentQuery);
    setFormState(parseFilters(new URLSearchParams(currentQuery)));
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
        const filters = buildFilters(
          parseFilters(new URLSearchParams(queryString))
        );
        const [user, responsavelItems, pendenciaItems] = await Promise.all([
          requireSession(),
          listResponsaveis(),
          listPendencias(filters)
        ]);

        if (!active) {
          return;
        }

        setUserName(user.nome);
        setResponsaveis(responsavelItems);
        setItems(pendenciaItems);
        setSelectedPendenciaId((current) => {
          if (pendenciaItems.length === 0) {
            return '';
          }

          return current && pendenciaItems.some((item) => item.id === current)
            ? current
            : (pendenciaItems[0]?.id ?? '');
        });
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
        setResponsaveis([]);
        setSelectedPendenciaId('');
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

  useEffect(() => {
    if (!selectedPendenciaId) {
      setSelectedPendencia(null);
      setDetailForm(INITIAL_DETAIL_FORM);
      setDetailError('');
      setDetailLoading(false);
      return;
    }

    let active = true;

    async function loadDetail() {
      setDetailLoading(true);
      setDetailError('');

      try {
        const pendencia = await getPendencia(selectedPendenciaId);

        if (!active) {
          return;
        }

        setSelectedPendencia(pendencia);
        setDetailForm(toDetailForm(pendencia));
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

        setSelectedPendencia(null);
        setDetailError(
          loadError instanceof Error
            ? loadError.message
            : 'Falha ao carregar a pendencia selecionada.'
        );
      } finally {
        if (active) {
          setDetailLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      active = false;
    };
  }, [selectedPendenciaId, router]);

  async function handleLogout() {
    setIsSigningOut(true);

    try {
      await signOut();
    } catch {
      // Best effort logout.
    } finally {
      router.replace('/login');
      setIsSigningOut(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setDetailError('');

    const nextQueryString = buildQueryString(formState);
    setQueryString(nextQueryString);
    router.replace(nextQueryString ? `/pendencias?${nextQueryString}` : '/pendencias');
  }

  function handleClearFilters() {
    setFormState(INITIAL_FILTER_STATE);
    setMessage('');
    setDetailError('');
    setQueryString('');
    router.replace('/pendencias');
  }

  async function runMutation(
    action: MutationAction,
    payload: {
      descricao?: string;
      responsavelInternoId?: string | null;
      status?: StatusPendencia;
    },
    successMessage: string
  ) {
    if (!selectedPendencia) {
      return;
    }

    setActiveMutation(action);
    setMessage('');
    setDetailError('');

    try {
      const updated = await updatePendencia(selectedPendencia.id, payload);

      setSelectedPendencia(updated);
      setDetailForm(toDetailForm(updated));
      setMessage(successMessage);
      setReloadIndex((current) => current + 1);
    } catch (submitError) {
      if (
        submitError instanceof Error &&
        submitError.message === 'Nao autenticado.'
      ) {
        router.replace('/login');
        return;
      }

      setDetailError(
        submitError instanceof Error
          ? submitError.message
          : 'Falha ao atualizar a pendencia.'
      );
    } finally {
      setActiveMutation(null);
    }
  }

  function handleStatusUpdate() {
    if (!selectedPendencia) {
      return;
    }

    if (detailForm.status === selectedPendencia.status) {
      setMessage('Status ja aplicado na pendencia selecionada.');
      setDetailError('');
      return;
    }

    void runMutation(
      'status',
      { status: detailForm.status },
      detailForm.status === 'RESOLVIDA'
        ? 'Pendencia marcada como resolvida.'
        : 'Pendencia reaberta.'
    );
  }

  function handleResponsavelUpdate() {
    if (!selectedPendencia) {
      return;
    }

    if (
      detailForm.responsavelInternoId ===
      (selectedPendencia.responsavelInternoId ?? '')
    ) {
      setMessage('Responsavel ja aplicado na pendencia selecionada.');
      setDetailError('');
      return;
    }

    void runMutation(
      'responsavel',
      { responsavelInternoId: detailForm.responsavelInternoId || null },
      detailForm.responsavelInternoId
        ? 'Pendencia reatribuida.'
        : 'Pendencia atualizada sem responsavel.'
    );
  }

  function handleObservationUpdate() {
    if (!selectedPendencia) {
      return;
    }

    const nextDescricao = detailForm.descricao.trim();
    const currentDescricao = selectedPendencia.descricao.trim();

    if (!nextDescricao) {
      setDetailError('Informe a observacao operacional antes de salvar.');
      setMessage('');
      return;
    }

    if (nextDescricao === currentDescricao) {
      setMessage('Observacao ja registrada na pendencia selecionada.');
      setDetailError('');
      return;
    }

    void runMutation(
      'observacao',
      { descricao: nextDescricao },
      'Observacao operacional registrada.'
    );
  }

  const pendenciasAbertas = items.filter((item) => item.status === 'ABERTA').length;
  const pendenciasResolvidas = items.filter(
    (item) => item.status === 'RESOLVIDA'
  ).length;
  const pendenciasAltaPrioridade = items.filter(
    (item) => item.status === 'ABERTA' && item.prioridade === 'ALTA'
  ).length;

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          Carregando fila global de pendencias...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
              ECAC AUTOMACAO
            </p>
            <h1 className="text-3xl font-semibold text-slate-950">
              Pendencias globais
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              Mesa operacional da fila persistida para tratar status,
              reatribuicao e observacoes sem sair do nucleo manual ja em uso.
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
            className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"
            role="alert"
          >
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-rose-900">
                Nao foi possivel carregar a fila global de pendencias.
              </h2>
              <p className="leading-6">{error}</p>
            </div>
            <button
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-rose-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-800"
              onClick={() => setReloadIndex((current) => current + 1)}
              type="button"
            >
              Tentar novamente
            </button>
          </section>
        ) : null}

        {message ? (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
            {message}
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
              Pendencias abertas
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {pendenciasAbertas}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
              Alta prioridade aberta
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {pendenciasAltaPrioridade}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
              Resolvidas no recorte
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {pendenciasResolvidas}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                Filtros operacionais
              </p>
              <h2 className="text-lg font-semibold text-slate-950">
                Prioridade, responsavel, status e tipo
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-slate-600">
                O backend continua filtrando a fila persistida. A tela apenas
                centraliza o trabalho operacional.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {items.length} pendencia{items.length === 1 ? '' : 's'} no recorte
            </div>
          </div>

          <form className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5" onSubmit={handleSubmit}>
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
                placeholder="Opcional"
                value={formState.empresaId}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Responsavel
              </span>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    responsavelInternoId: event.target.value
                  }))
                }
                value={formState.responsavelInternoId}
              >
                <option value="">Todos</option>
                {responsaveis.map((responsavel) => (
                  <option key={responsavel.id} value={responsavel.id}>
                    {formatResponsavelOption(responsavel)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Status</span>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    status: event.target.value
                      ? (event.target.value as StatusPendencia)
                      : ''
                  }))
                }
                value={formState.status}
              >
                <option value="">Todos</option>
                <option value="ABERTA">Aberta</option>
                <option value="RESOLVIDA">Resolvida</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Prioridade
              </span>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    prioridade: event.target.value
                      ? (event.target.value as PrioridadePendencia)
                      : ''
                  }))
                }
                value={formState.prioridade}
              >
                <option value="">Todas</option>
                <option value="ALTA">Alta</option>
                <option value="MEDIA">Media</option>
                <option value="BAIXA">Baixa</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Tipo de pendencia
              </span>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
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
                <option value="">Todos</option>
                <option value="ACESSO">Acesso</option>
                <option value="OPERACIONAL">Operacional</option>
                <option value="PROCURACAO">Procuracao</option>
              </select>
            </label>

            <div className="flex flex-wrap gap-3 md:col-span-2 xl:col-span-5">
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
                Fila persistida
              </p>
              <h2 className="text-lg font-semibold text-slate-950">
                Tratamento centralizado de pendencias
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-slate-600">
                Selecione um item para abrir o detalhe, alterar o status,
                reatribuir e registrar observacao operacional.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Sessao ativa de {userName || 'usuario'}
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,420px)]">
            <div className="space-y-4">
              {items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-sm text-slate-600">
                  Nenhuma pendencia encontrada para os filtros atuais.
                </div>
              ) : (
                items.map((item) => {
                  const isSelected = item.id === selectedPendenciaId;

                  return (
                    <article
                      className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
                        isSelected
                          ? 'border-slate-900 shadow-md'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                      key={item.id}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                              {TIPO_LABELS[item.tipoPendencia]}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                              {STATUS_LABELS[item.status]}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                              {PRIORIDADE_LABELS[item.prioridade]}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-slate-950">
                              {item.titulo}
                            </h3>
                            <p className="text-sm font-medium text-slate-700">
                              {item.empresaNome}
                            </p>
                            {item.empresaNomeFantasia ? (
                              <p className="text-sm text-slate-500">
                                {item.empresaNomeFantasia}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <button
                            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
                            onClick={() => {
                              setMessage('');
                              setDetailError('');
                              setSelectedPendenciaId(item.id);
                            }}
                            type="button"
                          >
                            {isSelected ? 'Detalhe aberto' : 'Abrir detalhe'}
                          </button>
                          <Link
                            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
                            href={item.linkTratamento}
                          >
                            Abrir empresa
                          </Link>
                        </div>
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
                            Responsavel
                          </dt>
                          <dd className="text-sm font-medium text-slate-900">
                            {item.responsavelInternoNome}
                          </dd>
                        </div>
                        <div className="space-y-1">
                          <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                            Aberta em
                          </dt>
                          <dd className="text-sm font-medium text-slate-900">
                            {formatOptionalDate(item.abertaEm)}
                          </dd>
                        </div>
                        <div className="space-y-1">
                          <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                            Fechada em
                          </dt>
                          <dd className="text-sm font-medium text-slate-900">
                            {formatOptionalDate(item.fechadaEm)}
                          </dd>
                        </div>
                        <div className="space-y-1">
                          <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                            Origem
                          </dt>
                          <dd className="text-sm font-medium text-slate-900">
                            {formatOptionalText(item.origem, 'Manual')}
                          </dd>
                        </div>
                        <div className="space-y-1">
                          <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                            Observacao
                          </dt>
                          <dd className="text-sm font-medium text-slate-900">
                            {formatOptionalText(item.descricao)}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  );
                })
              )}
            </div>

            <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm xl:sticky xl:top-8">
              <div className="space-y-1 border-b border-slate-200 pb-4">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                  Detalhe da pendencia
                </p>
                <h2 className="text-lg font-semibold text-slate-950">
                  Tratamento operacional
                </h2>
                <p className="text-sm leading-6 text-slate-600">
                  Atualize a pendencia persistida sem quebrar o fluxo atual da
                  carteira.
                </p>
              </div>

              {detailError ? (
                <div
                  className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
                  role="alert"
                >
                  {detailError}
                </div>
              ) : null}

              {detailLoading ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-8 text-sm text-slate-600">
                  Carregando detalhe da pendencia...
                </div>
              ) : !selectedPendencia ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600">
                  Selecione uma pendencia da lista para abrir o detalhe.
                </div>
              ) : (
                <div className="mt-4 space-y-5">
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                        {TIPO_LABELS[selectedPendencia.tipo]}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                        {STATUS_LABELS[selectedPendencia.status]}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                        {PRIORIDADE_LABELS[selectedPendencia.prioridade]}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-base font-semibold text-slate-950">
                        {selectedPendencia.titulo}
                      </h3>
                      <p className="text-sm font-medium text-slate-700">
                        {selectedPendencia.empresaNome}
                      </p>
                      <p className="text-sm text-slate-500">
                        {selectedPendencia.responsavelInternoNome}
                      </p>
                    </div>

                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      <div className="space-y-1">
                        <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          CNPJ
                        </dt>
                        <dd className="font-medium text-slate-900">
                          {formatCnpj(selectedPendencia.empresaCnpj)}
                        </dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Origem
                        </dt>
                        <dd className="font-medium text-slate-900">
                          {formatOptionalText(selectedPendencia.origem, 'Manual')}
                        </dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Aberta em
                        </dt>
                        <dd className="font-medium text-slate-900">
                          {formatOptionalDate(selectedPendencia.abertaEm)}
                        </dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Fechada em
                        </dt>
                        <dd className="font-medium text-slate-900">
                          {formatOptionalDate(selectedPendencia.fechadaEm)}
                        </dd>
                      </div>
                    </dl>

                    <Link
                      className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
                      href={selectedPendencia.linkTratamento}
                    >
                      Abrir empresa de origem
                    </Link>
                  </div>

                  <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-slate-950">
                        Alterar status
                      </h3>
                      <p className="text-sm leading-6 text-slate-600">
                        Feche ou reabra a pendencia pela fila global.
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <select
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                        onChange={(event) =>
                          setDetailForm((current) => ({
                            ...current,
                            status: event.target.value as StatusPendencia
                          }))
                        }
                        value={detailForm.status}
                      >
                        <option value="ABERTA">Aberta</option>
                        <option value="RESOLVIDA">Resolvida</option>
                      </select>
                      <button
                        className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={activeMutation !== null}
                        onClick={handleStatusUpdate}
                        type="button"
                      >
                        {activeMutation === 'status' ? 'Salvando...' : 'Salvar status'}
                      </button>
                    </div>
                  </section>

                  <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-slate-950">
                        Reatribuir pendencia
                      </h3>
                      <p className="text-sm leading-6 text-slate-600">
                        Troque o responsavel sem sair da fila operacional.
                      </p>
                    </div>
                    <select
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                      onChange={(event) =>
                        setDetailForm((current) => ({
                          ...current,
                          responsavelInternoId: event.target.value
                        }))
                      }
                      value={detailForm.responsavelInternoId}
                    >
                      <option value="">Sem responsavel</option>
                      {responsaveis.map((responsavel) => (
                        <option key={responsavel.id} value={responsavel.id}>
                          {formatResponsavelOption(responsavel)}
                        </option>
                      ))}
                    </select>
                    <button
                      className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={activeMutation !== null}
                      onClick={handleResponsavelUpdate}
                      type="button"
                    >
                      {activeMutation === 'responsavel'
                        ? 'Salvando...'
                        : 'Salvar responsavel'}
                    </button>
                  </section>

                  <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-slate-950">
                        Observacao operacional
                      </h3>
                      <p className="text-sm leading-6 text-slate-600">
                        Registre o contexto para manter a fila rastreavel.
                      </p>
                    </div>
                    <textarea
                      className="min-h-32 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                      onChange={(event) =>
                        setDetailForm((current) => ({
                          ...current,
                          descricao: event.target.value
                        }))
                      }
                      placeholder="Descreva o contexto operacional da pendencia."
                      value={detailForm.descricao}
                    />
                    <button
                      className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={activeMutation !== null}
                      onClick={handleObservationUpdate}
                      type="button"
                    >
                      {activeMutation === 'observacao'
                        ? 'Salvando...'
                        : 'Salvar observacao'}
                    </button>
                  </section>
                </div>
              )}
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
