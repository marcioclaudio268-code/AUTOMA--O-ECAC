import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  Prisma,
  StatusAcessoEmpresa,
  StatusIntegracao,
  StatusProcuracaoEmpresa,
  TipoIntegracao
} from '@prisma/client';

import { isBasicCnpj, normalizeCnpj } from '../../common/utils/cnpj';
import { PrismaService } from '../../prisma/prisma.service';
import { LogsService } from '../logs/logs.service';
import {
  ResultadoLogExecucaoEnum,
  TipoLogExecucaoEnum
} from '../pendencias/pendencias.types';
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

type CompanyDetailIntegrationRow = {
  createdAt: Date;
  empresaId: string;
  id: string;
  mensagemErroAtual: string | null;
  observacoes: string | null;
  statusIntegracao: string;
  tipoIntegracao: string;
  updatedAt: Date;
  ultimoErroEm: Date | null;
  ultimoSucessoEm: Date | null;
};

type CompanyDetailIntegration = Omit<
  CompanyDetailIntegrationRow,
  'statusIntegracao' | 'tipoIntegracao'
> & {
  statusIntegracao: StatusIntegracao;
  tipoIntegracao: TipoIntegracao;
};

type CompanyDetail = Prisma.EmpresaGetPayload<{
  include: typeof detailInclude;
}> & {
  integracoes: CompanyDetailIntegration[];
};

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logsService: LogsService
  ) {}

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

    const company = await this.prisma.empresa.create({
      data,
      include: detailInclude
    });

    return {
      ...company,
      integracoes: await this.loadCompanyIntegracoes(company.id)
    };
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
    const company = await this.loadCompanyDetail(id);

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    return company;
  }

  async update(
    id: string,
    dto: UpdateCompanyDto,
    executadoPorUsuarioInternoId?: string | null
  ) {
    const company = await this.prisma.$transaction(async (client) => {
      const currentCompany = await client.empresa.findUnique({
        include: detailInclude,
        where: {
          id
        }
      });

      if (!currentCompany) {
        throw new NotFoundException('Empresa nao encontrada.');
      }

      const hasIncomingField = [
        dto.cnpj,
        dto.naCarteira,
        dto.nomeFantasia,
        dto.observacoesOperacionais,
        dto.pendenciaOperacional,
        dto.razaoSocial,
        dto.regimeTributario,
        dto.responsavelInternoId,
        dto.statusAcesso,
        dto.statusProcuracao,
        dto.ultimaConferenciaAcessoEm,
        dto.ultimaConferenciaOperacionalEm,
        dto.ultimaConferenciaProcuracaoEm,
        dto.regularizadaEm
      ].some((value) => value !== undefined);

      const data: Prisma.EmpresaUpdateInput = {};
      const auditDetails: string[] = [];
      const now = new Date();

      if (dto.cnpj !== undefined) {
        const cnpj = this.parseAndValidateCnpj(dto.cnpj);

        if (cnpj !== currentCompany.cnpj) {
          await this.assertCnpjAvailableInTransaction(client, cnpj, id);
          data.cnpj = cnpj;
        }
      }

      if (dto.naCarteira !== undefined && dto.naCarteira !== currentCompany.naCarteira) {
        data.naCarteira = dto.naCarteira;
        auditDetails.push(
          `Na carteira alterado de ${formatBooleanAuditValue(
            currentCompany.naCarteira
          )} para ${formatBooleanAuditValue(dto.naCarteira)}.`
        );
      }

      if (
        dto.pendenciaOperacional !== undefined &&
        dto.pendenciaOperacional !== currentCompany.pendenciaOperacional
      ) {
        data.pendenciaOperacional = dto.pendenciaOperacional;
        auditDetails.push(
          `Pendencia operacional alterada de ${formatBooleanAuditValue(
            currentCompany.pendenciaOperacional
          )} para ${formatBooleanAuditValue(dto.pendenciaOperacional)}.`
        );
      }

      if (dto.ultimaConferenciaOperacionalEm !== undefined) {
        const ultimaConferenciaOperacionalEm = this.normalizeDate(
          dto.ultimaConferenciaOperacionalEm
        );

        if (
          ultimaConferenciaOperacionalEm !== undefined &&
          !areSameDate(
            currentCompany.ultimaConferenciaOperacionalEm,
            ultimaConferenciaOperacionalEm
          )
        ) {
          data.ultimaConferenciaOperacionalEm = ultimaConferenciaOperacionalEm;
          auditDetails.push(
            `Ultima conferencia operacional alterada de ${formatDateAuditValue(
              currentCompany.ultimaConferenciaOperacionalEm
            )} para ${formatDateAuditValue(ultimaConferenciaOperacionalEm)}.`
          );
        }
      }

      if (dto.ultimaConferenciaAcessoEm !== undefined) {
        const ultimaConferenciaAcessoEm = this.normalizeDate(
          dto.ultimaConferenciaAcessoEm
        );

        if (
          ultimaConferenciaAcessoEm !== undefined &&
          !areSameDate(
            currentCompany.ultimaConferenciaAcessoEm,
            ultimaConferenciaAcessoEm
          )
        ) {
          data.ultimaConferenciaAcessoEm = ultimaConferenciaAcessoEm;
          auditDetails.push(
            `Ultima conferencia de acesso alterada de ${formatDateAuditValue(
              currentCompany.ultimaConferenciaAcessoEm
            )} para ${formatDateAuditValue(ultimaConferenciaAcessoEm)}.`
          );
        }
      }

      if (dto.ultimaConferenciaProcuracaoEm !== undefined) {
        const ultimaConferenciaProcuracaoEm = this.normalizeDate(
          dto.ultimaConferenciaProcuracaoEm
        );

        if (
          ultimaConferenciaProcuracaoEm !== undefined &&
          !areSameDate(
            currentCompany.ultimaConferenciaProcuracaoEm,
            ultimaConferenciaProcuracaoEm
          )
        ) {
          data.ultimaConferenciaProcuracaoEm = ultimaConferenciaProcuracaoEm;
          auditDetails.push(
            `Ultima conferencia de procuracao alterada de ${formatDateAuditValue(
              currentCompany.ultimaConferenciaProcuracaoEm
            )} para ${formatDateAuditValue(ultimaConferenciaProcuracaoEm)}.`
          );
        }
      }

      if (dto.regularizadaEm !== undefined) {
        const regularizadaEm = this.normalizeDate(dto.regularizadaEm);

        if (
          regularizadaEm !== undefined &&
          !areSameDate(currentCompany.regularizadaEm, regularizadaEm)
        ) {
          data.regularizadaEm = regularizadaEm;
          auditDetails.push(
            `Regularizada em alterada de ${formatDateAuditValue(
              currentCompany.regularizadaEm
            )} para ${formatDateAuditValue(regularizadaEm)}.`
          );
        }
      }

      if (dto.responsavelInternoId !== undefined) {
        const responsavelInternoId = this.normalizeResponsavelInternoId(
          dto.responsavelInternoId
        );

        if (responsavelInternoId !== currentCompany.responsavelInternoId) {
          if (responsavelInternoId) {
            const responsavelNome = await this.loadResponsavelNome(
              client,
              responsavelInternoId
            );
            data.responsavelInterno = {
              connect: {
                id: responsavelInternoId
              }
            };
            auditDetails.push(
              `Responsavel interno alterado de ${formatNullableAuditValue(
                currentCompany.responsavelInterno?.nome,
                'Sem responsavel'
              )} para ${responsavelNome}.`
            );
          } else {
            data.responsavelInterno = {
              disconnect: true
            };
            auditDetails.push(
              `Responsavel interno alterado de ${formatNullableAuditValue(
                currentCompany.responsavelInterno?.nome,
                'Sem responsavel'
              )} para Sem responsavel.`
            );
          }
        }
      }

      if (
        dto.statusAcesso !== undefined &&
        dto.statusAcesso !== currentCompany.statusAcesso
      ) {
        data.statusAcesso = dto.statusAcesso;
        auditDetails.push(
          `Status de acesso alterado de ${currentCompany.statusAcesso} para ${dto.statusAcesso}.`
        );
      }

      if (
        dto.statusProcuracao !== undefined &&
        dto.statusProcuracao !== currentCompany.statusProcuracao
      ) {
        data.statusProcuracao = dto.statusProcuracao;
        auditDetails.push(
          `Status de procuracao alterado de ${currentCompany.statusProcuracao} para ${dto.statusProcuracao}.`
        );
      }

      if (dto.observacoesOperacionais !== undefined) {
        const observacoesOperacionais =
          dto.observacoesOperacionais.trim() || null;

        if (observacoesOperacionais !== currentCompany.observacoesOperacionais) {
          data.observacoesOperacionais = observacoesOperacionais;
          auditDetails.push('Observacoes operacionais atualizadas.');
        }
      }

      if (dto.razaoSocial !== undefined) {
        const razaoSocial = dto.razaoSocial.trim();

        if (razaoSocial !== currentCompany.razaoSocial) {
          data.razaoSocial = razaoSocial;
          auditDetails.push(
            `Razao social alterada de ${currentCompany.razaoSocial} para ${razaoSocial}.`
          );
        }
      }

      if (dto.nomeFantasia !== undefined) {
        const nomeFantasia = dto.nomeFantasia.trim() || null;

        if (nomeFantasia !== currentCompany.nomeFantasia) {
          data.nomeFantasia = nomeFantasia;
          auditDetails.push(
            `Nome fantasia alterado de ${formatNullableAuditValue(
              currentCompany.nomeFantasia,
              'Sem nome fantasia'
            )} para ${formatNullableAuditValue(
              nomeFantasia,
              'Sem nome fantasia'
            )}.`
          );
        }
      }

      if (
        dto.regimeTributario !== undefined &&
        dto.regimeTributario !== currentCompany.regimeTributario
      ) {
        data.regimeTributario = dto.regimeTributario;
        auditDetails.push(
          `Regime tributario alterado de ${currentCompany.regimeTributario} para ${dto.regimeTributario}.`
        );
      }

      if (!hasIncomingField) {
        throw new BadRequestException('Informe ao menos um campo para atualizar.');
      }

      if (Object.keys(data).length === 0) {
        return currentCompany;
      }

      const updated = await client.empresa.update({
        data,
        include: detailInclude,
        where: {
          id
        }
      });

      if (auditDetails.length > 0) {
        await this.logsService.recordExecution(client, {
          detalhes: auditDetails.join('\n'),
          empresaId: id,
          executadoEm: now,
          executadoPorUsuarioInternoId,
          resultado: ResultadoLogExecucaoEnum.SUCESSO,
          resumo: 'Edicao manual da empresa registrada.',
          tipo: TipoLogExecucaoEnum.EDICAO_MANUAL_EMPRESA
        });
      }

      return updated;
    });

    return {
      ...company,
      integracoes: await this.loadCompanyIntegracoes(company.id)
    };
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

  private async loadCompanyDetail(id: string): Promise<CompanyDetail | null> {
    const company = await this.prisma.empresa.findUnique({
      include: detailInclude,
      where: {
        id
      }
    });

    if (!company) {
      return null;
    }

    return {
      ...company,
      integracoes: await this.loadCompanyIntegracoes(id)
    };
  }

  private async loadCompanyIntegracoes(
    empresaId: string
  ): Promise<CompanyDetailIntegration[]> {
    // Read integrations as text so legacy enum labels from older rows do not
    // break the company detail payload.
    const integracoes = await this.prisma.$queryRaw<
      CompanyDetailIntegrationRow[]
    >(Prisma.sql`
      SELECT
        "createdAt",
        "empresaId",
        "id",
        "mensagemErroAtual",
        "observacoes",
        "statusIntegracao"::text AS "statusIntegracao",
        "tipoIntegracao"::text AS "tipoIntegracao",
        "updatedAt",
        "ultimoErroEm",
        "ultimoSucessoEm"
      FROM "IntegracaoEmpresa"
      WHERE "empresaId" = ${empresaId}
      ORDER BY "createdAt" DESC
    `);

    return integracoes.map((integracao) => ({
      ...integracao,
      statusIntegracao: this.normalizeStatusIntegracao(
        integracao.statusIntegracao
      ),
      tipoIntegracao: this.normalizeTipoIntegracao(integracao.tipoIntegracao)
    }));
  }

  private normalizeStatusIntegracao(value: string): StatusIntegracao {
    return this.normalizeEnumValue(
      StatusIntegracao,
      value,
      StatusIntegracao.NAO_CONFIGURADA
    );
  }

  private normalizeTipoIntegracao(value: string): TipoIntegracao {
    return this.normalizeEnumValue(
      TipoIntegracao,
      value,
      TipoIntegracao.MANUAL
    );
  }

  private normalizeEnumValue<T extends Record<string, string>>(
    enumObject: T,
    value: string,
    fallback: T[keyof T]
  ): T[keyof T] {
    return Object.values(enumObject).includes(value as T[keyof T])
      ? (value as T[keyof T])
      : fallback;
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

  private async assertCnpjAvailableInTransaction(
    client: Prisma.TransactionClient,
    cnpj: string,
    excludeId?: string
  ) {
    const duplicate = await client.empresa.findFirst({
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

  private async loadResponsavelNome(
    client: Prisma.TransactionClient,
    id: string
  ): Promise<string> {
    const responsavel = await client.responsavelInterno.findUnique({
      select: {
        nome: true
      },
      where: {
        id
      }
    });

    if (!responsavel) {
      throw new NotFoundException('Responsavel interno nao encontrado.');
    }

    return responsavel.nome.trim() || 'Sem responsavel';
  }
}

function areSameDate(
  left: Date | null | undefined,
  right: Date | null | undefined
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }

  if (left === null || right === null) {
    return left === right;
  }

  return left.getTime() === right.getTime();
}

function formatBooleanAuditValue(value: boolean): string {
  return value ? 'sim' : 'nao';
}

function formatDateAuditValue(value: Date | null | undefined): string {
  return value ? value.toISOString() : 'sem registro';
}

function formatNullableAuditValue(
  value: string | null | undefined,
  fallback: string
): string {
  const normalized = value?.trim();

  return normalized && normalized.length > 0 ? normalized : fallback;
}
