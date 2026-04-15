import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import {
  PrioridadePendenciaEnum,
  StatusPendenciaEnum,
  TipoPendenciaEnum
} from '../pendencias.types';

function parseOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function parseOptionalNullableText(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return parseOptionalText(value);
}

export class CreatePendenciaDto {
  @Transform(({ value }) => parseOptionalText(value))
  @IsOptional()
  @IsEnum(TipoPendenciaEnum)
  tipo?: (typeof TipoPendenciaEnum)[keyof typeof TipoPendenciaEnum];

  @Transform(({ value }) => parseOptionalText(value))
  @IsOptional()
  @IsEnum(StatusPendenciaEnum)
  status?: (typeof StatusPendenciaEnum)[keyof typeof StatusPendenciaEnum];

  @Transform(({ value }) => parseOptionalText(value))
  @IsOptional()
  @IsEnum(PrioridadePendenciaEnum)
  prioridade?: (typeof PrioridadePendenciaEnum)[keyof typeof PrioridadePendenciaEnum];

  @Transform(({ value }) => parseOptionalText(value))
  @IsOptional()
  @IsString()
  titulo?: string;

  @Transform(({ value }) => parseOptionalText(value))
  @IsOptional()
  @IsString()
  descricao?: string;

  @Transform(({ value }) => parseOptionalText(value))
  @IsOptional()
  @IsString()
  origem?: string;

  @Transform(({ value }) => parseOptionalNullableText(value))
  @IsOptional()
  @IsString()
  responsavelInternoId?: string | null;

  @Transform(({ value }) => parseOptionalNullableText(value))
  @IsOptional()
  @IsString()
  chaveIdempotencia?: string | null;
}
