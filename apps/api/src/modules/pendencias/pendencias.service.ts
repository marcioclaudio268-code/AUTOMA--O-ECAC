import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  isNonRegularAccessStatus,
  isNonRegularProcuracaoStatus
} from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { ListPendenciasQueryDto } from './dto/list-pendencias-query.dto';
import { PendenciaListItem, TipoPendencia } from './pendencias.types';

const SEM_RESPONSAVEL_FILTER = '__sem_responsavel__';

const tipoPendenciaOrder: Record<TipoPendencia, number> = {
  ACESSO: 0,
  OPERACIONAL: 1,
  PROCURACAO: 2
};

const pendenciaSelect = {
  cnpj: true,
  id: true,
  nomeFantasia: true,
  observacoesOperacionais: true,
  pendenciaOperacional: true,
  razaoSocial: true,
  responsavelInterno: {
    select: {
      email: true,
      id: true,
      nome: true
    }
  },
  responsavelInternoId: true,
  statusAcesso: true,
  statusProcuracao: true,
  ultimaConferenciaOperacionalEm: true
} as const;

type CompanyPendenciaSource = Prisma.EmpresaGetPayload<{
  select: typeof pendenciaSelect;
}>;

@Injectable()
export class PendenciasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: ListPendenciasQueryDto = {}
  ): Promise<PendenciaListItem[]> {
    const where: Prisma.EmpresaWhereInput = {
      naCarteira: true
    };

    if (query.empresaId) {
      where.id = query.empresaId;
    }

    if (query.responsavelInternoId) {
      where.responsavelInternoId =
        query.responsavelInternoId === SEM_RESPONSAVEL_FILTER
          ? null
          : query.responsavelInternoId;
    }

    const companies = await this.prisma.empresa.findMany({
      orderBy: [
        {
          razaoSocial: 'asc'
        },
        {
          createdAt: 'asc'
        }
      ],
      select: pendenciaSelect,
      where
    });

    const pendencias = companies.flatMap((company) =>
      this.buildPendencias(company)
    );

    return pendencias.sort((left, right) => this.compareItems(left, right));
  }

  private buildPendencias(company: CompanyPendenciaSource): PendenciaListItem[] {
    const pendencias: PendenciaListItem[] = [];

    if (isNonRegularAccessStatus(company.statusAcesso)) {
      pendencias.push(this.buildItem(company, 'ACESSO'));
    }

    if (isNonRegularProcuracaoStatus(company.statusProcuracao)) {
      pendencias.push(this.buildItem(company, 'PROCURACAO'));
    }

    if (company.pendenciaOperacional) {
      pendencias.push(this.buildItem(company, 'OPERACIONAL'));
    }

    return pendencias;
  }

  private buildItem(
    company: CompanyPendenciaSource,
    tipoPendencia: TipoPendencia
  ): PendenciaListItem {
    const responsavelInternoNome =
      company.responsavelInterno?.nome.trim() || 'Sem responsavel';

    return {
      empresaCnpj: company.cnpj,
      empresaId: company.id,
      empresaNome: company.razaoSocial,
      empresaNomeFantasia: this.normalizeText(company.nomeFantasia),
      linkTratamento: `/empresas/${company.id}`,
      motivo: this.buildMotivo(company, tipoPendencia),
      observacaoOperacional: this.normalizeText(company.observacoesOperacionais),
      responsavelInternoId: company.responsavelInternoId,
      responsavelInternoNome,
      statusAtual: this.resolveStatusAtual(company, tipoPendencia),
      tipoPendencia,
      ultimaConferenciaOperacionalEm:
        company.ultimaConferenciaOperacionalEm?.toISOString() ?? null
    };
  }

  private buildMotivo(
    company: CompanyPendenciaSource,
    tipoPendencia: TipoPendencia
  ): string {
    switch (tipoPendencia) {
      case 'ACESSO':
        return `Acesso em estado ${this.formatAccessStatus(company.statusAcesso)}.`;
      case 'PROCURACAO':
        return `Procuracao em estado ${this.formatProcuracaoStatus(
          company.statusProcuracao
        )}.`;
      case 'OPERACIONAL':
        return 'Pendencia operacional registrada na carteira.';
    }
  }

  private compareItems(
    left: PendenciaListItem,
    right: PendenciaListItem
  ): number {
    if (left.empresaNome !== right.empresaNome) {
      return left.empresaNome.localeCompare(right.empresaNome, 'pt-BR', {
        sensitivity: 'base'
      });
    }

    if (left.tipoPendencia !== right.tipoPendencia) {
      return (
        tipoPendenciaOrder[left.tipoPendencia] -
        tipoPendenciaOrder[right.tipoPendencia]
      );
    }

    return left.motivo.localeCompare(right.motivo, 'pt-BR', {
      sensitivity: 'base'
    });
  }

  private normalizeText(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private formatAccessStatus(
    status: CompanyPendenciaSource['statusAcesso']
  ): string {
    switch (status) {
      case 'BLOQUEADO':
        return 'Bloqueado';
      case 'DISPONIVEL':
        return 'Disponivel';
      case 'INDISPONIVEL':
        return 'Indisponivel';
      case 'NAO_VERIFICADO':
        return 'Nao verificado';
    }
  }

  private formatProcuracaoStatus(
    status: CompanyPendenciaSource['statusProcuracao']
  ): string {
    switch (status) {
      case 'INVALIDA':
        return 'Invalida';
      case 'NAO_VERIFICADA':
        return 'Nao verificada';
      case 'PENDENTE':
        return 'Pendente';
      case 'VALIDA':
        return 'Valida';
    }
  }

  private resolveStatusAtual(
    company: CompanyPendenciaSource,
    tipoPendencia: TipoPendencia
  ): PendenciaListItem['statusAtual'] {
    if (tipoPendencia === 'ACESSO') {
      return company.statusAcesso;
    }

    if (tipoPendencia === 'PROCURACAO') {
      return company.statusProcuracao;
    }

    return 'PENDENTE';
  }
}
