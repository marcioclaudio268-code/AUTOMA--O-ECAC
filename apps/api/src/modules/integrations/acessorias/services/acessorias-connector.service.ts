import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  AcessoriasCompaniesFetchPage,
  AcessoriasConnectionProbeResult
} from '../acessorias.types';

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
    const companiesUrl = this.configService
      .get<string>('ACESSORIAS_EMPRESAS_URL')
      ?.trim();

    if (!validationUrl) {
      return await this.tryCompaniesFallbackProbe(
        token,
        companiesUrl,
        'ACESSORIAS_TEST_CONNECTION_URL nao configurada neste ambiente.'
      );
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

    const probe = await this.sendProbeRequest(
      parsedUrl,
      token,
      'validar a conexao'
    );

    if (probe.success || !this.shouldUseCompaniesFallback(probe.statusCode)) {
      return probe;
    }

    return await this.tryCompaniesFallbackProbe(
      token,
      companiesUrl,
      `ACESSORIAS_TEST_CONNECTION_URL respondeu ${probe.statusCode} ao validar a conexao.`
    );
  }

  async fetchCompanies(
    token: string,
    cursor?: string | null
  ): Promise<AcessoriasCompaniesFetchPage> {
    const companiesUrl = this.configService
      .get<string>('ACESSORIAS_EMPRESAS_URL')
      ?.trim();

    if (!companiesUrl) {
      throw new Error(
        'ACESSORIAS_EMPRESAS_URL nao configurada neste ambiente.'
      );
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(companiesUrl);
    } catch {
      throw new Error('ACESSORIAS_EMPRESAS_URL invalida.');
    }

    if (cursor) {
      parsedUrl.searchParams.set('cursor', cursor);
    }

    const controller = new AbortController();
    const timeoutMs = this.normalizeTimeout(
      this.configService.get<string>('ACESSORIAS_EMPRESAS_TIMEOUT_MS')
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
        throw new Error(
          `Acessorias respondeu ${response.status} ao buscar empresas.`
        );
      }

      const payload = this.parseJsonResponse(await response.text());
      return this.normalizeCompaniesPayload(payload);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Busca de empresas Acessorias expirou.');
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error('Falha ao contatar o endpoint de empresas Acessorias.');
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async tryCompaniesFallbackProbe(
    token: string,
    companiesUrl: string | undefined,
    reason: string
  ): Promise<AcessoriasConnectionProbeResult> {
    if (!companiesUrl) {
      return {
        message: reason,
        success: false
      };
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(companiesUrl);
    } catch {
      return {
        message: `${reason} ACESSORIAS_EMPRESAS_URL invalida.`,
        success: false
      };
    }

    const fallbackProbe = await this.sendProbeRequest(
      parsedUrl,
      token,
      'buscar empresas'
    );

    if (fallbackProbe.success) {
      return {
        message: `${reason} Conexao validada via ACESSORIAS_EMPRESAS_URL no ambiente local.`,
        statusCode: fallbackProbe.statusCode,
        success: true
      };
    }

    return {
      message: `${reason} O fallback via ACESSORIAS_EMPRESAS_URL falhou: ${fallbackProbe.message}`,
      statusCode: fallbackProbe.statusCode ?? null,
      success: false
    };
  }

  private async sendProbeRequest(
    url: URL,
    token: string,
    operation: string
  ): Promise<AcessoriasConnectionProbeResult> {
    const controller = new AbortController();
    const timeoutMs = this.normalizeTimeout(
      this.configService.get<string>('ACESSORIAS_TEST_CONNECTION_TIMEOUT_MS')
    );
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`
        },
        method: 'GET',
        signal: controller.signal
      });

      if (!response.ok) {
        return {
          message: `Acessorias respondeu ${response.status} ao ${operation}.`,
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
          message: `Teste de conexao com Acessorias expirou ao ${operation}.`,
          success: false
        };
      }

      return {
        message: `Falha ao contatar o endpoint de Acessorias ao ${operation}.`,
        success: false
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private shouldUseCompaniesFallback(statusCode?: number | null): boolean {
    return statusCode === 404 || statusCode === 405;
  }

  private parseJsonResponse(text: string): unknown {
    if (!text.trim()) {
      return null;
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error('Resposta de empresas Acessorias nao e um JSON valido.');
    }
  }

  private normalizeCompaniesPayload(
    payload: unknown
  ): AcessoriasCompaniesFetchPage {
    if (Array.isArray(payload)) {
      return {
        items: payload.filter(isRecord) as unknown as AcessoriasCompaniesFetchPage['items'],
        nextCursor: null
      };
    }

    if (payload && typeof payload === 'object') {
      const record = payload as Record<string, unknown>;
      const itemsSource =
        record.items ?? record.empresas ?? record.data ?? record.results;
      const items = Array.isArray(itemsSource)
        ? (itemsSource.filter(isRecord) as unknown as AcessoriasCompaniesFetchPage['items'])
        : [];

      return {
        items,
        nextCursor:
          readText(record.nextCursor) ??
          readText(record.next_cursor) ??
          readText(record.cursor) ??
          readText(record.proximaCursor) ??
          readText(record.proximaPagina) ??
          null
      };
    }

    return {
      items: [],
      nextCursor: null
    };
  }

  private normalizeTimeout(value: string | undefined): number {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return DEFAULT_TIMEOUT_MS;
    }

    return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, parsed));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
