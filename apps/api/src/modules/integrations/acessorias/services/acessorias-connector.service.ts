import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  AcessoriasCompaniesFetchPage,
  AcessoriasConnectionProbeResult,
  AcessoriasDividaAtivaFetchResult,
  AcessoriasParcelamentosFetchResult
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

  async fetchParcelamentos(
    token: string,
    input: {
      acessoriasEmpresaId: string;
      cnpj: string;
    }
  ): Promise<AcessoriasParcelamentosFetchResult> {
    const parcelamentosUrl = this.configService
      .get<string>('ACESSORIAS_PARCELAMENTOS_URL')
      ?.trim();

    if (!parcelamentosUrl) {
      throw new Error(
        'ACESSORIAS_PARCELAMENTOS_URL nao configurada neste ambiente.'
      );
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(parcelamentosUrl);
    } catch {
      throw new Error('ACESSORIAS_PARCELAMENTOS_URL invalida.');
    }

    parsedUrl.searchParams.set('acessoriasEmpresaId', input.acessoriasEmpresaId);
    parsedUrl.searchParams.set('empresaId', input.acessoriasEmpresaId);
    parsedUrl.searchParams.set('cnpj', input.cnpj);

    const controller = new AbortController();
    const timeoutMs = this.normalizeTimeout(
      this.configService.get<string>('ACESSORIAS_PARCELAMENTOS_TIMEOUT_MS')
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
          `Acessorias respondeu ${response.status} ao buscar parcelamentos.`
        );
      }

      const payload = this.parseJsonResponse(await response.text());
      return this.normalizeParcelamentosPayload(payload);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Busca de parcelamentos Acessorias expirou.');
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error('Falha ao contatar o endpoint de parcelamentos Acessorias.');
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async fetchDividaAtiva(
    token: string,
    input: {
      acessoriasEmpresaId: string;
      cnpj: string;
    }
  ): Promise<AcessoriasDividaAtivaFetchResult> {
    const dividaAtivaUrl = this.configService
      .get<string>('ACESSORIAS_DIVIDA_ATIVA_URL')
      ?.trim();

    if (!dividaAtivaUrl) {
      throw new Error(
        'ACESSORIAS_DIVIDA_ATIVA_URL nao configurada neste ambiente.'
      );
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(dividaAtivaUrl);
    } catch {
      throw new Error('ACESSORIAS_DIVIDA_ATIVA_URL invalida.');
    }

    parsedUrl.searchParams.set('acessoriasEmpresaId', input.acessoriasEmpresaId);
    parsedUrl.searchParams.set('empresaId', input.acessoriasEmpresaId);
    parsedUrl.searchParams.set('cnpj', input.cnpj);

    const controller = new AbortController();
    const timeoutMs = this.normalizeTimeout(
      this.configService.get<string>('ACESSORIAS_DIVIDA_ATIVA_TIMEOUT_MS')
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
          `Acessorias respondeu ${response.status} ao buscar divida ativa.`
        );
      }

      const payload = this.parseJsonResponse(await response.text());
      return this.normalizeDividaAtivaPayload(payload);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Busca de divida ativa Acessorias expirou.');
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error(
        'Falha ao contatar o endpoint de divida ativa Acessorias.'
      );
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

  private normalizeParcelamentosPayload(
    payload: unknown
  ): AcessoriasParcelamentosFetchResult {
    if (Array.isArray(payload)) {
      return {
        items: payload.filter(isRecord) as AcessoriasParcelamentosFetchResult['items']
      };
    }

    if (payload && typeof payload === 'object') {
      const record = payload as Record<string, unknown>;
      const itemsSource =
        record.items ??
        record.parcelamentos ??
        record.data ??
        record.results;

      if (Array.isArray(itemsSource)) {
        return {
          items: itemsSource.filter(isRecord) as AcessoriasParcelamentosFetchResult['items']
        };
      }

      const total = readInteger(
        record.totalParcelamentos ?? record.total ?? record.count
      );

      if (total === 0) {
        return {
          items: []
        };
      }
    }

    throw new Error(
      'Resposta de parcelamentos Acessorias sem lista reconhecivel.'
    );
  }

  private normalizeDividaAtivaPayload(
    payload: unknown
  ): AcessoriasDividaAtivaFetchResult {
    if (Array.isArray(payload)) {
      return {
        items: payload.filter(isRecord) as AcessoriasDividaAtivaFetchResult['items']
      };
    }

    if (payload && typeof payload === 'object') {
      const record = payload as Record<string, unknown>;
      const itemsSource =
        record.items ?? record.dividasAtivas ?? record.dividas ?? record.data ?? record.results;

      if (Array.isArray(itemsSource)) {
        return {
          items: itemsSource.filter(isRecord) as AcessoriasDividaAtivaFetchResult['items']
        };
      }

      const total = readInteger(record.totalDividas ?? record.total ?? record.count);

      if (total === 0) {
        return {
          items: []
        };
      }
    }

    throw new Error(
      'Resposta de divida ativa Acessorias sem lista reconhecivel.'
    );
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

function readInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (!/^-?\d+$/.test(normalized)) {
    return null;
  }

  return Number.parseInt(normalized, 10);
}
