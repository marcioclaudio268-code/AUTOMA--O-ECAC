'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { requireSession, signOut } from '@/lib/auth';
import { listCompanies, type CompanyListItem } from '@/lib/api';
import { STATUS_ACESSO_LABELS, STATUS_PROCURACAO_LABELS } from '@/lib/constants';
import { formatCnpj } from '@/lib/formatters';

export default function EmpresasPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [flashMessage, setFlashMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFlashMessage(
      params.get('flash')?.startsWith('created:')
        ? 'Empresa cadastrada com sucesso.'
        : ''
    );

    let active = true;

    async function load() {
      try {
        const user = await requireSession();

        if (!active) {
          return;
        }

        setUserName(user.nome);

        const items = await listCompanies();

        if (!active) {
          return;
        }

        setCompanies(items);
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
              : 'Falha ao carregar empresas.'
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

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
              ECAC AUTOMACAO
            </p>
            <h1 className="text-3xl font-semibold text-slate-950">Empresas</h1>
            <p className="text-sm text-slate-600">
              Lista operacional minima com sessao autenticada.
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
              href="/pendencias"
            >
              Pendencias
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
              href="/responsaveis"
            >
              Responsaveis
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
              href="/empresas/nova"
            >
              Nova empresa
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
                Base de empresas
              </h2>
              <p className="text-sm text-slate-600">
                {userName ? `Sessao ativa de ${userName}.` : 'Sessao ativa.'}
              </p>
            </div>
          </div>

          {flashMessage ? (
            <p
              className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
              role="status"
            >
              {flashMessage}
            </p>
          ) : null}

          {loading ? (
            <p className="py-8 text-sm text-slate-600">Carregando empresas...</p>
          ) : error ? (
            <p
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              role="alert"
            >
              {error}
            </p>
          ) : companies.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-600">
              Nenhuma empresa cadastrada ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-3 py-3 font-medium">Razao social</th>
                    <th className="px-3 py-3 font-medium">CNPJ</th>
                    <th className="px-3 py-3 font-medium">Regime tributario</th>
                    <th className="px-3 py-3 font-medium">Status de acesso</th>
                    <th className="px-3 py-3 font-medium">
                      Status de procuracao
                    </th>
                    <th className="px-3 py-3 font-medium">Carteira</th>
                    <th className="px-3 py-3 font-medium">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companies.map((company) => (
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
                        {company.regimeTributario}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {STATUS_ACESSO_LABELS[company.statusAcesso]}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {STATUS_PROCURACAO_LABELS[company.statusProcuracao]}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {company.naCarteira ? 'Na carteira' : 'Fora da carteira'}
                      </td>
                      <td className="px-3 py-4">
                        <Link
                          className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-900 transition hover:border-slate-400"
                          href={`/empresas/${company.id}`}
                        >
                          Ver detalhe
                        </Link>
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
