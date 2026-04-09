'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { requireSession, signOut } from '@/lib/auth';
import {
  getCompany,
  listResponsaveis,
  updateCompany,
  type CompanyCreateInput,
  type CompanyIntegration,
  type CompanyDetailItem,
  type CompanyUpdateInput,
  type RegimeTributario,
  type ResponsavelInternoRecord,
  type StatusAcessoEmpresa,
  type StatusProcuracaoEmpresa
} from '@/lib/api';
import {
  REGIME_TRIBUTARIO_OPTIONS,
  STATUS_ACESSO_LABELS,
  STATUS_ACESSO_OPTIONS,
  STATUS_PROCURACAO_LABELS,
  STATUS_PROCURACAO_OPTIONS
} from '@/lib/constants';
import {
  formatCnpj,
  formatDateTime,
  toDateTimeLocalValue
} from '@/lib/formatters';
import { validateCompanyForm } from '@/lib/validators';

type CompanyFormState = {
  cnpj: string;
  naCarteira: boolean;
  pendenciaOperacional: boolean;
  nomeFantasia: string;
  observacoesOperacionais: string;
  ultimaConferenciaAcessoEm: string;
  ultimaConferenciaOperacionalEm: string;
  ultimaConferenciaProcuracaoEm: string;
  razaoSocial: string;
  regimeTributario: RegimeTributario;
  responsavelInternoId: string;
  statusAcesso: StatusAcessoEmpresa;
  statusProcuracao: StatusProcuracaoEmpresa;
};

type OperationalQuickAction =
  | 'registrarConferencia'
  | 'marcarAcessoDisponivel'
  | 'marcarProcuracaoValida'
  | 'regularizarPendenciaOperacional'
  | 'reabrirPendenciaOperacional';

const initialFormState: CompanyFormState = {
  cnpj: '',
  naCarteira: false,
  pendenciaOperacional: false,
  nomeFantasia: '',
  observacoesOperacionais: '',
  ultimaConferenciaAcessoEm: '',
  ultimaConferenciaOperacionalEm: '',
  ultimaConferenciaProcuracaoEm: '',
  razaoSocial: '',
  regimeTributario: 'SIMPLES_NACIONAL',
  responsavelInternoId: '',
  statusAcesso: 'NAO_VERIFICADO',
  statusProcuracao: 'NAO_VERIFICADA'
};

function buildPayload(form: CompanyFormState): CompanyCreateInput {
  return {
    cnpj: form.cnpj.trim(),
    naCarteira: form.naCarteira,
    pendenciaOperacional: form.pendenciaOperacional,
    nomeFantasia: form.nomeFantasia.trim() || undefined,
    observacoesOperacionais: form.observacoesOperacionais.trim() || undefined,
    ultimaConferenciaAcessoEm: form.ultimaConferenciaAcessoEm.trim()
      ? new Date(form.ultimaConferenciaAcessoEm).toISOString()
      : null,
    ultimaConferenciaOperacionalEm: form.ultimaConferenciaOperacionalEm.trim()
      ? new Date(form.ultimaConferenciaOperacionalEm).toISOString()
      : null,
    ultimaConferenciaProcuracaoEm: form.ultimaConferenciaProcuracaoEm.trim()
      ? new Date(form.ultimaConferenciaProcuracaoEm).toISOString()
      : null,
    razaoSocial: form.razaoSocial.trim(),
    regimeTributario: form.regimeTributario,
    responsavelInternoId: form.responsavelInternoId.trim() || null,
    statusAcesso: form.statusAcesso,
    statusProcuracao: form.statusProcuracao
  };
}

function toFormState(company: CompanyDetailItem): CompanyFormState {
  return {
    cnpj: company.cnpj,
    naCarteira: company.naCarteira,
    pendenciaOperacional: company.pendenciaOperacional,
    nomeFantasia: company.nomeFantasia ?? '',
    observacoesOperacionais: company.observacoesOperacionais ?? '',
    ultimaConferenciaAcessoEm: toDateTimeLocalValue(
      company.ultimaConferenciaAcessoEm
    ),
    ultimaConferenciaOperacionalEm: toDateTimeLocalValue(
      company.ultimaConferenciaOperacionalEm
    ),
    ultimaConferenciaProcuracaoEm: toDateTimeLocalValue(
      company.ultimaConferenciaProcuracaoEm
    ),
    razaoSocial: company.razaoSocial,
    regimeTributario: company.regimeTributario,
    responsavelInternoId: company.responsavelInterno?.id ?? '',
    statusAcesso: company.statusAcesso,
    statusProcuracao: company.statusProcuracao
  };
}

function formatResponsavelOption(responsavel: ResponsavelInternoRecord) {
  return `${responsavel.nome} (${responsavel.email})${
    responsavel.ativo ? '' : ' - Inativo'
  }`;
}

function formatOperationalDate(value: string | null | undefined) {
  return value ? formatDateTime(value) : 'Nao registrada';
}

function formatOperationalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : 'Sem observacoes.';
}

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

function getStatusToneClasses(tone: StatusTone): string {
  switch (tone) {
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'danger':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'neutral':
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

function getAccessTone(status: StatusAcessoEmpresa): StatusTone {
  if (status === 'DISPONIVEL') {
    return 'success';
  }

  if (status === 'NAO_VERIFICADO') {
    return 'warning';
  }

  return 'danger';
}

function getProcuracaoTone(status: StatusProcuracaoEmpresa): StatusTone {
  if (status === 'VALIDA') {
    return 'success';
  }

  if (status === 'NAO_VERIFICADA') {
    return 'warning';
  }

  return 'danger';
}

function getPendenciaTone(value: boolean): StatusTone {
  return value ? 'danger' : 'success';
}

function getIntegrationTone(
  status: CompanyIntegration['statusIntegracao']
): StatusTone {
  switch (status) {
    case 'ATIVA':
      return 'success';
    case 'ERRO':
      return 'danger';
    case 'INATIVA':
      return 'warning';
    case 'NAO_CONFIGURADA':
    default:
      return 'neutral';
  }
}

function describeOperationalAttention(company: CompanyDetailItem) {
  const items: string[] = [];
  let tone: StatusTone = 'success';

  if (company.statusAcesso !== 'DISPONIVEL') {
    items.push(`Acesso: ${STATUS_ACESSO_LABELS[company.statusAcesso]}`);
    tone = company.statusAcesso === 'NAO_VERIFICADO' ? tone : 'danger';
  }

  if (company.statusProcuracao !== 'VALIDA') {
    items.push(`Procuracao: ${STATUS_PROCURACAO_LABELS[company.statusProcuracao]}`);
    tone = company.statusProcuracao === 'NAO_VERIFICADA' && tone !== 'danger'
      ? 'warning'
      : 'danger';
  }

  if (company.pendenciaOperacional) {
    items.push('Pendencia operacional aberta');
    tone = 'danger';
  }

  if (items.length === 0) {
    return {
      items,
      tone: 'success' as const,
      title: 'Estado operacional regular'
    };
  }

  return {
    items,
    tone,
    title: tone === 'danger' ? 'Tratamento requerido' : 'Acompanhar confirmacao'
  };
}

function StatusCard({
  label,
  note,
  tone,
  value
}: {
  label: string;
  note?: string;
  tone: StatusTone;
  value: string;
}) {
  return (
    <div className={`rounded-xl border px-3 py-3 ${getStatusToneClasses(tone)}`}>
      <p className="text-xs uppercase tracking-[0.18em] opacity-80">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
      {note ? <p className="mt-1 text-xs leading-5 opacity-90">{note}</p> : null}
    </div>
  );
}

export default function CompanyDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const companyId = Array.isArray(params.id) ? params.id[0] : params.id;
  const submitLockRef = useRef(false);
  const [company, setCompany] = useState<CompanyDetailItem | null>(null);
  const [responsaveis, setResponsaveis] = useState<ResponsavelInternoRecord[]>(
    []
  );
  const [form, setForm] = useState<CompanyFormState>(initialFormState);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeQuickAction, setActiveQuickAction] =
    useState<OperationalQuickAction | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [flashMessage, setFlashMessage] = useState('');

  useEffect(() => {
    const paramsSearch = new URLSearchParams(window.location.search);
    setFlashMessage(
      paramsSearch.get('flash')?.startsWith('created:')
        ? 'Empresa cadastrada com sucesso.'
        : ''
    );
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!companyId) {
        if (active) {
          setError('Empresa invalida.');
          setLoading(false);
        }
        return;
      }

      try {
        await requireSession();
        const data = await getCompany(companyId);

        if (!active) {
          return;
        }

        setCompany(data);
        setForm(toFormState(data));

        try {
          const items = await listResponsaveis();

          if (active) {
            setResponsaveis(items);
          }
        } catch (responsaveisError) {
          if (!active) {
            return;
          }

          setError(
            responsaveisError instanceof Error
              ? responsaveisError.message
              : 'Falha ao carregar responsaveis.'
          );
        }
      } catch (loadError) {
        if (!active) {
          return;
        }

        if (loadError instanceof Error && loadError.message === 'Nao autenticado.') {
          router.replace('/login');
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Falha ao carregar empresa.'
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
  }, [companyId, router]);

  async function handleLogout() {
    setIsSigningOut(true);

    try {
      await signOut();
    } catch {
      // Best effort logout; fall through to redirect.
    } finally {
      router.replace('/login');
      setIsSigningOut(false);
    }
  }

  async function persistCompanyUpdate(
    payload: CompanyUpdateInput,
    successMessage: string,
    quickAction: OperationalQuickAction | null = null
  ) {
    if (submitLockRef.current) {
      return;
    }

    submitLockRef.current = true;
    setIsSaving(true);
    setActiveQuickAction(quickAction);
    setError('');
    setMessage('');
    setFlashMessage('');

    try {
      if (!companyId) {
        throw new Error('Empresa invalida.');
      }

      const updated = await updateCompany(companyId, payload);
      setCompany(updated);
      setForm(toFormState(updated));
      setMessage(successMessage);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Falha ao atualizar empresa.'
      );
    } finally {
      submitLockRef.current = false;
      setIsSaving(false);
      setActiveQuickAction(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (submitLockRef.current) {
      return;
    }

    const validationError = validateCompanyForm(form, responsaveis);

    if (validationError) {
      setError(validationError);
      return;
    }

    setFlashMessage('');
    await persistCompanyUpdate(
      buildPayload(form),
      'Empresa atualizada com sucesso.'
    );
  }

  async function handleQuickAction(action: OperationalQuickAction) {
    const now = new Date().toISOString();

    switch (action) {
      case 'registrarConferencia':
        await persistCompanyUpdate(
          {
            ultimaConferenciaOperacionalEm: now
          },
          'Conferencia operacional registrada agora.',
          action
        );
        break;
      case 'marcarAcessoDisponivel':
        await persistCompanyUpdate(
          {
            statusAcesso: 'DISPONIVEL'
          },
          'Acesso marcado como disponivel.',
          action
        );
        break;
      case 'marcarProcuracaoValida':
        await persistCompanyUpdate(
          {
            statusProcuracao: 'VALIDA'
          },
          'Procuracao marcada como valida.',
          action
        );
        break;
      case 'regularizarPendenciaOperacional':
        await persistCompanyUpdate(
          {
            pendenciaOperacional: false,
            regularizadaEm: now
          },
          'Pendencia operacional regularizada.',
          action
        );
        break;
      case 'reabrirPendenciaOperacional':
        await persistCompanyUpdate(
          {
            pendenciaOperacional: true,
            regularizadaEm: null
          },
          'Pendencia operacional reaberta.',
          action
        );
        break;
    }
  }

  const operationalAttention = company ? describeOperationalAttention(company) : null;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-slate-600">Carregando empresa...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
              ECAC AUTOMAÇÃO
            </p>
            <h1 className="text-3xl font-semibold text-slate-950">
              {company?.razaoSocial ?? 'Detalhe da empresa'}
            </h1>
            <p className="text-sm text-slate-600">
              Visualizacao e edicao basica do cadastro operacional.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
              href="/empresas"
            >
              Voltar
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
              href="/responsaveis"
            >
              Responsaveis
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
          <p
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {message || flashMessage ? (
          <p
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
            role="status"
          >
            {message || flashMessage}
          </p>
        ) : null}

        {company ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                    Centro operacional da empresa
                  </p>
                  <h2 className="text-xl font-semibold text-slate-950">
                    Tratar acesso, procuracao e pendencia operacional
                  </h2>
                  <p className="max-w-2xl text-sm leading-6 text-slate-600">
                    A tela prioriza os sinais de atencao e os atalhos de
                    tratamento para manter o trabalho no mesmo registro.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <span>{formatCnpj(company.cnpj)}</span>
                    <span className="text-slate-300">-</span>
                    <span>{company.nomeFantasia || company.razaoSocial}</span>
                  </div>
                </div>

                {operationalAttention ? (
                  <div
                    className={`rounded-2xl border p-4 ${getStatusToneClasses(operationalAttention.tone)}`}
                  >
                    <p className="text-xs font-medium uppercase tracking-[0.22em] opacity-80">
                      Leitura operacional
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {operationalAttention.title}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {operationalAttention.items.length === 0 ? (
                        <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-inherit">
                          Nenhuma irregularidade aberta.
                        </span>
                      ) : (
                        operationalAttention.items.map((item) => (
                          <span
                            className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-inherit"
                            key={item}
                          >
                            {item}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <StatusCard
                    label="Status de acesso"
                    note={
                      company.statusAcesso === 'DISPONIVEL'
                        ? 'Acesso regular'
                        : company.statusAcesso === 'NAO_VERIFICADO'
                          ? 'Pendente de conferencia'
                          : 'Requer tratamento'
                    }
                    tone={getAccessTone(company.statusAcesso)}
                    value={STATUS_ACESSO_LABELS[company.statusAcesso]}
                  />
                  <StatusCard
                    label="Status de procuracao"
                    note={
                      company.statusProcuracao === 'VALIDA'
                        ? 'Procuracao regular'
                        : company.statusProcuracao === 'NAO_VERIFICADA'
                          ? 'Pendente de conferencia'
                          : 'Requer tratamento'
                    }
                    tone={getProcuracaoTone(company.statusProcuracao)}
                    value={STATUS_PROCURACAO_LABELS[company.statusProcuracao]}
                  />
                  <StatusCard
                    label="Pendencia operacional"
                    note={
                      company.pendenciaOperacional
                        ? 'A fila deve tratar'
                        : 'Sem pendencia aberta'
                    }
                    tone={getPendenciaTone(company.pendenciaOperacional)}
                    value={company.pendenciaOperacional ? 'Aberta' : 'Fechada'}
                  />
                  <StatusCard
                    label="Responsavel interno"
                    note={
                      company.responsavelInterno
                        ? company.responsavelInterno.email
                        : 'Vinculo pendente'
                    }
                    tone={company.responsavelInterno ? 'neutral' : 'warning'}
                    value={
                      company.responsavelInterno
                        ? company.responsavelInterno.nome
                        : 'Sem responsavel'
                    }
                  />
                </div>
              </div>

              <aside className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  Acoes rapidas
                </p>
                <p className="text-sm leading-6 text-slate-600">
                  Use estes atalhos para registrar a situacao operacional sem
                  sair da empresa.
                </p>
                <div className="grid gap-3">
                  <button
                    className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isSaving}
                    onClick={() => void handleQuickAction('registrarConferencia')}
                    type="button"
                  >
                    {activeQuickAction === 'registrarConferencia'
                      ? 'Registrando...'
                      : 'Registrar conferencia agora'}
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isSaving}
                    onClick={() =>
                      void handleQuickAction('marcarAcessoDisponivel')
                    }
                    type="button"
                  >
                    {activeQuickAction === 'marcarAcessoDisponivel'
                      ? 'Aplicando...'
                      : 'Marcar acesso como disponivel'}
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isSaving}
                    onClick={() =>
                      void handleQuickAction('marcarProcuracaoValida')
                    }
                    type="button"
                  >
                    {activeQuickAction === 'marcarProcuracaoValida'
                      ? 'Aplicando...'
                      : 'Marcar procuracao como valida'}
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isSaving}
                    onClick={() =>
                      void handleQuickAction(
                        'regularizarPendenciaOperacional'
                      )
                    }
                    type="button"
                  >
                    {activeQuickAction === 'regularizarPendenciaOperacional'
                      ? 'Aplicando...'
                      : 'Marcar pendencia operacional como regularizada'}
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isSaving}
                    onClick={() =>
                      void handleQuickAction('reabrirPendenciaOperacional')
                    }
                    type="button"
                  >
                    {activeQuickAction === 'reabrirPendenciaOperacional'
                      ? 'Aplicando...'
                      : 'Reabrir pendencia operacional'}
                  </button>
                </div>
                <Link
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
                  href={`/pendencias?empresaId=${company.id}`}
                >
                  Ver pendencias desta empresa
                </Link>
                <p className="text-xs leading-5 text-slate-500">
                  As acoes salvam imediatamente no registro da empresa e
                  atualizam o painel de pendencias na proxima consulta.
                </p>
              </aside>
            </div>
          </section>
        ) : null}

        {company ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Dados principais
                </h2>
                <p className="text-sm text-slate-600">
                  Identidade, responsavel e marcos da operacao atual.
                </p>
              </div>

              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    CNPJ
                  </dt>
                  <dd className="text-sm font-medium text-slate-900">
                    {formatCnpj(company.cnpj)}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Regime tributario
                  </dt>
                  <dd className="text-sm font-medium text-slate-900">
                    {company.regimeTributario}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Status de acesso
                  </dt>
                  <dd className="text-sm font-medium text-slate-900">
                    {STATUS_ACESSO_LABELS[company.statusAcesso]}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Status de procuracao
                  </dt>
                  <dd className="text-sm font-medium text-slate-900">
                    {STATUS_PROCURACAO_LABELS[company.statusProcuracao]}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Ultima conferencia de acesso
                  </dt>
                  <dd className="text-sm font-medium text-slate-900">
                    {formatDateTime(company.ultimaConferenciaAcessoEm)}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Ultima conferencia de procuracao
                  </dt>
                  <dd className="text-sm font-medium text-slate-900">
                    {formatDateTime(company.ultimaConferenciaProcuracaoEm)}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Ultima conferencia operacional
                  </dt>
                  <dd className="text-sm font-medium text-slate-900">
                    {formatDateTime(company.ultimaConferenciaOperacionalEm)}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Pendencia operacional
                  </dt>
                  <dd className="text-sm font-medium text-slate-900">
                    {company.pendenciaOperacional ? 'Sim' : 'Nao'}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Regularizada em
                  </dt>
                  <dd className="text-sm font-medium text-slate-900">
                    {formatDateTime(company.regularizadaEm)}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Responsavel interno
                  </dt>
                  <dd className="text-sm font-medium text-slate-900">
                    {company.responsavelInterno
                      ? company.responsavelInterno.nome
                      : '-'}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Na carteira
                  </dt>
                  <dd className="text-sm font-medium text-slate-900">
                    {company.naCarteira ? 'Sim' : 'Nao'}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Atualizacao
                  </dt>
                  <dd className="text-sm font-medium text-slate-900">
                    {formatDateTime(company.updatedAt)}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Ultima varredura
                  </dt>
                  <dd className="text-sm font-medium text-slate-900">
                    {formatDateTime(company.ultimaVarreduraEm)}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Ultimo evento
                  </dt>
                  <dd className="text-sm font-medium text-slate-900">
                    {formatDateTime(company.ultimoEventoRelevanteEm)}
                  </dd>
                </div>
              </dl>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Observacoes operacionais
                    </h3>
                    <p className="text-xs leading-5 text-slate-500">
                      Campo de tratamento para contexto, pendencias e proximo
                      passo.
                    </p>
                  </div>
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Leitura atual
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {formatOperationalText(company.observacoesOperacionais)}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Integracoes
                    </h3>
                    <p className="text-xs text-slate-500">
                      Estado atual da integracao existente na empresa.
                    </p>
                  </div>
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {company.integracoes.length} registro(s)
                  </span>
                </div>
                {company.integracoes.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-600">
                    Sem integracoes registradas.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {company.integracoes.map((integration) => (
                      <li
                        className="rounded-2xl border border-slate-200 bg-white p-4"
                        key={integration.id}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-slate-900">
                              {integration.tipoIntegracao}
                            </p>
                            <p className="text-xs text-slate-500">
                              Atualizado em {formatDateTime(integration.updatedAt)}
                            </p>
                          </div>
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getStatusToneClasses(
                              getIntegrationTone(integration.statusIntegracao)
                            )}`}
                          >
                            {integration.statusIntegracao}
                          </span>
                        </div>
                        {integration.observacoes ? (
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                            {integration.observacoes}
                          </p>
                        ) : null}
                        {integration.mensagemErroAtual ? (
                          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {integration.mensagemErroAtual}
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                          {integration.ultimoSucessoEm ? (
                            <span>
                              Ultimo sucesso {formatDateTime(integration.ultimoSucessoEm)}
                            </span>
                          ) : null}
                          {integration.ultimoErroEm ? (
                            <span>
                              Ultimo erro {formatDateTime(integration.ultimoErroEm)}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-slate-900">
                  Atualizacao operacional
                </h2>
                <p className="text-sm text-slate-600">
                  Atualize os campos principais e os status que alimentam o
                  tratamento da empresa.
                </p>
              </div>

              <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                <fieldset className="space-y-5" disabled={isSaving}>
                  <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="block text-sm font-medium text-slate-700">
                      CNPJ
                    </span>
                    <input
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                      name="cnpj"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          cnpj: event.target.value
                        }))
                      }
                      required
                      type="text"
                      value={form.cnpj}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="block text-sm font-medium text-slate-700">
                      Razao social
                    </span>
                    <input
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                      name="razaoSocial"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          razaoSocial: event.target.value
                        }))
                      }
                      required
                      type="text"
                      value={form.razaoSocial}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="block text-sm font-medium text-slate-700">
                      Nome fantasia
                    </span>
                    <input
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                      name="nomeFantasia"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          nomeFantasia: event.target.value
                        }))
                      }
                      type="text"
                      value={form.nomeFantasia}
                    />
                  </label>

              <label className="space-y-2">
                <span className="block text-sm font-medium text-slate-700">
                  Responsavel interno (opcional)
                </span>
                  <select
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                    name="responsavelInternoId"
                    onChange={(event) =>
                      setForm((current) => ({
                      ...current,
                      responsavelInternoId: event.target.value
                    }))
                  }
                  value={form.responsavelInternoId}
                >
                  <option value="">
                    {responsaveis.length === 0
                      ? 'Sem responsavel cadastrado'
                      : 'Sem responsavel (opcional)'}
                    </option>
                    {responsaveis.map((responsavel) => (
                      <option key={responsavel.id} value={responsavel.id}>
                        {formatResponsavelOption(responsavel)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-slate-300 px-3 py-2">
                  <input
                    checked={form.naCarteira}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    name="naCarteira"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        naCarteira: event.target.checked
                      }))
                    }
                    type="checkbox"
                  />
                  <span className="text-sm font-medium text-slate-700">
                    Na carteira operacional
                  </span>
                </label>

                  <label className="space-y-2">
                    <span className="block text-sm font-medium text-slate-700">
                      Regime tributario
                    </span>
                    <select
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                      name="regimeTributario"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          regimeTributario:
                            event.target.value as RegimeTributario
                        }))
                      }
                      value={form.regimeTributario}
                    >
                      {REGIME_TRIBUTARIO_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="block text-sm font-medium text-slate-700">
                      Status de acesso
                    </span>
                    <select
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                      name="statusAcesso"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          statusAcesso:
                            event.target.value as StatusAcessoEmpresa
                        }))
                      }
                      value={form.statusAcesso}
                    >
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
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          statusProcuracao:
                            event.target.value as StatusProcuracaoEmpresa
                        }))
                      }
                      value={form.statusProcuracao}
                    >
                      {STATUS_PROCURACAO_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex items-center gap-3 rounded-xl border border-slate-300 px-3 py-2">
                    <input
                      checked={form.pendenciaOperacional}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      name="pendenciaOperacional"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          pendenciaOperacional: event.target.checked
                        }))
                      }
                      type="checkbox"
                    />
                    <span className="text-sm font-medium text-slate-700">
                      Pendencia operacional
                    </span>
                  </label>

                  <div className="grid gap-4 md:col-span-2 md:grid-cols-3">
                    <label className="space-y-2">
                      <span className="block text-sm font-medium text-slate-700">
                        Ultima conferencia de acesso
                      </span>
                      <input
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                        name="ultimaConferenciaAcessoEm"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            ultimaConferenciaAcessoEm: event.target.value
                          }))
                        }
                        type="datetime-local"
                        value={form.ultimaConferenciaAcessoEm}
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="block text-sm font-medium text-slate-700">
                        Ultima conferencia de procuracao
                      </span>
                      <input
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                        name="ultimaConferenciaProcuracaoEm"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            ultimaConferenciaProcuracaoEm: event.target.value
                          }))
                        }
                        type="datetime-local"
                        value={form.ultimaConferenciaProcuracaoEm}
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="block text-sm font-medium text-slate-700">
                        Ultima conferencia operacional
                      </span>
                      <input
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                        name="ultimaConferenciaOperacionalEm"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            ultimaConferenciaOperacionalEm: event.target.value
                          }))
                        }
                        type="datetime-local"
                        value={form.ultimaConferenciaOperacionalEm}
                      />
                    </label>
                  </div>
                </div>

                <label className="space-y-2">
                  <span className="block text-sm font-medium text-slate-700">
                    Observacoes operacionais
                  </span>
                  <p className="text-xs leading-5 text-slate-500">
                    Use este campo para contexto, combinados e o proximo passo
                    operacional.
                  </p>
                  <textarea
                    className="min-h-32 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                    name="observacoesOperacionais"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        observacoesOperacionais: event.target.value
                      }))
                    }
                    placeholder="Registre contexto, pendencias, contato e o proximo passo."
                    value={form.observacoesOperacionais}
                  />
                </label>

                {error ? (
                  <p
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
                    role="alert"
                  >
                    {error}
                  </p>
                ) : null}
                </fieldset>

                <div className="flex flex-wrap gap-3">
                  <button
                    className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-busy={isSaving}
                    disabled={isSaving}
                    type="submit"
                  >
                    {isSaving ? 'Salvando...' : 'Salvar alteracoes'}
                  </button>
                  <Link
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
                    href="/empresas"
                  >
                    Voltar
                  </Link>
                </div>
              </form>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
