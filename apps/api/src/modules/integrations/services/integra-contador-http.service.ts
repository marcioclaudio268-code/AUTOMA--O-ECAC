import { Injectable } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

import { IntegraContadorConfig } from '../config/integra-contador.config';

export type IntegraContadorHttpResponse = {
  body: unknown;
  headers: IncomingHttpHeaders;
  rawBody: string;
  statusCode: number;
};

export class IntegraContadorHttpError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly statusCode: number,
    public readonly body: unknown,
    public readonly rawBody: string
  ) {
    super(message);
    this.name = 'IntegraContadorHttpError';
  }
}

type IntegraContadorRequestOptions = {
  body?: string;
  headers?: Record<string, string>;
  method: 'POST';
  url: string;
};

function parseBody(rawBody: string): unknown {
  if (!rawBody.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return rawBody;
  }
}

@Injectable()
export class IntegraContadorHttpService {
  request(
    config: IntegraContadorConfig,
    options: IntegraContadorRequestOptions
  ): Promise<IntegraContadorHttpResponse> {
    const requestUrl = new URL(options.url);
    const bodyBuffer = options.body
      ? Buffer.from(options.body, 'utf8')
      : undefined;

    const agent = new https.Agent({
      passphrase: config.certPassword,
      pfx: config.certPfx,
      rejectUnauthorized: true
    });

    return new Promise<IntegraContadorHttpResponse>((resolve, reject) => {
      const request = https.request(
        requestUrl,
        {
          agent,
          headers: {
            Accept: 'application/json',
            ...(options.headers ?? {}),
            ...(bodyBuffer
              ? {
                  'Content-Length': String(bodyBuffer.length)
                }
              : {})
          },
          method: options.method
        },
        (response) => {
          const chunks: Buffer[] = [];

          response.on('data', (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });

          response.on('end', () => {
            const rawBody = Buffer.concat(chunks).toString('utf8');
            resolve({
              body: parseBody(rawBody),
              headers: response.headers,
              rawBody,
              statusCode: response.statusCode ?? 0
            });
          });
        }
      );

      request.on('error', (error: Error) => {
        reject(error);
      });

      request.on('timeout', () => {
        request.destroy(new Error('Tempo de resposta excedido no Integra Contador.'));
      });

      request.setTimeout(30000);

      if (bodyBuffer) {
        request.write(bodyBuffer);
      }

      request.end();
    });
  }
}
