'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getDashboardSummary, type DashboardSummaryResponse } from '@/lib/api';
import { requireSession, signOut } from '@/lib/auth';

const numberFormatter = new Intl.NumberFormat('pt-BR');

type SummaryCardTone = 'slate' | 'amber' | 'rose' | 'violet';

type SummaryCard = {
  accentClass: string;
  description: string;
  label: string;
  tone: SummaryCardTone;
  value: number;
};

const SUMMARY_CARD_STYLES: Record<SummaryCardTone, string> = {
  amber: 'border-t-amber-500',
  rose: 'border-t-rose-500',
  slate: 'border-t-slate-900',
  violet: 'border-t-violet-500'
};

function formatCount(value: number): string {
  return numberFormatter.format(value);
}

function buildSummaryCards(summary: DashboardSummaryResponse): SummaryCard[] {
  return [
    {
      accentClass: SUMMARY_CARD_STYLES.slate,
      description: 'Empresas ativas na carteira local.',
      label: 'Total na carteira',
      tone: 'slate',
      value: summary.totalEmpresasNaCarteira
    },
    {
      accentClass: SUMMARY_CARD_STYLES.amber,
      description: 'Marcadas com pendência operacional.',
      label: 'Pendência operacional',
      tone: 'amber',
      value: summary.totalEmpresasComPendenciaOperacional
    },
    {
      accentClass: SUMMARY_CARD_STYLES.rose,
      description: 'Indisponível, bloqueado ou não verificado.',
      label: 'Acesso não regular',
      tone: 'rose',
      value: summary.totalEmpresasComAcessoPendenteOuBloqueado
    },
    {
      accentClass: SUMMARY_CARD_STYLES.violet,
      description: 'Inválida, pendente ou não verificada.',
      label: 'Procuração não regular',
      tone: 'violet',
      value: summary.totalEmpresasComProcuracaoPendente
    }
  ];
}

export default function DashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userName, setUserName] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [reloadIndex, setReloadIndex] = useState(0);

  useEffect(() => {
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

        const data = await getDashboardSummary();

        if (!active) {
          return;
        }

        setSummary(data);
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

        setSummary(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Falha ao carregar o resumo do dashboard.'
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
  }, [reloadIndex, router]);

  async function handleLogout() {
    setIsSigningOut(true);

    try {
      await signOut();
    } catch {
      // Logout best effort; the redirect below still removes the session view.
    } finally {
      router.replace('/login');
      setIsSigningOut(false);
    }
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

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                key={`card-skeleton-${index}`}
              >
                <div className="h-1 w-16 rounded-full bg-slate-200" />
                <div className="mt-4 h-10 w-24 rounded-full bg-slate-200" />
                <div className="mt-4 h-4 w-full rounded-full bg-slate-200" />
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="space-y-3">
              <div className="h-3 w-44 rounded-full bg-slate-200" />
              <div className="h-7 w-72 rounded-full bg-slate-200" />
              <div className="h-4 w-full max-w-2xl rounded-full bg-slate-200" />
            </div>
            <div className="mt-6 space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  className="rounded-xl border border-slate-200 p-4"
                  key={`row-skeleton-${index}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="h-4 w-40 rounded-full bg-slate-200" />
                    <div className="h-4 w-12 rounded-full bg-slate-200" />
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-slate-100" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    );
  }

  const summaryCards = summary ? buildSummaryCards(summary) : [];
  const distribuicao = summary?.distribuicaoPorResponsavel ?? [];
  const totalCarteira = summary?.totalEmpresasNaCarteira ?? 0;
  const maxDistribution = Math.max(
    1,
    ...distribuicao.map((item) => item.totalEmpresas)
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
              ECAC AUTOMAÇÃO
            </p>
            <h1 className="text-3xl font-semibold text-slate-950">Dashboard</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              {userName
                ? `Resumo operacional da carteira com sessão ativa de ${userName}.`
                : 'Resumo operacional da carteira com dados já existentes no banco local.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
              href="/integracoes/acessorias"
            >
              Acessorias
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
                Não foi possível carregar o dashboard.
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

        {summary ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {summaryCards.map((card) => (
                <article
                  className={`rounded-2xl border border-slate-200 border-t-4 bg-white p-5 shadow-sm ${card.accentClass}`}
                  key={card.label}
                >
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                    {card.label}
                  </p>
                  <div className="mt-4 flex items-end justify-between gap-4">
                    <strong className="text-4xl font-semibold tracking-tight text-slate-950">
                      {formatCount(card.value)}
                    </strong>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                      {card.tone === 'slate'
                        ? 'Carteira'
                        : card.tone === 'amber'
                          ? 'Operacional'
                          : card.tone === 'rose'
                            ? 'Acesso'
                            : 'Procuração'}
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-600">
                    {card.description}
                  </p>
                </article>
              ))}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                    Distribuição por responsável
                  </p>
                  <h2 className="text-lg font-semibold text-slate-950">
                    Carteira por responsável interno
                  </h2>
                  <p className="max-w-2xl text-sm leading-6 text-slate-600">
                    Empresas sem responsável aparecem explicitamente como
                    &quot;Sem responsável&quot; e entram na soma da carteira.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Total: {formatCount(totalCarteira)}
                </div>
              </div>

              {distribuicao.length === 0 ? (
                <div className="py-8 text-sm text-slate-600">
                  Nenhuma empresa na carteira para distribuir.
                </div>
              ) : (
                <ul className="mt-5 space-y-3">
                  {distribuicao.map((item) => {
                    const width = (item.totalEmpresas / maxDistribution) * 100;

                    return (
                      <li
                        className="rounded-xl border border-slate-200 px-4 py-4"
                        key={item.responsavelInternoId ?? item.responsavelNome}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-slate-950">
                              {item.responsavelNome}
                            </p>
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                              {item.responsavelInternoId
                                ? 'Responsável interno'
                                : 'Grupo sem vínculo'}
                            </p>
                          </div>
                          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700">
                            {formatCount(item.totalEmpresas)} empresa
                            {item.totalEmpresas === 1 ? '' : 's'}
                          </div>
                        </div>

                        <div className="mt-4 h-2 rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-slate-900 transition-[width] duration-300"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
