'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { listResponsaveis, type ResponsavelInternoRecord } from '@/lib/api';
import { requireSession, signOut } from '@/lib/auth';

function formatResponsavelStatus(responsavel: ResponsavelInternoRecord) {
  return responsavel.ativo ? 'Ativo' : 'Inativo';
}

function formatResponsavelUsuario(responsavel: ResponsavelInternoRecord) {
  return `${responsavel.usuarioInterno.nome} (${responsavel.usuarioInterno.email})`;
}

export default function ResponsaveisPage() {
  const router = useRouter();
  const [responsaveis, setResponsaveis] = useState<ResponsavelInternoRecord[]>(
    []
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [flashMessage, setFlashMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFlashMessage(
      params.get('flash')?.startsWith('created:')
        ? 'Responsavel cadastrado com sucesso.'
        : ''
    );

    let active = true;

    async function load() {
      try {
        await requireSession();
        const items = await listResponsaveis();

        if (!active) {
          return;
        }

        setResponsaveis(items);
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
              : 'Falha ao carregar responsaveis.'
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
            <h1 className="text-3xl font-semibold text-slate-950">
              Responsaveis
            </h1>
            <p className="text-sm text-slate-600">
              Cadastro operacional minimo dos responsaveis internos.
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
              href="/responsaveis/nova"
            >
              Novo responsavel
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

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Base de responsaveis
              </h2>
              <p className="text-sm text-slate-600">
                Lista simples dos responsaveis cadastrados.
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
            <p className="py-8 text-sm text-slate-600">
              Carregando responsaveis...
            </p>
          ) : error ? (
            <p
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              role="alert"
            >
              {error}
            </p>
          ) : responsaveis.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-600">
              Nenhum responsavel cadastrado ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-3 py-3 font-medium">Nome</th>
                    <th className="px-3 py-3 font-medium">Email</th>
                    <th className="px-3 py-3 font-medium">Usuario interno</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {responsaveis.map((responsavel) => (
                    <tr key={responsavel.id} className="align-top">
                      <td className="px-3 py-4 font-medium text-slate-900">
                        {responsavel.nome}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {responsavel.email}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {formatResponsavelUsuario(responsavel)}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {formatResponsavelStatus(responsavel)}
                      </td>
                      <td className="px-3 py-4">
                        <Link
                          className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-900 transition hover:border-slate-400"
                          href={`/responsaveis/${responsavel.id}`}
                        >
                          Editar
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
