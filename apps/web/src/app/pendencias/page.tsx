'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import {
  getPendencia,
  listPendenciaLogs,
  listPendencias,
  listResponsaveis,
  updatePendencia,
  type LogExecucaoRecord,
  type PendenciaListFilters,
  type PendenciaListItem,
  type PendenciaRecord,
  type PendenciaSortBy,
  type PrioridadePendencia,
  type ResponsavelInternoRecord,
  type SortDirection,
  type StatusPendencia,
  type TipoPendencia
} from '@/lib/api';
import { requireSession, signOut } from '@/lib/auth';
import { formatCnpj, formatDateTime } from '@/lib/formatters';

type FilterState = {
  empresaId: string;
  page: number;
  prioridade: '' | PrioridadePendencia;
  responsavelInternoId: string;
  sortBy: PendenciaSortBy;
  sortDirection: SortDirection;
  status: '' | StatusPendencia;
  tipoPendencia: '' | TipoPendencia;
};

type DetailFormState = {
  descricao: string;
  responsavelInternoId: string;
  status: StatusPendencia;
};

type MutationAction = 'observacao' | 'responsavel' | 'status';

type TimelineEvent = {
  actor: string;
  details: string | null;
  executedAt: string;
  id: string;
  resultLabel: string | null;
  summary: string;
  typeLabel: string;
};

const DEFAULT_PAGE = 1;
const DEFAULT_SORT_BY: PendenciaSortBy = 'PRIORIDADE';
const DEFAULT_SORT_DIRECTION: SortDirection = 'ASC';
const PAGE_SIZE = 10;
const TIMELINE_TAKE = 20;

const INITIAL_FILTER_STATE: FilterState = {
  empresaId: '',
  page: DEFAULT_PAGE,
  prioridade: '',
  responsavelInternoId: '',
  sortBy: DEFAULT_SORT_BY,
  sortDirection: DEFAULT_SORT_DIRECTION,
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

function isPendenciaSortBy(value: string): value is PendenciaSortBy {
  return (
    value === 'PRIORIDADE' ||
    value === 'ABERTA_EM' ||
    value === 'ATUALIZADA_EM' ||
    value === 'STATUS'
  );
}

function isSortDirection(value: string): value is SortDirection {
  return value === 'ASC' || value === 'DESC';
}

function parseFilters(searchParams: URLSearchParams): FilterState {
  const page = Number(searchParams.get('page') ?? DEFAULT_PAGE);
  const prioridade = searchParams.get('prioridade')?.trim() ?? '';
  const status = searchParams.get('status')?.trim() ?? '';
  const tipoPendencia = searchParams.get('tipoPendencia')?.trim() ?? '';
  const sortBy = searchParams.get('sortBy')?.trim() ?? '';
  const sortDirection = searchParams.get('sortDirection')?.trim() ?? '';

  return {
    empresaId: searchParams.get('empresaId')?.trim() ?? '',
    page: Number.isFinite(page) && page >= DEFAULT_PAGE ? page : DEFAULT_PAGE,
    prioridade: isPrioridadePendencia(prioridade) ? prioridade : '',
    responsavelInternoId:
      searchParams.get('responsavelInternoId')?.trim() ?? '',
    sortBy: isPendenciaSortBy(sortBy) ? sortBy : DEFAULT_SORT_BY,
    sortDirection: isSortDirection(sortDirection)
      ? sortDirection
      : DEFAULT_SORT_DIRECTION,
    status: isStatusPendencia(status) ? status : '',
    tipoPendencia: isTipoPendencia(tipoPendencia) ? tipoPendencia : ''
  };
}

function buildFilters(form: FilterState): PendenciaListFilters {
  const filters: PendenciaListFilters = {
    page: form.page,
    sortBy: form.sortBy,
    sortDirection: form.sortDirection,
    take: PAGE_SIZE
  };

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

  if (form.page > DEFAULT_PAGE) {
    params.set('page', String(form.page));
  }

  if (form.prioridade) {
    params.set('prioridade', form.prioridade);
  }

  if (form.responsavelInternoId.trim()) {
    params.set('responsavelInternoId', form.responsavelInternoId.trim());
  }

  if (form.sortBy !== DEFAULT_SORT_BY) {
    params.set('sortBy', form.sortBy);
  }

  if (form.sortDirection !== DEFAULT_SORT_DIRECTION) {
    params.set('sortDirection', form.sortDirection);
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

function formatLogTypeLabel(value: LogExecucaoRecord['tipo']): string {
  switch (value) {
    case 'CONFERENCIA_OPERACIONAL':
      return 'Conferencia operacional';
    case 'REGISTRO_PENDENCIA':
      return 'Registro de pendencia';
    case 'REGULARIZACAO_PENDENCIA':
      return 'Regularizacao de pendencia';
    case 'RETIRADA_CARTEIRA':
    default:
      return 'Retirada da carteira';
  }
}

function formatLogResultLabel(value: LogExecucaoRecord['resultado']): string {
  switch (value) {
    case 'FALHA':
      return 'Falha';
    case 'SEM_ALTERACAO':
      return 'Sem alteracao';
    case 'SUCESSO':
    default:
      return 'Sucesso';
  }
}

function buildTimelineEvents(
  pendencia: PendenciaRecord | null,
  logs: LogExecucaoRecord[]
): TimelineEvent[] {
  if (!pendencia) {
    return [];
  }

  const hasCreationLog = logs.some(
    (log) =>
      log.pendenciaId === pendencia.id &&
      log.tipo === 'REGISTRO_PENDENCIA' &&
      log.resumo.startsWith('Pendencia registrada:')
  );

  const events = logs.map<TimelineEvent>((log) => ({
    actor: log.executadoPorUsuarioInternoNome,
    details: log.detalhes,
    executedAt: log.executadoEm,
    id: log.id,
    resultLabel: formatLogResultLabel(log.resultado),
    summary: log.resumo,
    typeLabel: formatLogTypeLabel(log.tipo)
  }));

  if (!hasCreationLog) {
    events.push({
      actor: pendencia.criadaPorUsuarioInternoNome ?? 'Sistema',
      details: pendencia.origem
        ? `Pendencia cadastrada com origem ${pendencia.origem}.`
        : 'Pendencia cadastrada na fila operacional.',
      executedAt: pendencia.createdAt,
      id: `pendencia-created-${pendencia.id}`,
      resultLabel: null,
      summary: `Pendencia criada: ${pendencia.titulo}`,
      typeLabel: 'Cadastro da pendencia'
    });
  }

  return events.sort((left, right) =>
    left.executedAt.localeCompare(right.executedAt, 'pt-BR')
  );
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
  const [selectedPendenciaLogs, setSelectedPendenciaLogs] = useState<
    LogExecucaoRecord[]
  >([]);
  const [detailForm, setDetailForm] = useState<DetailFormState>(
    INITIAL_DETAIL_FORM
  );
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [message, setMessage] = useState('');
  const [userName, setUserName] = useState('');
  const [detailReloadIndex, setDetailReloadIndex] = useState(0);
  const [reloadIndex, setReloadIndex] = useState(0);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [activeMutation, setActiveMutation] = useState<MutationAction | null>(
    null
  );

  function navigateWithState(nextState: FilterState) {
    const nextQueryString = buildQueryString(nextState);
    setFormState(nextState);
    setQueryString(nextQueryString);
    router.replace(nextQueryString ? `/pendencias?${nextQueryString}` : '/pendencias');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setDetailError('');
    navigateWithState(formState);
  }

  function handleClearFilters() {
    setMessage('');
    setDetailError('');
    setQueryString('');
    setFormState(INITIAL_FILTER_STATE);
    router.replace('/pendencias');
  }

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
      setSelectedPendenciaLogs([]);
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
        const [pendencia, logs] = await Promise.all([
          getPendencia(selectedPendenciaId),
          listPendenciaLogs(selectedPendenciaId, {
            take: TIMELINE_TAKE
          })
        ]);

        if (!active) {
          return;
        }

        setSelectedPendencia(pendencia);
        setSelectedPendenciaLogs(logs);
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
        setSelectedPendenciaLogs([]);
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
  }, [detailReloadIndex, selectedPendenciaId, router]);

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
      setDetailReloadIndex((current) => current + 1);
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
  const hasPreviousPage = formState.page > DEFAULT_PAGE;
  const hasNextPage = items.length === PAGE_SIZE;
  const timelineEvents = buildTimelineEvents(
    selectedPendencia,
    selectedPendenciaLogs
  );

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
              Mesa operacional da fila persistida com leitura auditavel de cada
              pendencia, sem abrir dashboard nem frentes paralelas.
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
                Fila global com ordenacao e navegacao minima
              </h2>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {items.length} pendencia{items.length === 1 ? '' : 's'} na pagina
            </div>
          </div>

          <form className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6" onSubmit={handleSubmit}>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Empresa ID</span>
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    empresaId: event.target.value,
                    page: DEFAULT_PAGE
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
                    page: DEFAULT_PAGE,
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
                    page: DEFAULT_PAGE,
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
                    page: DEFAULT_PAGE,
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
                    page: DEFAULT_PAGE,
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

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Ordenar por</span>
                <select
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      page: DEFAULT_PAGE,
                      sortBy: event.target.value as PendenciaSortBy
                    }))
                  }
                  value={formState.sortBy}
                >
                  <option value="PRIORIDADE">Prioridade</option>
                  <option value="ABERTA_EM">Data de abertura</option>
                  <option value="ATUALIZADA_EM">Atualizacao mais recente</option>
                  <option value="STATUS">Status</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Direcao</span>
                <select
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      page: DEFAULT_PAGE,
                      sortDirection: event.target.value as SortDirection
                    }))
                  }
                  value={formState.sortDirection}
                >
                  <option value="ASC">Ascendente</option>
                  <option value="DESC">Descendente</option>
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-3 md:col-span-2 xl:col-span-6">
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

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                  Fila da pagina atual
                </p>
                <h2 className="text-lg font-semibold text-slate-950">
                  Pendencias trataveis
                </h2>
              </div>

              <div className="flex items-center gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!hasPreviousPage}
                  onClick={() =>
                    navigateWithState({
                      ...formState,
                      page: Math.max(DEFAULT_PAGE, formState.page - 1)
                    })
                  }
                  type="button"
                >
                  Pagina anterior
                </button>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                  Pagina {formState.page}
                </div>
                <button
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!hasNextPage}
                  onClick={() =>
                    navigateWithState({
                      ...formState,
                      page: formState.page + 1
                    })
                  }
                  type="button"
                >
                  Proxima pagina
                </button>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600 shadow-sm">
                Nenhuma pendencia encontrada com os filtros atuais.
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => {
                  const isSelected = item.id === selectedPendenciaId;

                  return (
                    <button
                      key={item.id}
                      className={`w-full rounded-2xl border p-5 text-left shadow-sm transition ${
                        isSelected
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300'
                      }`}
                      onClick={() => {
                        setMessage('');
                        setDetailError('');
                        setSelectedPendenciaId(item.id);
                      }}
                      type="button"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <p
                              className={`text-xs font-medium uppercase tracking-[0.22em] ${
                                isSelected ? 'text-slate-300' : 'text-slate-500'
                              }`}
                            >
                              {TIPO_LABELS[item.tipo]}
                            </p>
                            <h3 className="text-lg font-semibold">
                              {item.titulo}
                            </h3>
                            <p
                              className={`text-sm leading-6 ${
                                isSelected ? 'text-slate-200' : 'text-slate-600'
                              }`}
                            >
                              {item.empresaNome}
                            </p>
                          </div>

                          <div
                            className={`grid gap-2 text-sm sm:grid-cols-2 ${
                              isSelected ? 'text-slate-200' : 'text-slate-600'
                            }`}
                          >
                            <p>
                              <span className="font-medium">Responsavel:</span>{' '}
                              {item.responsavelInternoNome}
                            </p>
                            <p>
                              <span className="font-medium">Prioridade:</span>{' '}
                              {PRIORIDADE_LABELS[item.prioridade]}
                            </p>
                            <p>
                              <span className="font-medium">Status:</span>{' '}
                              {STATUS_LABELS[item.status]}
                            </p>
                            <p>
                              <span className="font-medium">Abertura:</span>{' '}
                              {formatDateTime(item.abertaEm)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                              isSelected
                                ? 'bg-white/10 text-white'
                                : item.status === 'ABERTA'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-emerald-100 text-emerald-900'
                            }`}
                          >
                            {STATUS_LABELS[item.status]}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                              isSelected
                                ? 'bg-white/10 text-white'
                                : item.prioridade === 'ALTA'
                                  ? 'bg-rose-100 text-rose-900'
                                  : item.prioridade === 'MEDIA'
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {PRIORIDADE_LABELS[item.prioridade]}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                      Leitura auditavel
                    </p>
                    <h2 className="text-lg font-semibold text-slate-950">
                      Detalhe da pendencia
                    </h2>
                  </div>

                  {selectedPendencia ? (
                    <Link
                      className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
                      href={selectedPendencia.linkTratamento}
                    >
                      Abrir empresa
                    </Link>
                  ) : null}
                </div>

                <p className="text-sm leading-6 text-slate-600">
                  {selectedPendencia
                    ? 'Acoes operacionais e historico da pendencia selecionada dentro da propria mesa de trabalho.'
                    : 'Selecione uma pendencia na fila para abrir o tratamento auditavel.'}
                </p>
              </div>

              {detailLoading ? (
                <div className="py-8 text-sm text-slate-600">
                  Carregando detalhe da pendencia...
                </div>
              ) : detailError ? (
                <div
                  className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
                  role="alert"
                >
                  {detailError}
                </div>
              ) : !selectedPendencia ? (
                <div className="py-8 text-sm text-slate-600">
                  Nenhuma pendencia selecionada nesta pagina.
                </div>
              ) : (
                <div className="mt-5 space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
                          {TIPO_LABELS[selectedPendencia.tipo]}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                            selectedPendencia.status === 'ABERTA'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-emerald-100 text-emerald-900'
                          }`}
                        >
                          {STATUS_LABELS[selectedPendencia.status]}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                            selectedPendencia.prioridade === 'ALTA'
                              ? 'bg-rose-100 text-rose-900'
                              : selectedPendencia.prioridade === 'MEDIA'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {PRIORIDADE_LABELS[selectedPendencia.prioridade]}
                        </span>
                      </div>

                      <h3 className="text-xl font-semibold text-slate-950">
                        {selectedPendencia.titulo}
                      </h3>
                      <p className="text-sm leading-6 text-slate-600">
                        {selectedPendencia.empresaNome}
                      </p>
                    </div>

                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <dt className="font-medium text-slate-700">CNPJ</dt>
                        <dd className="mt-1 text-slate-900">
                          {formatCnpj(selectedPendencia.empresaCnpj)}
                        </dd>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <dt className="font-medium text-slate-700">Responsavel</dt>
                        <dd className="mt-1 text-slate-900">
                          {selectedPendencia.responsavelInternoNome}
                        </dd>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <dt className="font-medium text-slate-700">Abertura</dt>
                        <dd className="mt-1 text-slate-900">
                          {formatDateTime(selectedPendencia.abertaEm)}
                        </dd>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <dt className="font-medium text-slate-700">Fechamento</dt>
                        <dd className="mt-1 text-slate-900">
                          {formatOptionalDate(selectedPendencia.fechadaEm)}
                        </dd>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <dt className="font-medium text-slate-700">Criada por</dt>
                        <dd className="mt-1 text-slate-900">
                          {formatOptionalText(
                            selectedPendencia.criadaPorUsuarioInternoNome,
                            'Sistema'
                          )}
                        </dd>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <dt className="font-medium text-slate-700">
                          Ultima atualizacao
                        </dt>
                        <dd className="mt-1 text-slate-900">
                          {formatDateTime(selectedPendencia.updatedAt)}
                        </dd>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                        <dt className="font-medium text-slate-700">Origem</dt>
                        <dd className="mt-1 text-slate-900">
                          {formatOptionalText(
                            selectedPendencia.origem,
                            'Nao informada'
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold text-slate-950">
                        Tratamento direto da pendencia
                      </h3>
                      <p className="text-sm leading-6 text-slate-600">
                        Atualize o status, reatribua o responsavel e registre a
                        observacao sem sair da mesa global.
                      </p>
                    </div>

                    <div className="grid gap-4">
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                        <label className="space-y-2">
                          <span className="text-sm font-medium text-slate-700">
                            Status da pendencia
                          </span>
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
                        </label>

                        <button
                          className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={activeMutation !== null}
                          onClick={handleStatusUpdate}
                          type="button"
                        >
                          {activeMutation === 'status'
                            ? 'Salvando status...'
                            : 'Salvar status'}
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                        <label className="space-y-2">
                          <span className="text-sm font-medium text-slate-700">
                            Responsavel atual
                          </span>
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
                        </label>

                        <button
                          className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={activeMutation !== null}
                          onClick={handleResponsavelUpdate}
                          type="button"
                        >
                          {activeMutation === 'responsavel'
                            ? 'Reatribuindo...'
                            : 'Salvar responsavel'}
                        </button>
                      </div>

                      <div className="grid gap-3">
                        <label className="space-y-2">
                          <span className="text-sm font-medium text-slate-700">
                            Observacao operacional
                          </span>
                          <textarea
                            className="min-h-28 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                            onChange={(event) =>
                              setDetailForm((current) => ({
                                ...current,
                                descricao: event.target.value
                              }))
                            }
                            placeholder="Registre a observacao operacional da pendencia."
                            value={detailForm.descricao}
                          />
                        </label>

                        <div className="flex justify-end">
                          <button
                            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={activeMutation !== null}
                            onClick={handleObservationUpdate}
                            type="button"
                          >
                            {activeMutation === 'observacao'
                              ? 'Salvando observacao...'
                              : 'Salvar observacao'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 border-b border-slate-200 pb-5">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                  Timeline da pendencia
                </p>
                <h2 className="text-lg font-semibold text-slate-950">
                  Historico operacional cronologico
                </h2>
                <p className="text-sm leading-6 text-slate-600">
                  Leitura direta dos eventos persistidos em `LogExecucao` para a
                  pendencia selecionada.
                </p>
              </div>

              {detailLoading ? (
                <div className="py-8 text-sm text-slate-600">
                  Carregando timeline...
                </div>
              ) : !selectedPendencia ? (
                <div className="py-8 text-sm text-slate-600">
                  Selecione uma pendencia para consultar o historico.
                </div>
              ) : timelineEvents.length === 0 ? (
                <div className="py-8 text-sm text-slate-600">
                  Nenhum evento operacional encontrado para esta pendencia.
                </div>
              ) : (
                <ol className="mt-5 space-y-4">
                  {timelineEvents.map((event, index) => (
                    <li key={event.id} className="relative pl-8">
                      <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full bg-slate-900" />
                      {index < timelineEvents.length - 1 ? (
                        <span className="absolute left-[5px] top-5 h-[calc(100%+1rem)] w-px bg-slate-200" />
                      ) : null}

                      <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                              {event.typeLabel}
                            </p>
                            <h3 className="text-sm font-semibold text-slate-950">
                              {event.summary}
                            </h3>
                          </div>

                          {event.resultLabel ? (
                            <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
                              {event.resultLabel}
                            </span>
                          ) : null}
                        </div>

                        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="font-medium text-slate-700">Quem fez</dt>
                            <dd className="mt-1 text-slate-900">{event.actor}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-slate-700">Quando fez</dt>
                            <dd className="mt-1 text-slate-900">
                              {formatDateTime(event.executedAt)}
                            </dd>
                          </div>
                        </dl>

                        {event.details ? (
                          <p className="mt-3 text-sm leading-6 text-slate-600">
                            {event.details}
                          </p>
                        ) : null}
                      </article>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
