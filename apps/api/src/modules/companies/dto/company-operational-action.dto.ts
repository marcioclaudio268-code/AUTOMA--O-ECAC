import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

function parseOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export class CompanyOperationalActionDto {
  @Transform(({ value }) => parseOptionalText(value))
  @IsOptional()
  @IsString()
  pendenciaId?: string;

  @Transform(({ value }) => parseOptionalText(value))
  @IsOptional()
  @IsString()
  chaveIdempotencia?: string;
}
