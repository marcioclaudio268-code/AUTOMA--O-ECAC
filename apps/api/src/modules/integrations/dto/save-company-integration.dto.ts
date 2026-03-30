import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { StatusIntegracao } from '@prisma/client';

function normalizeOptionalText(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== 'string') {
    return value as string;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== 'string') {
    return value as string;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export class SaveCompanyIntegrationDto {
  @IsOptional()
  @IsEnum(StatusIntegracao, {
    message: 'statusIntegracao invalido.'
  })
  statusIntegracao?: StatusIntegracao;

  @Transform(({ value }) => normalizeOptionalDate(value))
  @IsOptional()
  @IsDateString({}, {
    message: 'ultimoSucessoEm invalido.'
  })
  ultimoSucessoEm?: string | null;

  @Transform(({ value }) => normalizeOptionalDate(value))
  @IsOptional()
  @IsDateString({}, {
    message: 'ultimoErroEm invalido.'
  })
  ultimoErroEm?: string | null;

  @Transform(({ value }) => normalizeOptionalText(value))
  @IsOptional()
  @IsString()
  mensagemErroAtual?: string | null;

  @Transform(({ value }) => normalizeOptionalText(value))
  @IsOptional()
  @IsString()
  observacoes?: string | null;
}
