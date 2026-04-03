'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getDashboardSummary, type DashboardSummary } from '@/lib/api';
import { requireSession, signOut } from '@/lib/auth';

const numberFormatter = new Intl.NumberFormat('pt-BR');

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function DashboardStatCard({
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
      <p className="mt-3 text-3xl font-semibold text-slate-950">
        {formatCount(value)}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </article>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        await requireSession();
        const data = await getDashboardSummary();

        if (!active) {
          return;
        }

        setSummary(data);
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
              : 'Falha ao carregar dashboard.'
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

  const indicadores = summary?.indicadores;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
              ECAC AUTOMACAO
            </p>
            <h1 className="text-3xl font-semibold text-slate-950">
              Dashboard principal
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Visao direta da carteira com indicadores reais da base atual e
              atalhos para a operacao cotidiana.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
              href="/carteira"
            >
              Abrir carteira
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
              href="/pendencias"
            >
              Tratar pendencias
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

        {loading ? (
          <section className="rounded-2xl border border-slate-200 bg-white px-5 py-8 shadow-sm">
            <p className="text-sm text-slate-600">Carregando dashboard...</p>
          </section>
        ) : error ? (
          <section
            className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700"
            role="alert"
          >
            {error}
          </section>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DashboardStatCard
                description="Empresas atualmente marcadas como dentro da carteira."
                label="Empresas na carteira"
                value={indicadores?.totalEmpresasNaCarteira ?? 0}
              />
              <DashboardStatCard
                description="Empresas da carteira com pendencia operacional aberta."
                label="Pendencia operacional"
                value={indicadores?.totalEmpresasComPendenciaOperacional ?? 0}
              />
              <DashboardStatCard
                description="Empresas da carteira com acesso sem liberacao concluida."
                label="Acesso pendente ou bloqueado"
                value={
                  indicadores?.totalEmpresasComAcessoPendenteOuBloqueado ?? 0
                }
              />
              <DashboardStatCard
                description="Empresas da carteira com procuracao ainda sem status valido."
                label="Procuracao pendente"
                value={indicadores?.totalEmpresasComProcuracaoPendente ?? 0}
              />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Distribuicao por responsavel
                  </h2>
                  <p className="text-sm text-slate-600">
                    Quantidade de empresas da carteira agrupadas por responsavel
                    interno. Itens sem responsavel aparecem explicitamente.
                  </p>
                </div>
                <p className="text-sm text-slate-500">
                  {formatCount(
                    summary?.distribuicaoPorResponsavel.length ?? 0
                  )}{' '}
                  grupo(s)
                </p>
              </div>

              {(summary?.distribuicaoPorResponsavel.length ?? 0) === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-600">
                  Nenhuma empresa na carteira ainda.
                </div>
              ) : (
                <ul className="space-y-3">
                  {summary?.distribuicaoPorResponsavel.map((item) => {
                    const isUnassigned = item.responsavelInternoId === null;

                    return (
                      <li
                        className={
                          isUnassigned
                            ? 'flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between'
                            : 'flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between'
                        }
                        key={item.responsavelInternoId ?? 'sem-responsavel'}
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-slate-900">
                            {item.responsavelInternoNome}
                          </p>
                          <p className="text-xs text-slate-500">
                            {isUnassigned
                              ? 'Sem responsavel interno definido.'
                              : item.responsavelInternoEmail
                                ? item.responsavelInternoEmail
                                : 'Responsavel cadastrado.'}
                          </p>
                        </div>
                        <span className="inline-flex w-fit items-center rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                          {formatCount(item.quantidadeEmpresas)} empresa(s)
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
