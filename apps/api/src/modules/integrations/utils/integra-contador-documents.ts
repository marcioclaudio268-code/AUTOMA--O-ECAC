export type IntegraContadorPessoaTipo = 'CPF' | 'CNPJ';

export type IntegraContadorPessoaTipoCodigo = 1 | 2;

export function normalizeDocumentNumber(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidDocumentNumber(value: string): boolean {
  return /^\d{11}$|^\d{14}$/.test(value);
}

export function resolvePessoaTipoCodigo(
  documentNumber: string,
  explicitType?: IntegraContadorPessoaTipo
): IntegraContadorPessoaTipoCodigo {
  if (explicitType === 'CPF') {
    if (documentNumber.length !== 11) {
      throw new Error(
        'Tipo do documento do CPF nao corresponde aos digitos informados.'
      );
    }

    return 1;
  }

  if (explicitType === 'CNPJ') {
    if (documentNumber.length !== 14) {
      throw new Error(
        'Tipo do documento do CNPJ nao corresponde aos digitos informados.'
      );
    }

    return 2;
  }

  if (documentNumber.length === 11) {
    return 1;
  }

  if (documentNumber.length === 14) {
    return 2;
  }

  throw new Error('Documento deve conter 11 ou 14 digitos.');
}

export function resolvePessoaTipoString(
  documentNumber: string,
  explicitType?: IntegraContadorPessoaTipo
): '1' | '2' {
  return String(
    resolvePessoaTipoCodigo(documentNumber, explicitType)
  ) as '1' | '2';
}
