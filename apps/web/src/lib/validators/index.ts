type CompanySelection = {
  id: string;
};

type ResponsavelFormInput = {
  email: string;
  nome: string;
  usuarioInternoId: string;
};

type CompanyFormInput = {
  cnpj: string;
  ultimaConferenciaAcessoEm?: string;
  ultimaConferenciaOperacionalEm?: string;
  ultimaConferenciaProcuracaoEm?: string;
  razaoSocial: string;
  responsavelInternoId: string;
};

export function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function isBasicEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

export function isBasicCnpj(value: string): boolean {
  return /^\d{14}$/.test(normalizeDigits(value));
}

export function validateResponsavelForm(
  form: ResponsavelFormInput
): string | null {
  const nome = form.nome.trim();

  if (!nome) {
    return 'Informe o nome do responsavel.';
  }

  const email = form.email.trim();

  if (!email) {
    return 'Informe o email do responsavel.';
  }

  if (!isBasicEmail(email)) {
    return 'Informe um email valido.';
  }

  const usuarioInternoId = form.usuarioInternoId.trim();

  if (!usuarioInternoId) {
    return 'Informe o usuario interno.';
  }

  return null;
}

export function validateCompanyForm(
  form: CompanyFormInput,
  responsaveis: readonly CompanySelection[],
  options: { requireResponsavel?: boolean } = {}
): string | null {
  const cnpj = normalizeDigits(form.cnpj);

  if (!cnpj) {
    return 'Informe o CNPJ da empresa.';
  }

  if (!isBasicCnpj(cnpj)) {
    return 'CNPJ deve conter 14 digitos.';
  }

  const razaoSocial = form.razaoSocial.trim();

  if (!razaoSocial) {
    return 'Informe a razao social da empresa.';
  }

  const responsavelInternoId = form.responsavelInternoId.trim();

  if (options.requireResponsavel && !responsavelInternoId) {
    return 'Selecione um responsavel existente.';
  }

  if (
    responsavelInternoId &&
    !responsaveis.some((responsavel) => responsavel.id === responsavelInternoId)
  ) {
    return 'Selecione um responsavel existente.';
  }

  const ultimaConferenciaAcessoEm =
    form.ultimaConferenciaAcessoEm?.trim();

  if (
    ultimaConferenciaAcessoEm &&
    Number.isNaN(new Date(ultimaConferenciaAcessoEm).getTime())
  ) {
    return 'Informe uma data de conferencia de acesso valida.';
  }

  const ultimaConferenciaOperacionalEm =
    form.ultimaConferenciaOperacionalEm?.trim();

  if (
    ultimaConferenciaOperacionalEm &&
    Number.isNaN(new Date(ultimaConferenciaOperacionalEm).getTime())
  ) {
    return 'Informe uma data de conferencia valida.';
  }

  const ultimaConferenciaProcuracaoEm =
    form.ultimaConferenciaProcuracaoEm?.trim();

  if (
    ultimaConferenciaProcuracaoEm &&
    Number.isNaN(new Date(ultimaConferenciaProcuracaoEm).getTime())
  ) {
    return 'Informe uma data de conferencia de procuracao valida.';
  }

  return null;
}
