import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
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

export class ListCompanyPendenciasQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @IsEnum(StatusPendenciaEnum)
  @IsOptional()
  status?: (typeof StatusPendenciaEnum)[keyof typeof StatusPendenciaEnum];

  @IsEnum(PrioridadePendenciaEnum)
  @IsOptional()
  prioridade?: (typeof PrioridadePendenciaEnum)[keyof typeof PrioridadePendenciaEnum];

  @IsEnum(PrioridadePendenciaEnum)
  @IsOptional()
  criticidade?: (typeof PrioridadePendenciaEnum)[keyof typeof PrioridadePendenciaEnum];

  @Transform(({ value }) => parseOptionalText(value))
  @IsOptional()
  @IsString()
  responsavelInternoId?: string;

  @IsEnum(TipoPendenciaEnum)
  @IsOptional()
  tipoPendencia?: (typeof TipoPendenciaEnum)[keyof typeof TipoPendenciaEnum];
}
