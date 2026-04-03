import { Injectable } from '@nestjs/common';
import { Buffer } from 'node:buffer';

import { IntegraContadorConfig } from '../config/integra-contador.config';
import {
  IntegraContadorHttpError,
  IntegraContadorHttpService
} from './integra-contador-http.service';

export type IntegraContadorTokens = {
  accessToken: string;
  jwtToken: string;
};

function extractString(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = (value as Record<string, unknown>)[key];

  if (typeof candidate !== 'string') {
    return null;
  }

  const normalized = candidate.trim();
  return normalized.length > 0 ? normalized : null;
}

@Injectable()
export class IntegraContadorAuthService {
  constructor(private readonly httpService: IntegraContadorHttpService) {}

  async authenticate(
    config: IntegraContadorConfig
  ): Promise<IntegraContadorTokens> {
    const basicToken = Buffer.from(
      `${config.consumerKey}:${config.consumerSecret}`,
      'utf8'
    ).toString('base64');

    const response = await this.httpService.request(config, {
      body: 'grant_type=client_credentials',
      headers: {
        Authorization: `Basic ${basicToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Role-Type': 'TERCEIROS'
      },
      method: 'POST',
      url: config.authUrl
    });

    const accessToken = extractString(response.body, 'access_token');
    const jwtToken = extractString(response.body, 'jwt_token');

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new IntegraContadorHttpError(
        'Falha na autenticacao do Integra Contador.',
        'authenticate',
        response.statusCode,
        response.body,
        response.rawBody
      );
    }

    if (!accessToken || !jwtToken) {
      throw new Error('Resposta de autenticacao do Integra Contador invalida.');
    }

    return {
      accessToken,
      jwtToken
    };
  }
}
