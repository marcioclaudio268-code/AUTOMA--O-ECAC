import {
  BadRequestException,
  InternalServerErrorException,
  Injectable
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  StatusIntegracaoAcessorias,
  type IntegracaoAcessoriasConfig as IntegracaoAcessoriasConfigRecord
} from '@prisma/client';

import { PrismaService } from '../../../../prisma/prisma.service';

import { UpsertAcessoriasConfigDto } from '../dto/upsert-acessorias-config.dto';
import type { AcessoriasConfigView } from '../acessorias.types';
import {
  decryptAcessoriasToken,
  encryptAcessoriasToken
} from './acessorias-token-crypto';

const ACESSORIAS_CONFIG_ID = 'acessorias-config';
const TOKEN_MASK = '********';

@Injectable()
export class AcessoriasConfigService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async getConfig(): Promise<AcessoriasConfigView> {
    const record = await this.prisma.integracaoAcessoriasConfig.findUnique({
      where: {
        id: ACESSORIAS_CONFIG_ID
      }
    });

    return record ? this.mapRecord(record) : this.buildDefaultView();
  }

  async saveConfig(
    dto: UpsertAcessoriasConfigDto
  ): Promise<AcessoriasConfigView> {
    const apiToken = this.normalizeToken(dto.apiToken);

    if (!apiToken) {
      throw new BadRequestException('Token Acessorias invalido.');
    }

    const encryptedToken = encryptAcessoriasToken(
      apiToken,
      this.resolveCryptoSecret()
    );

    const record = await this.prisma.integracaoAcessoriasConfig.upsert({
      create: {
        apiTokenCriptografado: encryptedToken,
        id: ACESSORIAS_CONFIG_ID,
        mensagemErroAtual: null,
        status: StatusIntegracaoAcessorias.CONFIGURADA,
        ultimoErroEm: null,
        ultimaSincronizacaoEm: null
      },
      update: {
        apiTokenCriptografado: encryptedToken,
        mensagemErroAtual: null,
        status: StatusIntegracaoAcessorias.CONFIGURADA,
        ultimoErroEm: null
      },
      where: {
        id: ACESSORIAS_CONFIG_ID
      }
    });

    return this.mapRecord(record);
  }

  async loadApiToken(): Promise<string | null> {
    const record = await this.prisma.integracaoAcessoriasConfig.findUnique({
      select: {
        apiTokenCriptografado: true
      },
      where: {
        id: ACESSORIAS_CONFIG_ID
      }
    });

    if (!record) {
      return null;
    }

    try {
      return decryptAcessoriasToken(
        record.apiTokenCriptografado,
        this.resolveCryptoSecret()
      );
    } catch {
      throw new InternalServerErrorException(
        'Nao foi possivel ler o token Acessorias salvo.'
      );
    }
  }

  async markConnectionStatus(
    status: StatusIntegracaoAcessorias,
    errorMessage?: string | null,
    options?: {
      lastSyncAt?: Date | null;
    }
  ): Promise<AcessoriasConfigView> {
    const record = await this.prisma.integracaoAcessoriasConfig.findUnique({
      where: {
        id: ACESSORIAS_CONFIG_ID
      }
    });

    if (!record) {
      return this.buildDefaultView();
    }

    const normalizedErrorMessage = this.normalizeMessage(errorMessage);
    const hasError = status === StatusIntegracaoAcessorias.ERRO;

    const updated = await this.prisma.integracaoAcessoriasConfig.update({
      data: {
        mensagemErroAtual: hasError
          ? normalizedErrorMessage ?? 'Falha na conexao com Acessorias.'
          : null,
        status,
        ultimaSincronizacaoEm:
          options?.lastSyncAt === undefined
            ? record.ultimaSincronizacaoEm
            : options.lastSyncAt,
        ultimoErroEm: hasError ? new Date() : null
      },
      where: {
        id: ACESSORIAS_CONFIG_ID
      }
    });

    return this.mapRecord(updated);
  }

  private buildDefaultView(): AcessoriasConfigView {
    return {
      apiTokenConfigurado: false,
      apiTokenMascarado: null,
      createdAt: null,
      id: ACESSORIAS_CONFIG_ID,
      mensagemErroAtual: null,
      status: StatusIntegracaoAcessorias.NAO_CONFIGURADA,
      ultimaSincronizacaoEm: null,
      ultimoErroEm: null,
      updatedAt: null
    };
  }

  private mapRecord(
    record: IntegracaoAcessoriasConfigRecord
  ): AcessoriasConfigView {
    return {
      apiTokenConfigurado: true,
      apiTokenMascarado: TOKEN_MASK,
      createdAt: record.createdAt.toISOString(),
      id: record.id,
      mensagemErroAtual: record.mensagemErroAtual,
      status: record.status,
      ultimaSincronizacaoEm:
        record.ultimaSincronizacaoEm?.toISOString() ?? null,
      ultimoErroEm: record.ultimoErroEm?.toISOString() ?? null,
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private normalizeMessage(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeToken(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private resolveCryptoSecret(): string {
    const dedicatedSecret = this.configService
      .get<string>('ACESSORIAS_TOKEN_ENCRYPTION_KEY')
      ?.trim();

    if (dedicatedSecret) {
      return dedicatedSecret;
    }

    const jwtSecret = this.configService.get<string>('JWT_SECRET')?.trim();

    if (jwtSecret) {
      return `jwt:${jwtSecret}`;
    }

    throw new InternalServerErrorException(
      'Chave de criptografia Acessorias nao configurada.'
    );
  }
}
