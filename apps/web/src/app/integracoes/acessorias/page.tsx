'use client';

import React from 'react';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import {
  createAcessoriasConfig,
  getAcessoriasConfig,
  linkAcessoriasCompany,
  listAcessoriasCompanies,
  listAcessoriasJobs,
  listCompanies as listInternalCompanies,
  syncAcessoriasCompanies,
  testAcessoriasConnection,
  unlinkAcessoriasCompany,
  updateAcessoriasConfig,
  type AcessoriasCompanyLinkRecord,
  type AcessoriasConfigRecord,
  type AcessoriasJobRecord,
  type CompanyListItem
} from '@/lib/api';
import { requireSession, signOut } from '@/lib/auth';
import {
  STATUS_INTEGRACAO_ACESSORIAS_LABELS,
  STATUS_JOB_ACESSORIAS_LABELS,
  STATUS_VINCULO_ACESSORIAS_LABELS
} from '@/lib/constants';
import { formatCnpj, formatDateTime } from '@/lib/formatters';

const RECENT_JOBS_LIMIT = 20;

type FeedbackTone = 'error' | 'success';
type FeedbackState = { message: string; tone: FeedbackTone };
type RowActionState = { action: 'link' | 'unlink'; companyId: string } | null;

function getIntegrationToneClass(status: AcessoriasConfigRecord['status']): string {
  switch (status) {
    case 'ATIVA': return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'CONFIGURADA': return 'border-slate-200 bg-slate-50 text-slate-700';
    case 'ERRO': return 'border-rose-200 bg-rose-50 text-rose-800';
    default: return 'border-amber-200 bg-amber-50 text-amber-800';
  }
}

function getJobToneClass(status: AcessoriasJobRecord['status']): string {
  switch (status) {
    case 'SUCESSO': return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'FALHA': return 'border-rose-200 bg-rose-50 text-rose-800';
    default: return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

function getLinkToneClass(status: AcessoriasCompanyLinkRecord['statusVinculo']): string {
  switch (status) {
    case 'VINCULADA': return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'AMBIGUA': return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'IGNORADA': return 'border-slate-200 bg-slate-50 text-slate-700';
    default: return 'border-rose-200 bg-rose-50 text-rose-800';
  }
}

function getMatchToneClass(matchAutomatico: boolean): string {
  return matchAutomatico ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-700';
}

function formatNullableDate(value: string | null): string { return value ? formatDateTime(value) : '-'; }
function formatNullableText(value: string | null): string { const normalized = value?.trim(); return normalized && normalized.length > 0 ? normalized : '-'; }
function formatCnpjOrDash(value: string | null | undefined): string { if (!value) return '-'; const formatted = formatCnpj(value); return formatted.trim().length > 0 ? formatted : '-'; }
function buildLinkDrafts(companies: AcessoriasCompanyLinkRecord[]): Record<string, string> { return companies.reduce<Record<string, string>>((acc, company) => { acc[company.id] = company.empresaId ?? ''; return acc; }, {}); }
function sortCompaniesByName(companies: CompanyListItem[]): CompanyListItem[] { return [...companies].sort((left, right) => left.razaoSocial.localeCompare(right.razaoSocial)); }

function AcessoriasPage() {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [config, setConfig] = useState<AcessoriasConfigRecord | null>(null);
  const [jobs, setJobs] = useState<AcessoriasJobRecord[]>([]);
  const [companies, setCompanies] = useState<AcessoriasCompanyLinkRecord[]>([]);
  const [internalCompanies, setInternalCompanies] = useState<CompanyListItem[]>([]);
  const [apiToken, setApiToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [rowAction, setRowAction] = useState<RowActionState>(null);
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [reloadIndex, setReloadIndex] = useState(0);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const fetchState = useCallback(async () => {
    const user = await requireSession();
    const [configData, jobData, companyData, internalCompanyData] = await Promise.all([
      getAcessoriasConfig(),
      listAcessoriasJobs({ take: RECENT_JOBS_LIMIT }),
      listAcessoriasCompanies(),
      listInternalCompanies()
    ]);
    return { companyData, configData, internalCompanyData, jobData, user };
  }, []);

  const refreshState = useCallback(async () => {
    const nextState = await fetchState();
    setUserName(nextState.user.nome);
    setConfig(nextState.configData);
    setJobs(nextState.jobData);
    setCompanies(nextState.companyData);
    setInternalCompanies(sortCompaniesByName(nextState.internalCompanyData));
    setLinkDrafts(buildLinkDrafts(nextState.companyData));
  }, [fetchState]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      setFeedback(null);
      try {
        const nextState = await fetchState();
        if (!active) return;
        setUserName(nextState.user.nome);
        setConfig(nextState.configData);
        setJobs(nextState.jobData);
        setCompanies(nextState.companyData);
        setInternalCompanies(sortCompaniesByName(nextState.internalCompanyData));
        setLinkDrafts(buildLinkDrafts(nextState.companyData));
      } catch (loadError) {
        if (!active) return;
        if (loadError instanceof Error && loadError.message === 'Nao autenticado.') { router.replace('/login'); return; }
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar a integracao Acessorias.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [fetchState, reloadIndex, router]);

  async function handleLogout() {
    setIsSigningOut(true);
    try { await signOut(); } catch { /* best effort */ } finally { router.replace('/login'); setIsSigningOut(false); }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setFeedback(null);
    const token = apiToken.trim();
    if (!token) { setFeedback({ message: 'Informe um token para salvar a configuracao.', tone: 'error' }); return; }
    setIsSaving(true);
    try {
      if (config?.createdAt) {
        await updateAcessoriasConfig({ apiToken: token });
        setFeedback({ message: 'Configuracao Acessorias atualizada com sucesso.', tone: 'success' });
      } else {
        await createAcessoriasConfig({ apiToken: token });
        setFeedback({ message: 'Configuracao Acessorias criada com sucesso.', tone: 'success' });
      }
      setApiToken('');
      await refreshState();
    } catch (saveError) {
      setFeedback({ message: saveError instanceof Error ? saveError.message : 'Falha ao salvar a configuracao Acessorias.', tone: 'error' });
    } finally { setIsSaving(false); }
  }

  async function handleTestConnection() {
    setError('');
    setFeedback(null);
    setIsTesting(true);
    try {
      const result = await testAcessoriasConnection();
      setFeedback({ message: result.message, tone: result.success ? 'success' : 'error' });
      await refreshState();
    } catch (testError) {
      setFeedback({ message: testError instanceof Error ? testError.message : 'Falha ao testar a conexao Acessorias.', tone: 'error' });
    } finally { setIsTesting(false); }
  }

  async function handleSyncCompanies() {
    setError('');
    setFeedback(null);
    setIsSyncing(true);
    try {
      const result = await syncAcessoriasCompanies();
      setFeedback({ message: result.message, tone: result.job.status === 'SUCESSO' ? 'success' : 'error' });
      await refreshState();
    } catch (syncError) {
      setFeedback({ message: syncError instanceof Error ? syncError.message : 'Falha ao sincronizar empresas Acessorias.', tone: 'error' });
    } finally { setIsSyncing(false); }
  }

  async function handleLinkCompany(company: AcessoriasCompanyLinkRecord) {
    const empresaId = linkDrafts[company.id]?.trim() ?? '';
    if (!empresaId) { setFeedback({ message: 'Selecione uma empresa interna antes de vincular.', tone: 'error' }); return; }
    setError('');
    setFeedback(null);
    setRowAction({ action: 'link', companyId: company.id });
    try {
      await linkAcessoriasCompany(empresaId, { acessoriasEmpresaId: company.acessoriasEmpresaId });
      setFeedback({ message: 'Vinculo salvo com sucesso.', tone: 'success' });
      await refreshState();
    } catch (linkError) {
      setFeedback({ message: linkError instanceof Error ? linkError.message : 'Falha ao salvar o vinculo Acessorias.', tone: 'error' });
    } finally { setRowAction(null); }
  }

  async function handleUnlinkCompany(company: AcessoriasCompanyLinkRecord) {
    if (!company.empresaId) return;
    setError('');
    setFeedback(null);
    setRowAction({ action: 'unlink', companyId: company.id });
    try {
      await unlinkAcessoriasCompany(company.empresaId);
      setFeedback({ message: 'Vinculo removido com sucesso.', tone: 'success' });
      await refreshState();
    } catch (unlinkError) {
      setFeedback({ message: unlinkError instanceof Error ? unlinkError.message : 'Falha ao remover o vinculo Acessorias.', tone: 'error' });
    } finally { setRowAction(null); }
  }
  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
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
                {Array.from({ length: 4 }).map((_, index) => (
                  <div className="h-14 rounded-xl border border-slate-200 bg-slate-100" key={`sync-skeleton-${index}`} />
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const currentStatus = config?.status ?? 'NAO_CONFIGURADA';
  const companySyncJobs = jobs.filter((job) => job.tipoJob === 'SINCRONIZACAO_EMPRESAS').slice(0, 8);
  const totalExternalCompanies = companies.length;
  const linkedCompanies = companies.filter((company) => company.statusVinculo === 'VINCULADA').length;
  const pendingCompanies = companies.filter((company) => company.statusVinculo === 'NAO_VINCULADA' || company.statusVinculo === 'AMBIGUA').length;
  const ignoredCompanies = companies.filter((company) => company.statusVinculo === 'IGNORADA').length;
  const automaticCompanies = companies.filter((company) => company.matchAutomatico).length;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">ECAC AUTOMACAO</p>
            <h1 className="text-3xl font-semibold text-slate-950">Integracao Acessorias</h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              Conector opcional para validar o acesso externo, sincronizar empresas e registrar a trilha de jobs sem criar dependencia arquitetural do Acessorias.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
              {userName ? `Logado como ${userName}` : 'Sessao ativa'}
            </div>
            <Link className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400" href="/empresas">Empresas</Link>
            <Link className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400" href="/dashboard">Dashboard</Link>
            <button className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSigningOut} onClick={() => void handleLogout()} type="button">{isSigningOut ? 'Saindo...' : 'Sair'}</button>
          </div>
        </header>

        {error ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800" role="alert">
            <h2 className="text-base font-semibold text-rose-900">Nao foi possivel carregar a integracao.</h2>
            <p className="mt-2 text-sm leading-6 text-rose-800">{error}</p>
            <button className="mt-4 inline-flex items-center justify-center rounded-xl bg-rose-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-800" onClick={() => setReloadIndex((current) => current + 1)} type="button">Tentar novamente</button>
          </section>
        ) : null}

        {feedback ? (
          <section className={`rounded-2xl border p-5 ${feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`} role="status">
            <p className="text-sm leading-6">{feedback.message}</p>
          </section>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Status da integracao</p>
                <h2 className="mt-2 text-lg font-semibold text-slate-950">{STATUS_INTEGRACAO_ACESSORIAS_LABELS[currentStatus]}</h2>
              </div>
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getIntegrationToneClass(currentStatus)}`}>{STATUS_INTEGRACAO_ACESSORIAS_LABELS[currentStatus]}</span>
            </div>

            <dl className="mt-6 space-y-4 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">Token</dt>
                <dd className="text-right font-medium text-slate-900">{config?.apiTokenConfigurado ? config.apiTokenMascarado ?? '********' : 'Nao configurado'}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">Ultima sincronizacao</dt>
                <dd className="text-right font-medium text-slate-900">{formatNullableDate(config?.ultimaSincronizacaoEm ?? null)}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">Ultimo erro</dt>
                <dd className="max-w-48 text-right font-medium text-slate-900">{formatNullableText(config?.mensagemErroAtual ?? null)}</dd>
              </div>
            </dl>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <div className="flex flex-col gap-2 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Configuracao</p>
                <h2 className="mt-2 text-lg font-semibold text-slate-950">Token e validacao da conexao</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">Salve o token antes de testar a conexao. O teste usa o token persistido e registra um job auditavel.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{config?.createdAt ? 'Configuracao existente' : 'Nova configuracao'}</div>
            </div>

            <form className="mt-5 space-y-4" onSubmit={(event) => void handleSave(event)}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="apiToken">Token da API</label>
                <input autoComplete="off" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900" id="apiToken" name="apiToken" onChange={(event) => setApiToken(event.target.value)} placeholder="Cole o token da Acessorias" type="password" value={apiToken} />
              </div>

              <div className="flex flex-wrap gap-3">
                <button className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving} type="submit">{isSaving ? 'Salvando...' : 'Salvar configuracao'}</button>
                <button className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60" disabled={isTesting} onClick={() => void handleTestConnection()} type="button">{isTesting ? 'Testando...' : 'Testar conexao'}</button>
              </div>
            </form>

            <div className="mt-6 border-t border-slate-200 pt-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Empresas Acessorias</p>
                  <h3 className="mt-2 text-base font-semibold text-slate-950">Sincronizacao de empresas externas</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">O match automatico so acontece quando o CNPJ externo for inequivoco. Casos ambiguos permanecem para revisao manual.</p>
                </div>
                <button className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSyncing} onClick={() => void handleSyncCompanies()} type="button">{isSyncing ? 'Sincronizando...' : 'Sincronizar empresas'}</button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Empresas externas</div><div className="mt-2 text-xl font-semibold text-slate-950">{totalExternalCompanies}</div></div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Vinculadas</div><div className="mt-2 text-xl font-semibold text-slate-950">{linkedCompanies}</div></div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Pendentes</div><div className="mt-2 text-xl font-semibold text-slate-950">{pendingCompanies}</div></div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Automaticas</div><div className="mt-2 text-xl font-semibold text-slate-950">{automaticCompanies}</div></div>
              </div>

              {ignoredCompanies > 0 ? <p className="mt-3 text-sm text-slate-600">Ignoradas manualmente: {ignoredCompanies}</p> : null}
            </div>
          </article>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Vinculos de empresas</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">Empresas externas sincronizadas</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">O ECAC continua como fonte principal de verdade. A base externa entra somente como origem opcional para vinculo.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{totalExternalCompanies} empresa{totalExternalCompanies === 1 ? '' : 's'}</div>
          </div>

          {companies.length === 0 ? (
            <div className="py-8 text-sm text-slate-600">Nenhuma empresa externa sincronizada ainda.</div>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-3 py-3 font-medium">Empresa externa</th>
                    <th className="px-3 py-3 font-medium">CNPJ</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Match automatico</th>
                    <th className="px-3 py-3 font-medium">Vinculo ECAC</th>
                    <th className="px-3 py-3 font-medium">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companies.map((company) => {
                    const selectedInternalCompanyId = linkDrafts[company.id] ?? company.empresaId ?? '';
                    const rowBusy = rowAction?.companyId === company.id;
                    const isLinked = company.statusVinculo === 'VINCULADA';
                    return (
                      <tr key={company.id} className="align-top">
                        <td className="px-3 py-4"><div className="space-y-1"><div className="font-medium text-slate-950">{company.nomeExterno}</div><div className="text-xs text-slate-500">ID externo: {company.acessoriasEmpresaId}</div></div></td>
                        <td className="px-3 py-4 text-slate-700">{formatCnpjOrDash(company.cnpjExterno)}</td>
                        <td className="px-3 py-4 text-slate-700"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getLinkToneClass(company.statusVinculo)}`}>{STATUS_VINCULO_ACESSORIAS_LABELS[company.statusVinculo]}</span></td>
                        <td className="px-3 py-4 text-slate-700"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getMatchToneClass(company.matchAutomatico)}`}>{company.matchAutomatico ? 'Automatica' : 'Manual'}</span></td>
                        <td className="px-3 py-4 text-slate-700"><div className="space-y-1">{company.empresa ? <div className="font-medium text-slate-950">{company.empresa.razaoSocial}</div> : <div className="font-medium text-slate-950">{company.statusVinculo === 'AMBIGUA' ? 'Aguardando revisao manual' : company.statusVinculo === 'IGNORADA' ? 'Ignorada manualmente' : 'Sem vinculo'}</div>}<div className="text-xs text-slate-500">{company.empresa ? formatCnpjOrDash(company.empresa.cnpj) : 'Aguardando vinculo'}</div><div className="text-xs text-slate-500">Sincronizacao: {company.sincronizacaoHabilitada ? 'habilitada' : 'desabilitada'}</div><div className="text-xs text-slate-500">Ultima sincronizacao: {formatNullableDate(company.ultimaSincronizacaoEm)}</div></div></td>
                        <td className="px-3 py-4 text-slate-700"><div className="space-y-2"><div className="space-y-1"><label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500" htmlFor={`internal-company-${company.id}`}>Empresa interna</label><select className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100" id={`internal-company-${company.id}`} name={`internal-company-${company.id}`} onChange={(event) => setLinkDrafts((current) => ({ ...current, [company.id]: event.target.value }))} value={selectedInternalCompanyId} disabled={rowBusy || internalCompanies.length === 0}><option value="">{internalCompanies.length === 0 ? 'Nenhuma empresa interna disponivel' : 'Selecione uma empresa interna'}</option>{internalCompanies.map((internalCompany) => <option key={internalCompany.id} value={internalCompany.id}>{internalCompany.razaoSocial} - {formatCnpjOrDash(internalCompany.cnpj)}</option>)}</select></div><div className="flex flex-wrap gap-2"><button className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={rowBusy || internalCompanies.length === 0 || !selectedInternalCompanyId} onClick={() => void handleLinkCompany(company)} type="button">{rowBusy && rowAction?.action === 'link' ? 'Vinculando...' : isLinked ? 'Atualizar vinculo' : 'Vincular'}</button>{company.empresaId ? <button className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-900 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60" disabled={rowBusy} onClick={() => void handleUnlinkCompany(company)} type="button">{rowBusy && rowAction?.action === 'unlink' ? 'Removendo...' : 'Remover vinculo'}</button> : null}</div></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Jobs de empresas</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">Historico de sincronizacao de empresas</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Exibindo apenas as execucoes de sincronizacao de empresas do Acessorias.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{companySyncJobs.length} job{companySyncJobs.length === 1 ? '' : 's'} recente{companySyncJobs.length === 1 ? '' : 's'}</div>
          </div>

          {companySyncJobs.length === 0 ? (
            <div className="py-8 text-sm text-slate-600">Nenhum job de sincronizacao de empresas registrado ainda.</div>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Iniciado</th>
                    <th className="px-3 py-3 font-medium">Finalizado</th>
                    <th className="px-3 py-3 font-medium">Processados</th>
                    <th className="px-3 py-3 font-medium">Criados</th>
                    <th className="px-3 py-3 font-medium">Atualizados</th>
                    <th className="px-3 py-3 font-medium">Ignorados</th>
                    <th className="px-3 py-3 font-medium">Falhas</th>
                    <th className="px-3 py-3 font-medium">Erro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companySyncJobs.map((job) => (
                    <tr key={job.id} className="align-top">
                      <td className="px-3 py-4 text-slate-700"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getJobToneClass(job.status)}`}>{STATUS_JOB_ACESSORIAS_LABELS[job.status]}</span></td>
                      <td className="px-3 py-4 text-slate-700">{formatDateTime(job.iniciadoEm)}</td>
                      <td className="px-3 py-4 text-slate-700">{formatDateTime(job.finalizadoEm)}</td>
                      <td className="px-3 py-4 text-slate-700">{job.processados}</td>
                      <td className="px-3 py-4 text-slate-700">{job.criados}</td>
                      <td className="px-3 py-4 text-slate-700">{job.atualizados}</td>
                      <td className="px-3 py-4 text-slate-700">{job.ignorados}</td>
                      <td className="px-3 py-4 text-slate-700">{job.falhas}</td>
                      <td className="px-3 py-4 text-slate-700">{formatNullableText(job.detalhesErro)}</td>
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
