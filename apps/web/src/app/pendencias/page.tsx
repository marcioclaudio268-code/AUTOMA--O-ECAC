'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import {
  listPendencias,
  listResponsaveis,
  type PendenciaListItem,
  type PendenciaTipo,
  type ResponsavelInternoRecord,
  type StatusAcessoEmpresa,
  type StatusProcuracaoEmpresa
} from '@/lib/api';
import { requireSession, signOut } from '@/lib/auth';
import {
  PENDENCIA_TIPO_LABELS,
  PENDENCIA_TIPO_OPTIONS,
  STATUS_ACESSO_LABELS,
  STATUS_PROCURACAO_LABELS
} from '@/lib/constants';
import { formatCnpj, formatDateTime } from '@/lib/formatters';

const SEM_RESPONSAVEL_FILTER = '__sem_responsavel__';

type PendenciasFilterState = {
  empresaId: string;
  responsavelInternoId: string;
  tipoPendencia: PendenciaTipo | '';
};

const initialFilters: PendenciasFilterState = {
  empresaId: '',
  responsavelInternoId: '',
  tipoPendencia: ''
};

function parseFiltersFromSearch(search: string): PendenciasFilterState {
  const params = new URLSearchParams(search);
  const tipoPendencia = params.get('tipoPendencia');

  return {
    empresaId: params.get('empresaId')?.trim() || '',
    responsavelInternoId: params.get('responsavelInternoId')?.trim() || '',
    tipoPendencia: PENDENCIA_TIPO_OPTIONS.some(
      (option) => option.value === tipoPendencia
    )
      ? (tipoPendencia as PendenciaTipo)
      : ''
  };
}

function buildQueryFilters(filters: PendenciasFilterState) {
  return {
    empresaId: filters.empresaId.trim() || undefined,
    responsavelInternoId: filters.responsavelInternoId.trim() || undefined,
    tipoPendencia: filters.tipoPendencia || undefined
  };
}

function formatResponsavelOption(responsavel: ResponsavelInternoRecord) {
  return `${responsavel.nome} (${responsavel.email})${
    responsavel.ativo ? '' : ' - Inativo'
  }`;
}

function formatStatusAtual(item: PendenciaListItem) {
  if (item.tipoPendencia === 'ACESSO') {
    return STATUS_ACESSO_LABELS[item.statusAtual as StatusAcessoEmpresa];
  }

  if (item.tipoPendencia === 'PROCURACAO') {
    return STATUS_PROCURACAO_LABELS[
      item.statusAtual as StatusProcuracaoEmpresa
    ];
  }

  return 'Pendente';
}

function getTipoBadgeClass(tipoPendencia: PendenciaTipo) {
  if (tipoPendencia === 'ACESSO') {
    return 'bg-amber-100 text-amber-800';
  }

  if (tipoPendencia === 'PROCURACAO') {
    return 'bg-rose-100 text-rose-800';
  }

  return 'bg-slate-200 text-slate-800';
}

function PendenciaStatCard({
  description,
  label,
  value
}: {
  description: string;
  label: string;
  value: number;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </article>
  );
}

function PendenciaCard({ item }: { item: PendenciaListItem }) {
  const responsavelNome =
    item.responsavelInternoNome || 'Sem responsavel interno';

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getTipoBadgeClass(
                item.tipoPendencia
              )}`}
            >
              {PENDENCIA_TIPO_LABELS[item.tipoPendencia]}
            </span>
            <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
              {formatStatusAtual(item)}
            </span>
            <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
              {responsavelNome}
            </span>
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-slate-950">
              {item.empresaNome}
            </h3>
            {item.empresaNomeFantasia ? (
              <p className="text-sm text-slate-600">{item.empresaNomeFantasia}</p>
            ) : null}
            <p className="text-sm text-slate-500">
              CNPJ {formatCnpj(item.empresaCnpj)}
            </p>
          </div>

          <div className="space-y-2 text-sm text-slate-700">
            <p>{item.motivo}</p>
            {item.observacaoOperacional ? (
              <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-600">
                Observacao operacional: {item.observacaoOperacional}
              </p>
            ) : null}
            {item.ultimaConferenciaOperacionalEm ? (
              <p className="text-slate-500">
                Ultima conferencia: {formatDateTime(item.ultimaConferenciaOperacionalEm)}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3">
          <Link
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            href={item.linkTratamento}
          >
            Abrir tratamento
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function PendenciasPage() {
  const router = useRouter();
  const [pendencias, setPendencias] = useState<PendenciaListItem[]>([]);
  const [responsaveis, setResponsaveis] = useState<ResponsavelInternoRecord[]>(
    []
  );
  const [filters, setFilters] =
    useState<PendenciasFilterState>(initialFilters);
  const [loading, setLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        await requireSession();
        const queryFilters = parseFiltersFromSearch(window.location.search);

        const [pendenciasItems, responsaveisItems] = await Promise.all([
          listPendencias(buildQueryFilters(queryFilters)),
          listResponsaveis()
        ]);

        if (!active) {
          return;
        }

        setFilters(queryFilters);
        setPendencias(pendenciasItems);
        setResponsaveis(responsaveisItems);
      } catch (loadError) {
        if (
          active &&
          loadError instanceof Error &&
          loadError.message === 'Nao autenticado.'
        ) {
          router.replace('/login');
          return;
        }

        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Falha ao carregar pendencias.'
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
  }, [router]);

  async function handleLogout() {
    setIsSigningOut(true);

    try {
      await signOut();
      router.replace('/login');
    } catch (logoutError) {
      setError(
        logoutError instanceof Error ? logoutError.message : 'Falha no logout.'
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  async function refreshPendencias(nextFilters: PendenciasFilterState) {
    setIsFiltering(true);
    setError('');

    try {
      const items = await listPendencias(buildQueryFilters(nextFilters));
      setPendencias(items);
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message === 'Nao autenticado.') {
        router.replace('/login');
        return;
      }

      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao filtrar pendencias.'
      );
    } finally {
      setIsFiltering(false);
    }
  }

  async function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await refreshPendencias(filters);
  }

  async function handleClearFilters() {
    setFilters(initialFilters);
    router.replace('/pendencias');
    await refreshPendencias(initialFilters);
  }

  const contagemTotal = pendencias.length;
  const contagemPorTipo = pendencias.reduce(
    (accumulator, item) => {
      accumulator[item.tipoPendencia] += 1;
      return accumulator;
    },
    {
      ACESSO: 0,
      OPERACIONAL: 0,
      PROCURACAO: 0
    } as Record<PendenciaTipo, number>
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
              ECAC AUTOMACAO
            </p>
            <h1 className="text-3xl font-semibold text-slate-950">
              Painel de pendencias
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Varredura sincronica executada sob demanda a partir dos dados ja
              persistidos na carteira. O tratamento manual acontece na empresa.
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
              href="/carteira"
            >
              Carteira
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
              href="/empresas"
            >
              Empresas
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
              href="/responsaveis"
            >
              Responsaveis
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

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <PendenciaStatCard
            description="Itens gerados pela varredura atual."
            label="Total de pendencias"
            value={contagemTotal}
          />
          <PendenciaStatCard
            description="Pendencias de acesso pendente, indisponivel ou bloqueado."
            label="Pendencias de acesso"
            value={contagemPorTipo.ACESSO}
          />
          <PendenciaStatCard
            description="Pendencias de procuracao em estado nao regular."
            label="Pendencias de procuracao"
            value={contagemPorTipo.PROCURACAO}
          />
          <PendenciaStatCard
            description="Pendencias operacionais derivadas do flag manual."
            label="Pendencias operacionais"
            value={contagemPorTipo.OPERACIONAL}
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Filtros simples
              </h2>
              <p className="text-sm text-slate-600">
                Filtre por tipo de pendencia ou responsavel interno.
              </p>
            </div>
            <p className="text-sm text-slate-500">
              {contagemTotal} item(ns) listados
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleFilterSubmit}>
            <fieldset
              className="grid gap-4 md:grid-cols-2"
              disabled={isFiltering}
            >
              <label className="space-y-2">
                <span className="block text-sm font-medium text-slate-700">
                  Tipo de pendencia
                </span>
                <select
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                  name="tipoPendencia"
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      tipoPendencia: event.target.value as PendenciaTipo | ''
                    }))
                  }
                  value={filters.tipoPendencia}
                >
                  <option value="">Todas</option>
                  {PENDENCIA_TIPO_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="block text-sm font-medium text-slate-700">
                  Responsavel interno
                </span>
                <select
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                  name="responsavelInternoId"
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      responsavelInternoId: event.target.value
                    }))
                  }
                  value={filters.responsavelInternoId}
                >
                  <option value="">Todos os responsaveis</option>
                  <option value={SEM_RESPONSAVEL_FILTER}>Sem responsavel</option>
                  {responsaveis.map((responsavel) => (
                    <option key={responsavel.id} value={responsavel.id}>
                      {formatResponsavelOption(responsavel)}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>

            <div className="flex flex-wrap gap-3">
              <button
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isFiltering}
                type="submit"
              >
                {isFiltering ? 'Filtrando...' : 'Aplicar filtros'}
              </button>
              <button
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isFiltering}
                onClick={() => void handleClearFilters()}
                type="button"
              >
                Limpar filtros
              </button>
            </div>

            {filters.empresaId ? (
              <p className="text-sm text-slate-600">
                Filtro de empresa ativo. O painel mostra apenas itens da
                empresa aberta.
              </p>
            ) : null}
          </form>
        </section>

        {error ? (
          <p
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Lista de pendencias
              </h2>
              <p className="text-sm text-slate-600">
                Cada item abre a empresa para tratar acesso, procuracao e
                pendencia operacional no fluxo ja existente.
              </p>
            </div>
            <p className="text-sm text-slate-500">
              {pendencias.length} pendencia(s) exibida(s)
            </p>
          </div>

          {loading ? (
            <p className="py-8 text-sm text-slate-600">
              Carregando pendencias...
            </p>
          ) : pendencias.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-600">
              Nenhuma pendencia encontrada para os filtros atuais.
            </div>
          ) : (
            <ul className="space-y-3">
              {pendencias.map((item) => (
                <li key={`${item.empresaId}-${item.tipoPendencia}`}>
                  <PendenciaCard item={item} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
