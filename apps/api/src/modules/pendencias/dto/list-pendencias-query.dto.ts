import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';

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
  @IsIn(['ACESSO', 'OPERACIONAL', 'PROCURACAO'])
  tipoPendencia?: string;

  @Transform(({ value }) => parseOptionalText(value))
  @IsOptional()
  @IsString()
  responsavelInternoId?: string;

  @Transform(({ value }) => parseOptionalText(value))
  @IsOptional()
  @IsString()
  empresaId?: string;
}
