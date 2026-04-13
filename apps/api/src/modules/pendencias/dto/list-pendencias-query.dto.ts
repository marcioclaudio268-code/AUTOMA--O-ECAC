import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import {
  PendenciaSortByEnum,
  PrioridadePendenciaEnum,
  SortDirectionEnum,
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

export class ListPendenciasQueryDto {
  @Transform(({ value }) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Transform(({ value }) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

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
  @IsEnum(PrioridadePendenciaEnum)
  criticidade?: (typeof PrioridadePendenciaEnum)[keyof typeof PrioridadePendenciaEnum];

  @Transform(({ value }) => parseOptionalText(value))
  @IsOptional()
  @IsEnum(PendenciaSortByEnum)
  sortBy?: (typeof PendenciaSortByEnum)[keyof typeof PendenciaSortByEnum];

  @Transform(({ value }) => parseOptionalText(value))
  @IsOptional()
  @IsEnum(SortDirectionEnum)
  sortDirection?: (typeof SortDirectionEnum)[keyof typeof SortDirectionEnum];
}
