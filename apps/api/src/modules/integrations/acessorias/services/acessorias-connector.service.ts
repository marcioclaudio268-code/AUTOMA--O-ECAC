import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AcessoriasConnectionProbeResult } from '../acessorias.types';

const DEFAULT_TIMEOUT_MS = 8_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 30_000;

@Injectable()
export class AcessoriasConnectorService {
  constructor(private readonly configService: ConfigService) {}

  async probeConnection(token: string): Promise<AcessoriasConnectionProbeResult> {
    const validationUrl = this.configService
      .get<string>('ACESSORIAS_TEST_CONNECTION_URL')
      ?.trim();

    if (!validationUrl) {
      return {
        message:
          'ACESSORIAS_TEST_CONNECTION_URL nao configurada neste ambiente.',
        success: false
      };
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(validationUrl);
    } catch {
      return {
        message: 'ACESSORIAS_TEST_CONNECTION_URL invalida.',
        success: false
      };
    }

    const controller = new AbortController();
    const timeoutMs = this.normalizeTimeout(
      this.configService.get<string>('ACESSORIAS_TEST_CONNECTION_TIMEOUT_MS')
    );
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(parsedUrl, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`
        },
        method: 'GET',
        signal: controller.signal
      });

      if (!response.ok) {
        return {
          message: `Acessorias respondeu ${response.status} ao validar a conexao.`,
          statusCode: response.status,
          success: false
        };
      }

      return {
        message: 'Conexao com Acessorias validada.',
        statusCode: response.status,
        success: true
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          message: 'Teste de conexao com Acessorias expirou.',
          success: false
        };
      }

      return {
        message: 'Falha ao contatar o endpoint de Acessorias.',
        success: false
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private normalizeTimeout(value: string | undefined): number {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return DEFAULT_TIMEOUT_MS;
    }

    return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, parsed));
  }
}
