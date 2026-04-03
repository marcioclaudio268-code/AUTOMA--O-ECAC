'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import {
  listCarteira,
  listResponsaveis,
  updateCompany,
  type CompanyUpdateInput,
  type CompanyDetailItem,
  type CompanyListItem,
  type ResponsavelInternoRecord,
  type StatusAcessoEmpresa,
  type StatusProcuracaoEmpresa
} from '@/lib/api';
import { requireSession, signOut } from '@/lib/auth';
import {
  STATUS_ACESSO_LABELS,
  STATUS_ACESSO_OPTIONS,
  STATUS_PROCURACAO_LABELS,
  STATUS_PROCURACAO_OPTIONS
} from '@/lib/constants';
import { formatCnpj, formatDateTime } from '@/lib/formatters';

type CarteiraFilterState = {
  responsavelInternoId: string;
  statusAcesso: StatusAcessoEmpresa | '';
  statusProcuracao: StatusProcuracaoEmpresa | '';
  pendenciaOperacional: '' | 'true' | 'false';
};

const initialFilters: CarteiraFilterState = {
  responsavelInternoId: '',
  statusAcesso: '',
  statusProcuracao: '',
  pendenciaOperacional: ''
};

function isStatusAcessoEmpresa(
  value: string | null
): value is StatusAcessoEmpresa {
  return STATUS_ACESSO_OPTIONS.some((option) => option.value === value);
}

function isStatusProcuracaoEmpresa(
  value: string | null
): value is StatusProcuracaoEmpresa {
  return STATUS_PROCURACAO_OPTIONS.some((option) => option.value === value);
}

function parseFiltersFromSearch(search: string): CarteiraFilterState {
  const params = new URLSearchParams(search);
  const statusAcesso = params.get('statusAcesso');
  const statusProcuracao = params.get('statusProcuracao');
  const pendenciaOperacional = params.get('pendenciaOperacional');

  return {
    responsavelInternoId: params.get('responsavelInternoId')?.trim() || '',
    statusAcesso: isStatusAcessoEmpresa(statusAcesso)
      ? statusAcesso
      : '',
    statusProcuracao: isStatusProcuracaoEmpresa(statusProcuracao)
      ? statusProcuracao
      : '',
    pendenciaOperacional:
      pendenciaOperacional === 'true' || pendenciaOperacional === 'false'
        ? (pendenciaOperacional as '' | 'true' | 'false')
        : ''
  };
}

function buildQueryFilters(filters: CarteiraFilterState) {
  return {
    responsavelInternoId: filters.responsavelInternoId.trim() || undefined,
    pendenciaOperacional:
      filters.pendenciaOperacional === ''
        ? undefined
        : filters.pendenciaOperacional === 'true',
    statusAcesso: filters.statusAcesso || undefined,
    statusProcuracao: filters.statusProcuracao || undefined
  };
}

function matchesCarteiraFilters(
  company: CompanyListItem,
  filters: CarteiraFilterState
) {
  if (
    filters.responsavelInternoId &&
    company.responsavelInternoId !== filters.responsavelInternoId
  ) {
    return false;
  }

  if (filters.statusAcesso && company.statusAcesso !== filters.statusAcesso) {
    return false;
  }

  if (
    filters.statusProcuracao &&
    company.statusProcuracao !== filters.statusProcuracao
  ) {
    return false;
  }

  if (filters.pendenciaOperacional !== '') {
    const expectedPending = filters.pendenciaOperacional === 'true';

    if (company.pendenciaOperacional !== expectedPending) {
      return false;
    }
  }

  return true;
}

function upsertCarteiraItem(
  current: CompanyListItem[],
  updated: CompanyListItem,
  filters: CarteiraFilterState
) {
  if (!matchesCarteiraFilters(updated, filters)) {
    return current.filter((item) => item.id !== updated.id);
  }

  return current.map((item) => (item.id === updated.id ? updated : item));
}

function toCarteiraItem(company: CompanyDetailItem): CompanyListItem {
  const { integracoes: _integracoes, responsavelInterno, ...base } = company;

  return {
    ...base,
    responsavelInterno: responsavelInterno
      ? {
          ativo: responsavelInterno.ativo,
          email: responsavelInterno.email,
          id: responsavelInterno.id,
          nome: responsavelInterno.nome,
          usuarioInternoId: responsavelInterno.usuarioInterno.id
        }
      : null
  };
}

function formatResponsavelOption(responsavel: ResponsavelInternoRecord) {
  return `${responsavel.nome} (${responsavel.email})${
    responsavel.ativo ? '' : ' - Inativo'
  }`;
}

export default function CarteiraPage() {
  const router = useRouter();
  const [carteira, setCarteira] = useState<CompanyListItem[]>([]);
  const [responsaveis, setResponsaveis] = useState<ResponsavelInternoRecord[]>(
    []
  );
  const [filters, setFilters] = useState<CarteiraFilterState>(initialFilters);
  const [loading, setLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [isMutatingId, setIsMutatingId] = useState('');
  const [isMutatingAction, setIsMutatingAction] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        await requireSession();

        const queryFilters = parseFiltersFromSearch(window.location.search);

        const [carteiraItems, responsaveisItems] = await Promise.all([
          listCarteira(buildQueryFilters(queryFilters)),
          listResponsaveis()
        ]);

        if (!active) {
          return;
        }

        setFilters(queryFilters);
        setCarteira(carteiraItems);
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
              : 'Falha ao carregar carteira.'
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

  async function refreshCarteira(nextFilters: CarteiraFilterState) {
    setIsFiltering(true);
    setError('');
    setMessage('');

    try {
      const items = await listCarteira(buildQueryFilters(nextFilters));
      setCarteira(items);
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message === 'Nao autenticado.') {
        router.replace('/login');
        return;
      }

      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao filtrar carteira.'
      );
    } finally {
      setIsFiltering(false);
    }
  }

  async function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await refreshCarteira(filters);
  }

  async function handleClearFilters() {
    setFilters(initialFilters);
    router.replace('/carteira');
    await refreshCarteira(initialFilters);
  }

  async function mutateCompany(
    company: CompanyListItem,
    action: string,
    payload: CompanyUpdateInput,
    successMessage: string,
    removeFromList = false
  ) {
    if (isMutatingId) {
      return;
    }

    setError('');
    setMessage('');
    setIsMutatingId(company.id);
    setIsMutatingAction(action);

    try {
      const updated = await updateCompany(company.id, payload);

      setCarteira((current) =>
        removeFromList
          ? current.filter((item) => item.id !== company.id)
          : upsertCarteiraItem(current, toCarteiraItem(updated), filters)
      );
      setMessage(successMessage);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Falha ao atualizar empresa.'
      );
    } finally {
      setIsMutatingId('');
      setIsMutatingAction('');
    }
  }

  async function handleStampConference(company: CompanyListItem) {
    await mutateCompany(
      company,
      'conference',
      {
        ultimaConferenciaOperacionalEm: new Date().toISOString()
      },
      'Conferencia operacional registrada.'
    );
  }

  async function handleTogglePendencia(company: CompanyListItem) {
    const now = new Date().toISOString();

    await mutateCompany(
      company,
      company.pendenciaOperacional ? 'regularize' : 'pending',
      company.pendenciaOperacional
        ? {
            pendenciaOperacional: false,
            regularizadaEm: now,
            ultimaConferenciaOperacionalEm: now
          }
        : {
            pendenciaOperacional: true,
            ultimaConferenciaOperacionalEm: now
          },
      company.pendenciaOperacional
        ? 'Empresa regularizada.'
        : 'Pendencia operacional registrada.'
    );
  }

  async function handleRemove(company: CompanyListItem) {
    await mutateCompany(
      company,
      'remove',
      {
        naCarteira: false
      },
      'Empresa retirada da carteira.',
      true
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-slate-600">Carregando carteira...</p>
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
            <h1 className="text-3xl font-semibold text-slate-950">
              Carteira operacional
            </h1>
            <p className="text-sm text-slate-600">
              Lista das empresas em acompanhamento operacional com controle de
              acesso, procuracao e pendencia manual.
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
              href="/pendencias"
            >
              Pendencias
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
              href="/empresas"
            >
              Empresas
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
              href="/empresas/nova"
            >
              Nova empresa
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

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Empresas na carteira
                </h2>
                <p className="text-sm text-slate-600">
                Filtre por responsavel, status manual, conferencia e pendencia.
                </p>
              </div>
            <p className="text-sm text-slate-500">
              {carteira.length} empresa(s) listada(s)
            </p>
          </div>

          <form className="mb-5" onSubmit={handleFilterSubmit}>
            <fieldset className="grid gap-4 md:grid-cols-4" disabled={isFiltering}>
              <label className="space-y-2">
                <span className="block text-sm font-medium text-slate-700">
                  Responsavel interno
                </span>
                <select
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                  name="responsavelInternoId"
                  value={filters.responsavelInternoId}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      responsavelInternoId: event.target.value
                    }))
                  }
                >
                  <option value="">Todos os responsaveis</option>
                  {responsaveis.map((responsavel) => (
                    <option key={responsavel.id} value={responsavel.id}>
                      {formatResponsavelOption(responsavel)}
                    </option>
                  ))}
                  </select>
                </label>

              <label className="space-y-2">
                <span className="block text-sm font-medium text-slate-700">
                  Pendencia operacional
                </span>
                <select
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                  name="pendenciaOperacional"
                  value={filters.pendenciaOperacional}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      pendenciaOperacional: event.target.value as
                        | ''
                        | 'true'
                        | 'false'
                    }))
                  }
                >
                  <option value="">Todas</option>
                  <option value="true">Somente pendentes</option>
                  <option value="false">Somente regularizadas</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="block text-sm font-medium text-slate-700">
                  Status de acesso
                </span>
                <select
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                  name="statusAcesso"
                  value={filters.statusAcesso}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      statusAcesso: event.target.value as
                        | StatusAcessoEmpresa
                        | ''
                    }))
                  }
                >
                  <option value="">Todos os status</option>
                  {STATUS_ACESSO_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="block text-sm font-medium text-slate-700">
                  Status de procuracao
                </span>
                <select
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                  name="statusProcuracao"
                  value={filters.statusProcuracao}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      statusProcuracao: event.target.value as
                        | StatusProcuracaoEmpresa
                        | ''
                    }))
                  }
                >
                  <option value="">Todos os status</option>
                  {STATUS_PROCURACAO_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>

            <div className="mt-4 flex flex-wrap gap-3">
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
          </form>

          {error ? (
            <p
              className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {message ? (
            <p
              className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
              role="status"
            >
              {message}
            </p>
          ) : null}

          {carteira.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-600">
              Nenhuma empresa na carteira para os filtros atuais.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-3 py-3 font-medium">Empresa</th>
                    <th className="px-3 py-3 font-medium">CNPJ</th>
                    <th className="px-3 py-3 font-medium">Responsavel</th>
                    <th className="px-3 py-3 font-medium">Acesso</th>
                    <th className="px-3 py-3 font-medium">Procuracao</th>
                    <th className="px-3 py-3 font-medium">Conferencia</th>
                    <th className="px-3 py-3 font-medium">Pendencia</th>
                    <th className="px-3 py-3 font-medium">Regularizacao</th>
                    <th className="px-3 py-3 font-medium">Observacoes</th>
                    <th className="px-3 py-3 font-medium">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {carteira.map((company) => (
                    <tr key={company.id} className="align-top">
                      <td className="px-3 py-4 font-medium text-slate-900">
                        {company.razaoSocial}
                        {company.nomeFantasia ? (
                          <div className="mt-1 text-xs font-normal text-slate-500">
                            {company.nomeFantasia}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {formatCnpj(company.cnpj)}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {company.responsavelInterno
                          ? company.responsavelInterno.nome
                          : '-'}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {STATUS_ACESSO_LABELS[company.statusAcesso]}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {STATUS_PROCURACAO_LABELS[company.statusProcuracao]}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {formatDateTime(company.ultimaConferenciaOperacionalEm)}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {company.pendenciaOperacional ? 'Pendente' : 'Regular'}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {formatDateTime(company.regularizadaEm)}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {company.observacoesOperacionais?.trim() || '-'}
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-900 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isMutatingId === company.id}
                            onClick={() => void handleStampConference(company)}
                            type="button"
                          >
                            {isMutatingId === company.id &&
                            isMutatingAction === 'conference'
                              ? 'Conferindo...'
                              : 'Conferir agora'}
                          </button>
                          <button
                            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-900 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isMutatingId === company.id}
                            onClick={() => void handleTogglePendencia(company)}
                            type="button"
                          >
                            {isMutatingId === company.id &&
                            (isMutatingAction === 'pending' ||
                              isMutatingAction === 'regularize')
                              ? company.pendenciaOperacional
                                ? 'Regularizando...'
                                : 'Registrando...'
                              : company.pendenciaOperacional
                                ? 'Regularizar'
                                : 'Registrar pendencia'}
                          </button>
                          <Link
                            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-900 transition hover:border-slate-400"
                            href={`/empresas/${company.id}`}
                          >
                            Editar
                          </Link>
                          <button
                            className="inline-flex items-center justify-center rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:border-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isMutatingId === company.id}
                            onClick={() => void handleRemove(company)}
                            type="button"
                          >
                            {isMutatingId === company.id &&
                            isMutatingAction === 'remove'
                              ? 'Retirando...'
                              : 'Retirar da carteira'}
                          </button>
                        </div>
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
