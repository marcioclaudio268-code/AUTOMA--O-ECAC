import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { TipoPendenciaEnum } from '../pendencias.types';

function parseOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export class ListPendenciasQueryDto {
  @Transform(({ value }) => parseOptionalText(value))
  @IsOptional()
  @IsString()
  empresaId?: string;

  @Transform(({ value }) => parseOptionalText(value))
  @IsOptional()
  @IsString()
  responsavelInternoId?: string;

  @Transform(({ value }) => parseOptionalText(value))
  @IsOptional()
  @IsEnum(TipoPendenciaEnum)
  tipoPendencia?: (typeof TipoPendenciaEnum)[keyof typeof TipoPendenciaEnum];
}
