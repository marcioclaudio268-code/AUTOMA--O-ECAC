import { Injectable } from '@nestjs/common';
import { StatusIntegracaoAcessorias } from '@prisma/client';

import { UpsertAcessoriasConfigDto } from './dto/upsert-acessorias-config.dto';
import { ListAcessoriasJobsQueryDto } from './dto/list-acessorias-jobs-query.dto';
import { AcessoriasConfigService } from './services/acessorias-config.service';
import { AcessoriasEmpresasService } from './services/acessorias-empresas.service';
import { AcessoriasConnectorService } from './services/acessorias-connector.service';
import { AcessoriasJobsService } from './services/acessorias-jobs.service';
import type {
  AcessoriasCompanyLinkInput,
  AcessoriasCompanyLinkView,
  AcessoriasCompanyExecutionResponse,
  AcessoriasCompanySyncResponse,
  AcessoriasConnectionTestResponse,
  AcessoriasConfigView,
  AcessoriasJobView
} from './acessorias.types';

@Injectable()
export class AcessoriasService {
  constructor(
    private readonly configService: AcessoriasConfigService,
    private readonly connectorService: AcessoriasConnectorService,
    private readonly jobsService: AcessoriasJobsService,
    private readonly empresasService: AcessoriasEmpresasService
  ) {}

  getConfig(): Promise<AcessoriasConfigView> {
    return this.configService.getConfig();
  }

  saveConfig(
    dto: UpsertAcessoriasConfigDto
  ): Promise<AcessoriasConfigView> {
    return this.configService.saveConfig(dto);
  }

  listJobs(
    query: ListAcessoriasJobsQueryDto = {}
  ): Promise<AcessoriasJobView[]> {
    return this.jobsService.listRecent(query.take);
  }

  syncCompanies(): Promise<AcessoriasCompanySyncResponse> {
    return this.empresasService.syncCompanies();
  }

  listCompanies(): Promise<AcessoriasCompanyLinkView[]> {
    return this.empresasService.listCompanies();
  }

  listVinculos(): Promise<AcessoriasCompanyLinkView[]> {
    return this.empresasService.listVinculos();
  }

  linkCompany(
    empresaId: string,
    dto: AcessoriasCompanyLinkInput
  ): Promise<AcessoriasCompanyLinkView> {
    return this.empresasService.linkCompany(empresaId, dto);
  }

  unlinkCompany(empresaId: string): Promise<AcessoriasCompanyLinkView> {
    return this.empresasService.unlinkCompany(empresaId);
  }

  executeCompany(
    empresaId: string,
    executadoPorUsuarioInternoId?: string | null
  ): Promise<AcessoriasCompanyExecutionResponse> {
    return this.empresasService.executeCompany(
      empresaId,
      executadoPorUsuarioInternoId
    );
  }

  async testConnection(): Promise<AcessoriasConnectionTestResponse> {
    const job = await this.jobsService.createTestConnectionJob();

    try {
      const token = await this.configService.loadApiToken();

      if (!token) {
        const message =
          'Configuracao Acessorias nao encontrada ou token nao informado.';

        return {
          config: await this.configService.getConfig(),
          job: await this.jobsService.markFailure(job.id, message),
          message,
          success: false
        };
      }

      const probe = await this.connectorService.probeConnection(token);

      if (probe.success) {
        return {
          config: await this.configService.markConnectionStatus(
            StatusIntegracaoAcessorias.ATIVA
          ),
          job: await this.jobsService.markSuccess(job.id),
          message: probe.message,
          success: true
        };
      }

      return {
        config: await this.configService.markConnectionStatus(
          StatusIntegracaoAcessorias.ERRO,
          probe.message
        ),
        job: await this.jobsService.markFailure(job.id, probe.message),
        message: probe.message,
        success: false
      };
    } catch (error) {
      const message = this.normalizeErrorMessage(error);

      return {
        config: await this.configService.markConnectionStatus(
          StatusIntegracaoAcessorias.ERRO,
          message
        ),
        job: await this.jobsService.markFailure(job.id, message),
        message,
        success: false
      };
    }
  }

  private normalizeErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }

    return 'Falha ao testar a conexao com Acessorias.';
  }
}
