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

export type TipoIntegracao = 'MANUAL' | 'API' | 'RPA' | 'INTEGRA_CONTADOR';

export type StatusIntegracao =
  | 'ATIVA'
  | 'INATIVA'
  | 'ERRO'
  | 'NAO_CONFIGURADA';

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
  ultimaConferenciaOperacionalEm: string | null;
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

export type CompanyIntegrationUpsertInput = {
  mensagemErroAtual?: string | null | undefined;
  observacoes?: string | null | undefined;
  statusIntegracao?: StatusIntegracao | undefined;
  ultimoErroEm?: string | null | undefined;
  ultimoSucessoEm?: string | null | undefined;
};

export type CompanyIntegrationExecutionAttempt = {
  haProcuracaoEncontrada: boolean;
  message: string;
  observacoes?: string | null | undefined;
  quantidadeRegistrosRetornados: number;
  success: boolean;
};

export type CompanyIntegrationExecutionCompanyUpdate = {
  observacoesOperacionais: string | null;
  statusProcuracao: StatusProcuracaoEmpresa;
  ultimaConferenciaOperacionalEm: string | null;
  updatedAt: string;
};

export type CompanyIntegrationExecutionInput = {
  outorgado: string;
  outorgante: string;
  tipoOutorgado?: 'CPF' | 'CNPJ' | undefined;
  tipoOutorgante?: 'CPF' | 'CNPJ' | undefined;
};

export type CompanyIntegrationExecutionResponse = {
  company: CompanyIntegrationExecutionCompanyUpdate | null;
  execution: CompanyIntegrationExecutionAttempt;
  integration: CompanyIntegration;
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
  regularizadaEm?: string | null | undefined;
  ultimaConferenciaOperacionalEm?: string | null | undefined;
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

export type DashboardResponsavelResumo = {
  quantidadeEmpresas: number;
  responsavelInternoEmail: string | null;
  responsavelInternoId: string | null;
  responsavelInternoNome: string;
};

export type DashboardSummary = {
  distribuicaoPorResponsavel: DashboardResponsavelResumo[];
  indicadores: {
    totalEmpresasNaCarteira: number;
    totalEmpresasComAcessoPendenteOuBloqueado: number;
    totalEmpresasComPendenciaOperacional: number;
    totalEmpresasComProcuracaoPendente: number;
  };
};

export type PendenciaTipo = 'ACESSO' | 'OPERACIONAL' | 'PROCURACAO';

export type PendenciaStatusAtual =
  | StatusAcessoEmpresa
  | StatusProcuracaoEmpresa
  | 'PENDENTE';

export type PendenciaListItem = {
  empresaCnpj: string;
  empresaId: string;
  empresaNome: string;
  empresaNomeFantasia: string | null;
  linkTratamento: string;
  motivo: string;
  observacaoOperacional: string | null;
  responsavelInternoId: string | null;
  responsavelInternoNome: string;
  statusAtual: PendenciaStatusAtual;
  tipoPendencia: PendenciaTipo;
  ultimaConferenciaOperacionalEm: string | null;
};

export type PendenciasListFilters = {
  empresaId?: string | undefined;
  responsavelInternoId?: string | undefined;
  tipoPendencia?: PendenciaTipo | undefined;
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
  value: string | boolean | undefined
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

export async function getCompany(id: string): Promise<CompanyDetailItem> {
  return apiRequest<CompanyDetailItem>(`/companies/${id}`);
}

export async function listCompanyIntegrations(
  companyId: string
): Promise<CompanyIntegration[]> {
  return apiRequest<CompanyIntegration[]>(`/companies/${companyId}/integrations`);
}

export async function getCompanyIntegration(
  companyId: string,
  tipoIntegracao: TipoIntegracao
): Promise<CompanyIntegration> {
  return apiRequest<CompanyIntegration>(
    `/companies/${companyId}/integrations/${encodeURIComponent(tipoIntegracao)}`
  );
}

export async function upsertCompanyIntegration(
  companyId: string,
  tipoIntegracao: TipoIntegracao,
  payload: CompanyIntegrationUpsertInput
): Promise<CompanyIntegration> {
  return apiRequest<CompanyIntegration>(
    `/companies/${companyId}/integrations/${encodeURIComponent(tipoIntegracao)}`,
    {
      body: payload,
      method: 'PATCH'
    }
  );
}

export async function executeCompanyIntegration(
  companyId: string,
  tipoIntegracao: TipoIntegracao,
  payload: CompanyIntegrationExecutionInput
): Promise<CompanyIntegrationExecutionResponse> {
  return apiRequest<CompanyIntegrationExecutionResponse>(
    `/companies/${companyId}/integrations/${encodeURIComponent(
      tipoIntegracao
    )}/execute`,
    {
      body: payload,
      method: 'POST'
    }
  );
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

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return apiRequest<DashboardSummary>('/dashboard/summary');
}

export async function listPendencias(
  filters: PendenciasListFilters = {}
): Promise<PendenciaListItem[]> {
  const params = new URLSearchParams();

  appendQueryParam(params, 'empresaId', filters.empresaId);
  appendQueryParam(
    params,
    'responsavelInternoId',
    filters.responsavelInternoId
  );
  appendQueryParam(params, 'tipoPendencia', filters.tipoPendencia);

  const query = params.toString();

  return apiRequest<PendenciaListItem[]>(
    query ? `/pendencias?${query}` : '/pendencias'
  );
}
