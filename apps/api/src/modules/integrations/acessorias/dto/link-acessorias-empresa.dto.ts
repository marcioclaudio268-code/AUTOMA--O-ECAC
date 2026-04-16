import { IsNotEmpty, IsString } from 'class-validator';

export class LinkAcessoriasEmpresaDto {
  @IsString()
  @IsNotEmpty()
  acessoriasEmpresaId!: string;
}
