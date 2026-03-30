import { Transform } from 'class-transformer';
import { IsIn, IsOptional, Matches } from 'class-validator';

import type { IntegraContadorPessoaTipo } from '../utils/integra-contador-documents';

function normalizeRequiredDocumentNumber(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\D/g, '');
}

function normalizeOptionalPersonType(
  value: unknown
): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : undefined;
}

export class ExecuteCompanyIntegrationDto {
  @Transform(({ value }) => normalizeRequiredDocumentNumber(value))
  @Matches(/^(\d{11}|\d{14})$/, {
    message: 'outorgante invalido. Informe 11 ou 14 digitos.'
  })
  outorgante!: string;

  @Transform(({ value }) => normalizeOptionalPersonType(value))
  @IsOptional()
  @IsIn(['CPF', 'CNPJ'], {
    message: 'tipoOutorgante invalido.'
  })
  tipoOutorgante?: IntegraContadorPessoaTipo;

  @Transform(({ value }) => normalizeRequiredDocumentNumber(value))
  @Matches(/^(\d{11}|\d{14})$/, {
    message: 'outorgado invalido. Informe 11 ou 14 digitos.'
  })
  outorgado!: string;

  @Transform(({ value }) => normalizeOptionalPersonType(value))
  @IsOptional()
  @IsIn(['CPF', 'CNPJ'], {
    message: 'tipoOutorgado invalido.'
  })
  tipoOutorgado?: IntegraContadorPessoaTipo;
}
