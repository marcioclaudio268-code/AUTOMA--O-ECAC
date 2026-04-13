export type PerfilUsuario = 'ADMIN' | 'OPERACIONAL';

export type RegimeTributario =
  | 'SIMPLES_NACIONAL'
  | 'LUCRO_PRESUMIDO'
  | 'LUCRO_REAL'
  | 'OUTRO';

export type StatusAcessoEmpresa =
  | 'DISPONIVEL'
  | 'INDISPONIVEL'
  | 'BLOQUEADO'
  | 'NAO_VERIFICADO';

export type StatusProcuracaoEmpresa =
  | 'VALIDA'
  | 'INVALIDA'
  | 'PENDENTE'
  | 'NAO_VERIFICADA';

export type TipoIntegracao = 'MANUAL' | 'API' | 'RPA';

export type StatusIntegracao =
  | 'ATIVA'
  | 'INATIVA'
  | 'ERRO'
  | 'NAO_CONFIGURADA';

export type TipoVarredura = 'MANUAL';

export type StatusExecucaoVarredura = 'INICIADA' | 'CONCLUIDA' | 'FALHA';

export type TipoEventoOperacional =
  | 'VARREDURA_RELEVANTE'
  | 'MUDANCA_ESTADO';

export type TipoPendencia = 'ACESSO' | 'OPERACIONAL' | 'PROCURACAO';

export type StatusPendencia = 'ABERTA' | 'RESOLVIDA';

export type PrioridadePendencia = 'BAIXA' | 'MEDIA' | 'ALTA';

export type PendenciaSortBy =
  | 'PRIORIDADE'
  | 'ABERTA_EM'
  | 'ATUALIZADA_EM'
  | 'STATUS';

export type SortDirection = 'ASC' | 'DESC';

export type TipoLogExecucao =
  | 'CONFERENCIA_OPERACIONAL'
  | 'REGISTRO_PENDENCIA'
  | 'REGULARIZACAO_PENDENCIA'
  | 'RETIRADA_CARTEIRA';

export type ResultadoLogExecucao = 'FALHA' | 'SEM_ALTERACAO' | 'SUCESSO';

export type StatusPendenciaOperacional = StatusPendencia;

export type CriticidadePendenciaOperacional = PrioridadePendencia;

export type PendenciaStatusAtual =
  | StatusAcessoEmpresa
  | StatusProcuracaoEmpresa
  | StatusPendencia
  | 'PENDENTE';

export type AuthUser = {
  email: string;
  id: string;
  nome: string;
  perfil: PerfilUsuario;
};

export type LoginResponse = {
  user: AuthUser;
};

export type ResponsavelInternoSummary = {
  ativo: boolean;
  email: string;
  id: string;
  nome: string;
  usuarioInternoId: string;
};

export type DashboardResponsavelSummary = {
  responsavelInternoId: string | null;
  responsavelNome: string;
  totalEmpresas: number;
};

export type DashboardSummaryResponse = {
  totalEmpresasNaCarteira: number;
  totalEmpresasComPendenciaOperacional: number;
  totalEmpresasComAcessoPendenteOuBloqueado: number;
  totalEmpresasComProcuracaoPendente: number;
  distribuicaoPorResponsavel: DashboardResponsavelSummary[];
};

export type PendenciaRecord = {
  abertaEm: string;
  atualizadaPorUsuarioInternoId: string | null;
  atualizadaPorUsuarioInternoNome: string | null;
  criadaPorUsuarioInternoId: string | null;
  criadaPorUsuarioInternoNome: string | null;
  createdAt: string;
  descricao: string;
  empresaCnpj: string;
  empresaId: string;
  empresaNome: string;
  empresaNomeFantasia: string | null;
  fechadaEm: string | null;
  id: string;
  linkTratamento: string;
  motivo: string;
  observacaoOperacional: string | null;
  origem: string | null;
  prioridade: PrioridadePendencia;
  criticidade: PrioridadePendencia;
  responsavelInternoId: string | null;
  responsavelInternoNome: string;
  resolvedAt: string | null;
  status: StatusPendencia;
  statusAtual: PendenciaStatusAtual;
  tipo: TipoPendencia;
  tipoPendencia: TipoPendencia;
  titulo: string;
  ultimaConferenciaOperacionalEm: string | null;
  updatedAt: string;
};

export type PendenciaListItem = PendenciaRecord;

export type PendenciaListFilters = {
  criticidade?: PrioridadePendencia | undefined;
  empresaId?: string | undefined;
  page?: number | undefined;
  prioridade?: PrioridadePendencia | undefined;
  responsavelInternoId?: string | undefined;
  sortBy?: PendenciaSortBy | undefined;
  sortDirection?: SortDirection | undefined;
  status?: StatusPendencia | undefined;
  take?: number | undefined;
  tipoPendencia?: TipoPendencia | undefined;
};

export type VarreduraRecord = {
  createdAt: string;
  empresaId: string;
  finalizadoEm: string | null;
  id: string;
  iniciadoEm: string;
  resumoResultado: string | null;
  statusExecucao: StatusExecucaoVarredura;
  tipoVarredura: TipoVarredura;
  updatedAt: string;
};

export type ManualScanExecutionResponse = {
  varredura: VarreduraRecord;
};

export type RecentScansFilters = {
  take?: number | undefined;
};

export type EventoOperacionalRecord = {
  createdAt: string;
  descricao: string;
  empresaId: string;
  id: string;
  metadata: Record<string, unknown> | null;
  tipoEvento: TipoEventoOperacional;
  varreduraId: string;
};

export type RecentEventosFilters = {
  take?: number | undefined;
};

export type LogExecucaoRecord = {
  createdAt: string;
  detalhes: string | null;
  empresaId: string;
  empresaNome: string;
  executadoEm: string;
  executadoPorUsuarioInternoId: string | null;
  executadoPorUsuarioInternoNome: string;
  id: string;
  chaveIdempotencia: string | null;
  pendenciaId: string | null;
  pendenciaStatus: StatusPendencia | null;
  pendenciaTipo: TipoPendencia | null;
  pendenciaTitulo: string | null;
  resultado: ResultadoLogExecucao;
  resumo: string;
  tipo: TipoLogExecucao;
};

export type CompanyOperationalHistory = {
  empresaId: string;
  empresaNome: string;
  logs: LogExecucaoRecord[];
  pendencias: PendenciaRecord[];
};

export type PendenciaOperacionalRecord = PendenciaRecord;

export type RecentPendenciasFilters = PendenciaListFilters;

export type PendenciaCreateInput = {
  chaveIdempotencia?: string | null | undefined;
  descricao?: string | undefined;
  origem?: string | undefined;
  prioridade?: PrioridadePendencia | undefined;
  responsavelInternoId?: string | null | undefined;
  status?: StatusPendencia | undefined;
  tipo?: TipoPendencia | undefined;
  titulo?: string | undefined;
};

export type PendenciaUpdateInput = {
  descricao?: string | undefined;
  origem?: string | undefined;
  prioridade?: PrioridadePendencia | undefined;
  responsavelInternoId?: string | null | undefined;
  status?: StatusPendencia | undefined;
  titulo?: string | undefined;
};

export type CompanyOperationalActionInput = {
  chaveIdempotencia?: string | null | undefined;
  pendenciaId?: string | null | undefined;
};

export type CompanyOperationalMutationResponse = {
  updatedAt: string;
};

export type CreateCompanyPendenciaInput = PendenciaCreateInput;

export type ResponsavelInternoDetail = {
  ativo: boolean;
  email: string;
  id: string;
  nome: string;
  usuarioInterno: {
    ativo: boolean;
    email: string;
    id: string;
    nome: string;
    perfil: PerfilUsuario;
  };
};

export type CompanyBase = {
  cnpj: string;
  createdAt: string;
  id: string;
  naCarteira: boolean;
  pendenciaOperacional: boolean;
  nomeFantasia: string | null;
  observacoesOperacionais: string | null;
  razaoSocial: string;
  regimeTributario: RegimeTributario;
  responsavelInternoId: string | null;
  statusAcesso: StatusAcessoEmpresa;
  statusProcuracao: StatusProcuracaoEmpresa;
  ultimaConferenciaAcessoEm: string | null;
  ultimaConferenciaOperacionalEm: string | null;
  ultimaConferenciaProcuracaoEm: string | null;
  regularizadaEm: string | null;
  ultimaVarreduraEm: string | null;
  ultimoEventoRelevanteEm: string | null;
  updatedAt: string;
};

export type CompanyListItem = CompanyBase & {
  responsavelInterno: ResponsavelInternoSummary | null;
};

export type CompanyIntegration = {
  createdAt: string;
  empresaId: string;
  id: string;
  mensagemErroAtual: string | null;
  observacoes: string | null;
  statusIntegracao: StatusIntegracao;
  tipoIntegracao: TipoIntegracao;
  updatedAt: string;
  ultimoErroEm: string | null;
  ultimoSucessoEm: string | null;
};

export type CompanyDetailItem = CompanyBase & {
  integracoes: CompanyIntegration[];
  responsavelInterno: ResponsavelInternoDetail | null;
};

export type CompanyCreateInput = {
  cnpj: string;
  naCarteira?: boolean | undefined;
  nomeFantasia?: string | undefined;
  observacoesOperacionais?: string | undefined;
  razaoSocial: string;
  regimeTributario: RegimeTributario;
  responsavelInternoId?: string | null | undefined;
  statusAcesso?: StatusAcessoEmpresa | undefined;
  statusProcuracao?: StatusProcuracaoEmpresa | undefined;
  pendenciaOperacional?: boolean | undefined;
  ultimaConferenciaAcessoEm?: string | null | undefined;
  regularizadaEm?: string | null | undefined;
  ultimaConferenciaOperacionalEm?: string | null | undefined;
  ultimaConferenciaProcuracaoEm?: string | null | undefined;
};

export type CompanyUpdateInput = Partial<CompanyCreateInput>;

export type CompanyListFilters = {
  naCarteira?: boolean | undefined;
  pendenciaOperacional?: boolean | undefined;
  responsavelInternoId?: string | undefined;
  statusAcesso?: StatusAcessoEmpresa | undefined;
  statusProcuracao?: StatusProcuracaoEmpresa | undefined;
};

export type ResponsavelInternoRecord = {
  ativo: boolean;
  createdAt: string;
  email: string;
  id: string;
  nome: string;
  updatedAt: string;
  usuarioInternoId: string;
  usuarioInterno: {
    ativo: boolean;
    email: string;
    id: string;
    nome: string;
    perfil: PerfilUsuario;
  };
};

export type ResponsavelInternoCreateInput = {
  ativo?: boolean | undefined;
  email: string;
  nome: string;
  usuarioInternoId: string;
};

export type ResponsavelInternoUpdateInput =
  Partial<ResponsavelInternoCreateInput>;

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type ApiRequestOptions = Omit<RequestInit, 'body' | 'headers'> & {
  body?: unknown;
  headers?: HeadersInit;
};

function parseResponseBody(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function appendQueryParam(
  params: URLSearchParams,
  key: string,
  value: string | boolean | number | undefined
) {
  if (value === undefined) {
    return;
  }

  if (typeof value === 'string' && !value.trim()) {
    return;
  }

  params.set(key, String(value));
}

function getErrorMessage(payload: unknown, status: number): string {
  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const message = (payload as { message?: unknown }).message;

    if (Array.isArray(message) && message.length > 0) {
      const messages = message
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);

      if (messages.length > 0) {
        return messages.join(' | ');
      }
    }

    if (typeof message === 'string' && message.trim()) {
      return message;
    }

    const error = (payload as { error?: unknown }).error;

    if (typeof error === 'string' && error.trim()) {
      return error;
    }
  }

  return `Falha na requisicao (${status}).`;
}

async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { body, headers, ...rest } = options;
  const requestHeaders = new Headers(headers);

  if (body !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  const requestInit: RequestInit = {
    ...rest,
    credentials: 'include',
    headers: requestHeaders
  };

  if (body !== undefined) {
    requestInit.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, requestInit);

  const payload = parseResponseBody(await response.text());

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, response.status));
  }

  return payload as T;
}

function normalizePendenciaRecord(record: PendenciaRecord): PendenciaRecord {
  return {
    ...record,
    resolvedAt: record.resolvedAt ?? record.fechadaEm ?? null
  };
}

function normalizePendenciaRecords(
  records: PendenciaRecord[]
): PendenciaRecord[] {
  return records.map((record) => normalizePendenciaRecord(record));
}

function appendPendenciaFilters(
  params: URLSearchParams,
  filters: PendenciaListFilters
) {
  appendQueryParam(params, 'empresaId', filters.empresaId);
  appendQueryParam(params, 'page', filters.page);
  appendQueryParam(params, 'responsavelInternoId', filters.responsavelInternoId);
  appendQueryParam(params, 'status', filters.status);
  appendQueryParam(
    params,
    'prioridade',
    filters.prioridade ?? filters.criticidade
  );
  appendQueryParam(params, 'sortBy', filters.sortBy);
  appendQueryParam(params, 'sortDirection', filters.sortDirection);
  appendQueryParam(params, 'tipoPendencia', filters.tipoPendencia);
  appendQueryParam(params, 'take', filters.take);
}

export async function getCurrentUser(): Promise<AuthUser> {
  return apiRequest<AuthUser>('/auth/me');
}

export async function login(
  email: string,
  senha: string
): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    body: { email, senha },
    method: 'POST'
  });
}

export async function logout(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>('/auth/logout', {
    method: 'POST'
  });
}

export async function listCompanies(
  filters: CompanyListFilters = {}
): Promise<CompanyListItem[]> {
  const params = new URLSearchParams();

  appendQueryParam(params, 'naCarteira', filters.naCarteira);
  appendQueryParam(
    params,
    'pendenciaOperacional',
    filters.pendenciaOperacional
  );
  appendQueryParam(
    params,
    'responsavelInternoId',
    filters.responsavelInternoId
  );
  appendQueryParam(params, 'statusAcesso', filters.statusAcesso);
  appendQueryParam(params, 'statusProcuracao', filters.statusProcuracao);

  const query = params.toString();

  return apiRequest<CompanyListItem[]>(
    query ? `/companies?${query}` : '/companies'
  );
}

export async function listCarteira(
  filters: Omit<CompanyListFilters, 'naCarteira'> = {}
): Promise<CompanyListItem[]> {
  return listCompanies({
    ...filters,
    naCarteira: true
  });
}

export async function getDashboardSummary(): Promise<DashboardSummaryResponse> {
  return apiRequest<DashboardSummaryResponse>('/dashboard/summary');
}

export async function listPendencias(
  filters: PendenciaListFilters = {}
): Promise<PendenciaListItem[]> {
  const params = new URLSearchParams();

  appendPendenciaFilters(params, filters);

  const query = params.toString();

  const pendencias = await apiRequest<PendenciaRecord[]>(
    query ? `/pendencias?${query}` : '/pendencias'
  );

  return normalizePendenciaRecords(pendencias);
}

export async function executeManualScan(
  companyId: string
): Promise<ManualScanExecutionResponse> {
  return apiRequest<ManualScanExecutionResponse>(
    `/companies/${companyId}/scans/manual`,
    {
      method: 'POST'
    }
  );
}

export async function listVarreduras(
  companyId: string,
  filters: RecentScansFilters = {}
): Promise<VarreduraRecord[]> {
  const params = new URLSearchParams();

  appendQueryParam(params, 'take', filters.take);

  const query = params.toString();

  return apiRequest<VarreduraRecord[]>(
    query ? `/companies/${companyId}/scans/recent?${query}` : `/companies/${companyId}/scans/recent`
  );
}

export async function listEventosOperacionais(
  companyId: string,
  filters: RecentEventosFilters = {}
): Promise<EventoOperacionalRecord[]> {
  const params = new URLSearchParams();

  appendQueryParam(params, 'take', filters.take);

  const query = params.toString();

  return apiRequest<EventoOperacionalRecord[]>(
    query
      ? `/companies/${companyId}/events/recent?${query}`
      : `/companies/${companyId}/events/recent`
  );
}

export async function listCompanyPendencias(
  companyId: string,
  filters: RecentPendenciasFilters = {}
): Promise<PendenciaOperacionalRecord[]> {
  const params = new URLSearchParams();

  appendPendenciaFilters(params, filters);

  const query = params.toString();

  const pendencias = await apiRequest<PendenciaRecord[]>(
    query
      ? `/companies/${companyId}/pendencias?${query}`
      : `/companies/${companyId}/pendencias`
  );

  return normalizePendenciaRecords(pendencias);
}

export async function createCompanyPendencia(
  companyId: string,
  payload: CreateCompanyPendenciaInput = {}
): Promise<PendenciaRecord> {
  const pendencia = await apiRequest<PendenciaRecord>(
    `/companies/${companyId}/pendencias`,
    {
      body: payload,
      method: 'POST'
    }
  );

  return normalizePendenciaRecord(pendencia);
}

export async function getPendencia(id: string): Promise<PendenciaRecord> {
  const pendencia = await apiRequest<PendenciaRecord>(`/pendencias/${id}`);
  return normalizePendenciaRecord(pendencia);
}

export async function updatePendencia(
  id: string,
  payload: PendenciaUpdateInput
): Promise<PendenciaRecord> {
  const pendencia = await apiRequest<PendenciaRecord>(`/pendencias/${id}`, {
    body: payload,
    method: 'PATCH'
  });

  return normalizePendenciaRecord(pendencia);
}

export async function listPendenciaLogs(
  id: string,
  filters: { take?: number | undefined } = {}
): Promise<LogExecucaoRecord[]> {
  const params = new URLSearchParams();

  appendQueryParam(params, 'take', filters.take);

  const query = params.toString();

  return apiRequest<LogExecucaoRecord[]>(
    query ? `/pendencias/${id}/logs?${query}` : `/pendencias/${id}/logs`
  );
}

export async function listCompanyLogs(
  companyId: string,
  filters: { take?: number | undefined } = {}
): Promise<LogExecucaoRecord[]> {
  const params = new URLSearchParams();

  appendQueryParam(params, 'take', filters.take);

  const query = params.toString();

  return apiRequest<LogExecucaoRecord[]>(
    query ? `/companies/${companyId}/logs?${query}` : `/companies/${companyId}/logs`
  );
}

export async function getCompanyOperationalHistory(
  companyId: string,
  filters: { take?: number | undefined } = {}
): Promise<CompanyOperationalHistory> {
  const params = new URLSearchParams();

  appendQueryParam(params, 'take', filters.take);

  const query = params.toString();
  const history = await apiRequest<CompanyOperationalHistory>(
    query
      ? `/companies/${companyId}/operational-history?${query}`
      : `/companies/${companyId}/operational-history`
  );

  return {
    ...history,
    pendencias: normalizePendenciaRecords(history.pendencias)
  };
}

export async function registerCompanyCheck(
  companyId: string,
  payload: CompanyOperationalActionInput = {}
): Promise<CompanyOperationalMutationResponse> {
  return apiRequest<CompanyOperationalMutationResponse>(
    `/companies/${companyId}/operational/check`,
    {
      body: payload,
      method: 'POST'
    }
  );
}

export async function regularizeCompanyOperationalIssue(
  companyId: string,
  payload: CompanyOperationalActionInput = {}
): Promise<PendenciaRecord | null> {
  const pendencia = await apiRequest<PendenciaRecord | null>(
    `/companies/${companyId}/operational/regularize`,
    {
      body: payload,
      method: 'POST'
    }
  );

  return pendencia ? normalizePendenciaRecord(pendencia) : null;
}

export async function resolveCompanyPendencia(
  companyId: string,
  pendenciaId: string
): Promise<PendenciaOperacionalRecord> {
  return (await regularizeCompanyOperationalIssue(companyId, {
    pendenciaId
  })) as PendenciaOperacionalRecord;
}

export async function removeCompanyFromWallet(
  companyId: string,
  payload: CompanyOperationalActionInput = {}
): Promise<CompanyOperationalMutationResponse> {
  return apiRequest<CompanyOperationalMutationResponse>(
    `/companies/${companyId}/operational/remove-from-wallet`,
    {
      body: payload,
      method: 'POST'
    }
  );
}

export async function getCompany(id: string): Promise<CompanyDetailItem> {
  return apiRequest<CompanyDetailItem>(`/companies/${id}`);
}

export async function createCompany(
  payload: CompanyCreateInput
): Promise<CompanyDetailItem> {
  return apiRequest<CompanyDetailItem>('/companies', {
    body: payload,
    method: 'POST'
  });
}

export async function updateCompany(
  id: string,
  payload: CompanyUpdateInput
): Promise<CompanyDetailItem> {
  return apiRequest<CompanyDetailItem>(`/companies/${id}`, {
    body: payload,
    method: 'PATCH'
  });
}

export async function listResponsaveis(): Promise<ResponsavelInternoRecord[]> {
  return apiRequest<ResponsavelInternoRecord[]>('/responsaveis');
}

export async function getResponsavel(
  id: string
): Promise<ResponsavelInternoRecord> {
  return apiRequest<ResponsavelInternoRecord>(`/responsaveis/${id}`);
}

export async function createResponsavel(
  payload: ResponsavelInternoCreateInput
): Promise<ResponsavelInternoRecord> {
  return apiRequest<ResponsavelInternoRecord>('/responsaveis', {
    body: payload,
    method: 'POST'
  });
}

export async function updateResponsavel(
  id: string,
  payload: ResponsavelInternoUpdateInput
): Promise<ResponsavelInternoRecord> {
  return apiRequest<ResponsavelInternoRecord>(`/responsaveis/${id}`, {
    body: payload,
    method: 'PATCH'
  });
}
