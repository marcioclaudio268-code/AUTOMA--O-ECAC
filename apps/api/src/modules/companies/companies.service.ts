import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  Prisma,
  StatusAcessoEmpresa,
  StatusProcuracaoEmpresa
} from '@prisma/client';

import { isBasicCnpj, normalizeCnpj } from '../../common/utils/cnpj';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { ListCompaniesQueryDto } from './dto/list-companies-query.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

const listInclude = {
  responsavelInterno: {
    select: {
      ativo: true,
      email: true,
      id: true,
      nome: true,
      usuarioInternoId: true
    }
  }
} as const;

const detailInclude = {
  integracoes: {
    orderBy: {
      createdAt: 'desc'
    }
  },
  responsavelInterno: {
    include: {
      usuarioInterno: {
        select: {
          ativo: true,
          email: true,
          id: true,
          nome: true,
          perfil: true
        }
      }
    }
  }
} as const;

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCompanyDto) {
    const cnpj = this.parseAndValidateCnpj(dto.cnpj);
    const responsavelInternoId = this.normalizeResponsavelInternoId(
      dto.responsavelInternoId
    );

    if (responsavelInternoId) {
      await this.assertResponsavelExists(responsavelInternoId);
    }
    await this.assertCnpjAvailable(cnpj);

    const data: Prisma.EmpresaCreateInput = {
      cnpj,
      nomeFantasia: dto.nomeFantasia?.trim() || null,
      naCarteira: dto.naCarteira ?? false,
      pendenciaOperacional: dto.pendenciaOperacional ?? false,
      observacoesOperacionais: dto.observacoesOperacionais?.trim() || null,
      ultimaConferenciaAcessoEm:
        this.normalizeDate(dto.ultimaConferenciaAcessoEm) ?? null,
      ultimaConferenciaOperacionalEm:
        this.normalizeDate(dto.ultimaConferenciaOperacionalEm) ?? null,
      ultimaConferenciaProcuracaoEm:
        this.normalizeDate(dto.ultimaConferenciaProcuracaoEm) ?? null,
      regularizadaEm: this.normalizeDate(dto.regularizadaEm) ?? null,
      razaoSocial: dto.razaoSocial.trim(),
      regimeTributario: dto.regimeTributario,
      statusAcesso:
        dto.statusAcesso ?? StatusAcessoEmpresa.NAO_VERIFICADO,
      statusProcuracao:
        dto.statusProcuracao ?? StatusProcuracaoEmpresa.NAO_VERIFICADA
    };

    if (responsavelInternoId) {
      data.responsavelInterno = {
        connect: {
          id: responsavelInternoId
        }
      };
    }

    return this.prisma.empresa.create({
      data,
      include: detailInclude
    });
  }

  async findAll(query: ListCompaniesQueryDto = {}) {
    const where: Prisma.EmpresaWhereInput = {};

    if (query.naCarteira !== undefined) {
      where.naCarteira = query.naCarteira;
    }

    if (query.pendenciaOperacional !== undefined) {
      where.pendenciaOperacional = query.pendenciaOperacional;
    }

    if (query.responsavelInternoId) {
      where.responsavelInternoId = query.responsavelInternoId;
    }

    if (query.statusAcesso !== undefined) {
      where.statusAcesso = query.statusAcesso;
    }

    if (query.statusProcuracao !== undefined) {
      where.statusProcuracao = query.statusProcuracao;
    }

    return this.prisma.empresa.findMany({
      include: listInclude,
      where,
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  async findOne(id: string) {
    const company = await this.prisma.empresa.findUnique({
      include: detailInclude,
      where: {
        id
      }
    });

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    return company;
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.assertCompanyExists(id);
    const responsavelInternoId = this.normalizeResponsavelInternoId(
      dto.responsavelInternoId
    );

    const data: Prisma.EmpresaUpdateInput = {};

    if (dto.cnpj !== undefined) {
      const cnpj = this.parseAndValidateCnpj(dto.cnpj);
      await this.assertCnpjAvailable(cnpj, id);
      data.cnpj = cnpj;
    }

    if (dto.razaoSocial !== undefined) {
      data.razaoSocial = dto.razaoSocial.trim();
    }

    if (dto.nomeFantasia !== undefined) {
      data.nomeFantasia = dto.nomeFantasia.trim() || null;
    }

    if (dto.regimeTributario !== undefined) {
      data.regimeTributario = dto.regimeTributario;
    }

    if (dto.naCarteira !== undefined) {
      data.naCarteira = dto.naCarteira;
    }

    if (dto.pendenciaOperacional !== undefined) {
      data.pendenciaOperacional = dto.pendenciaOperacional;
    }

    if (dto.ultimaConferenciaOperacionalEm !== undefined) {
      const ultimaConferenciaOperacionalEm = this.normalizeDate(
        dto.ultimaConferenciaOperacionalEm
      );

      if (ultimaConferenciaOperacionalEm !== undefined) {
        data.ultimaConferenciaOperacionalEm = ultimaConferenciaOperacionalEm;
      }
    }

    if (dto.ultimaConferenciaAcessoEm !== undefined) {
      const ultimaConferenciaAcessoEm = this.normalizeDate(
        dto.ultimaConferenciaAcessoEm
      );

      if (ultimaConferenciaAcessoEm !== undefined) {
        data.ultimaConferenciaAcessoEm = ultimaConferenciaAcessoEm;
      }
    }

    if (dto.ultimaConferenciaProcuracaoEm !== undefined) {
      const ultimaConferenciaProcuracaoEm = this.normalizeDate(
        dto.ultimaConferenciaProcuracaoEm
      );

      if (ultimaConferenciaProcuracaoEm !== undefined) {
        data.ultimaConferenciaProcuracaoEm = ultimaConferenciaProcuracaoEm;
      }
    }

    if (dto.regularizadaEm !== undefined) {
      const regularizadaEm = this.normalizeDate(dto.regularizadaEm);

      if (regularizadaEm !== undefined) {
        data.regularizadaEm = regularizadaEm;
      }
    }

    if (dto.responsavelInternoId !== undefined) {
      if (responsavelInternoId) {
        await this.assertResponsavelExists(responsavelInternoId);
        data.responsavelInterno = {
          connect: {
            id: responsavelInternoId
          }
        };
      } else {
        data.responsavelInterno = {
          disconnect: true
        };
      }
    }

    if (dto.statusAcesso !== undefined) {
      data.statusAcesso = dto.statusAcesso;
    }

    if (dto.statusProcuracao !== undefined) {
      data.statusProcuracao = dto.statusProcuracao;
    }

    if (dto.observacoesOperacionais !== undefined) {
      data.observacoesOperacionais = dto.observacoesOperacionais.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Informe ao menos um campo para atualizar.');
    }

    return this.prisma.empresa.update({
      data,
      include: detailInclude,
      where: {
        id
      }
    });
  }

  private parseAndValidateCnpj(value: unknown): string {
    const cnpj = normalizeCnpj(value);

    if (!cnpj || !isBasicCnpj(cnpj)) {
      throw new BadRequestException('CNPJ invalido.');
    }

    return cnpj;
  }

  private normalizeResponsavelInternoId(
    value: string | null | undefined
  ): string | null | undefined {
    if (value === undefined || value === null) {
      return value;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeDate(
    value: string | null | undefined
  ): Date | null | undefined {
    if (value === undefined || value === null) {
      return value;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Data invalida.');
    }

    return date;
  }

  private async assertCompanyExists(id: string): Promise<void> {
    const company = await this.prisma.empresa.findUnique({
      select: {
        id: true
      },
      where: {
        id
      }
    });

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }
  }

  private async assertCnpjAvailable(cnpj: string, excludeId?: string) {
    const duplicate = await this.prisma.empresa.findFirst({
      select: {
        id: true
      },
      where: {
        cnpj,
        ...(excludeId
          ? {
              NOT: {
                id: excludeId
              }
            }
          : {})
      }
    });

    if (duplicate) {
      throw new ConflictException('CNPJ ja cadastrado.');
    }
  }

  private async assertResponsavelExists(id: string) {
    const responsavel = await this.prisma.responsavelInterno.findUnique({
      select: {
        id: true
      },
      where: {
        id
      }
    });

    if (!responsavel) {
      throw new NotFoundException('Responsavel interno nao encontrado.');
    }
  }
}
