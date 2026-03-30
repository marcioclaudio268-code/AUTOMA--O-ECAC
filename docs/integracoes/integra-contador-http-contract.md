# Integra Contador HTTP Contract

## Status atual

Bloqueada.

Nao foi encontrado no repositorio nenhum contrato externo concreto para a integracao `INTEGRA_CONTADOR` com endpoint, auth, payload, headers, timeout ou shape de resposta reais.

O que existe hoje e apenas a base operacional interna para registrar e executar tentativas manuais por empresa.

## Evidencia concreta encontrada

- `apps/api/src/prisma/schema.prisma` contem o enum `TipoIntegracao` com `INTEGRA_CONTADOR`.
- `apps/api/src/prisma/seed.ts` cria registros iniciais de `IntegracaoEmpresa` para `INTEGRA_CONTADOR`.
- `apps/api/src/modules/integrations/*` contem a base operacional interna da integracao por empresa e a execucao manual controlada.
- `apps/web/src/features/companies/company-integration-panel.tsx` exibe o bloco operacional da empresa e a acao manual.
- `.env.example` contem o contrato explicito `INTEGRA_CONTADOR_HTTP_CONTRACT_JSON`.
- Nao foram encontrados client HTTP, endpoint externo, payload real, exemplo de resposta real, credenciais reais ou documentacao externa do contador.

## Lacunas que continuam sem definicao

- `http.baseUrl`
- `http.method`
- `http.path`
- `http.auth`
- `http.headers`
- `http.timeoutMs`
- `http.request.bodyDescription`
- `http.request.pathParameters`
- `http.request.queryParameters`
- `http.response.successDescription`
- `http.response.failureDescription`
- semantica real de sucesso e falha

## Contrato de configuracao esperado

O backend passa a aceitar um JSON explicito em `INTEGRA_CONTADOR_HTTP_CONTRACT_JSON`.

Forma esperada:

```json
{
  "specVersion": 1,
  "sourceDocument": "docs/integracoes/integra-contador-http-contract.md",
  "status": "blocked",
  "summary": "Contrato externo nao localizado no repositorio.",
  "missing": [
    "http.baseUrl",
    "http.method",
    "http.path",
    "http.auth",
    "http.headers",
    "http.timeoutMs",
    "http.request.bodyDescription",
    "http.request.pathParameters",
    "http.request.queryParameters",
    "http.response.successDescription",
    "http.response.failureDescription"
  ],
  "http": {
    "baseUrl": null,
    "method": null,
    "path": null,
    "timeoutMs": null,
    "auth": {
      "kind": null,
      "headerName": null,
      "envVarName": null,
      "tokenPrefix": null
    },
    "headers": {},
    "request": {
      "bodyDescription": null,
      "pathParameters": [],
      "queryParameters": []
    },
    "response": {
      "successDescription": null,
      "failureDescription": null
    }
  }
}
```

## Regras do contrato

- `specVersion` e `sourceDocument` sao obrigatorios.
- `sourceDocument` precisa apontar para este arquivo.
- `status` pode ser `blocked`, `partial` ou `ready`.
- Quando `status` for `blocked` ou `partial`, `missing` precisa listar ao menos um campo pendente.
- Quando `status` for `ready`, `missing` precisa estar vazio.
- O contrato nao autoriza chamada externa por si so. Ele apenas registra a forma esperada e o estado atual.

## O que falta para conectar a chamada real

1. Obter o contrato externo verdadeiro do provedor.
2. Preencher `baseUrl`, `method`, `path`, auth, headers, timeout e shape de request/response com dados concretos.
3. Substituir o ramo bloqueado do adaptador por um cliente HTTP real.
4. Manter a persistencia atual em `IntegracaoEmpresa` sem criar automacao paralela.

## Leitura operacional

Enquanto o contrato externo nao existir de forma concreta, a execucao manual continua bloqueada com erro operacional honesto.
Isso evita falso positivo e deixa o fluxo pronto para o proximo passo real.
