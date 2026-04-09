import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  CriticidadePendenciaOperacional,
  StatusPendenciaOperacional
} from '@prisma/client';

export class ListCompanyPendenciasQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  take?: number;

  @IsEnum(StatusPendenciaOperacional)
  @IsOptional()
  status?: StatusPendenciaOperacional;

  @IsEnum(CriticidadePendenciaOperacional)
  @IsOptional()
  criticidade?: CriticidadePendenciaOperacional;
}
