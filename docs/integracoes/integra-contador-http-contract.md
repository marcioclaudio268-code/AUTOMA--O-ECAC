# Integra Contador - Procuracoes / OBTERPROCURACAO41

## Status

Ativo para o primeiro fluxo real.

Este documento registra somente o slice implementado neste branch:

- tipo de integracao: `INTEGRA_CONTADOR`
- endpoint de negocio: `POST /Consultar`
- sistema: `PROCURACOES`
- servico: `OBTERPROCURACAO41`
- versaoSistema: `1`

## Autenticacao oficial

O backend autentica na API oficial do SERPRO com:

- `POST https://autenticacao.sapi.serpro.gov.br/authenticate`
- `Authorization: Basic base64(consumerKey:consumerSecret)`
- `Role-Type: TERCEIROS`
- `Content-Type: application/x-www-form-urlencoded`
- body `grant_type=client_credentials`
- certificado digital do contratante

A resposta precisa fornecer:

- `access_token`
- `jwt_token`

## Configuracao minima

Variaveis de ambiente usadas por este slice:

- `INTEGRA_CONTADOR_CONSUMER_KEY`
- `INTEGRA_CONTADOR_CONSUMER_SECRET`
- `INTEGRA_CONTADOR_CERT_PATH`
- `INTEGRA_CONTADOR_CERT_PASSWORD`
- `INTEGRA_CONTADOR_CONTRATANTE_NUMERO`

Observacao:

- `INTEGRA_CONTADOR_CONTRATANTE_NUMERO` representa o NI do escritorio.
- o mesmo NI e usado como `contratante` e `autorPedidoDados`.
- o caminho do certificado deve apontar para um arquivo PFX/P12 valido.

## Chamada de negocio

O backend faz:

- `POST https://gateway.apiserpro.serpro.gov.br/integra-contador/v1/Consultar`
- `Authorization: Bearer <access_token>`
- `jwt_token: <jwt_token>`
- `Content-Type: application/json`

O payload segue o contrato real do cliente oficial:

```json
{
  "contratante": {
    "numero": "NI_DO_ESCRITORIO",
    "tipo": 2
  },
  "autorPedidoDados": {
    "numero": "NI_DO_ESCRITORIO",
    "tipo": 2
  },
  "contribuinte": {
    "numero": "NI_DO_OUTORGANTE",
    "tipo": 2
  },
  "pedidoDados": {
    "idSistema": "PROCURACOES",
    "idServico": "OBTERPROCURACAO41",
    "versaoSistema": "1",
    "dados": "{\"outorgante\":\"NI_DO_OUTORGANTE\",\"tipoOutorgante\":\"2\",\"outorgado\":\"NI_DO_OUTORGADO\",\"tipoOutorgado\":\"2\"}"
  }
}
```

## Regra fixa deste slice

Nesta implementacao a regra operacional foi fixada assim:

- `contribuinte = outorgante`
- `contratante = autorPedidoDados = escritorio`
- `outorgante = cliente`
- `outorgado = escritorio`

O tipo de pessoa usa o codigo do cliente oficial:

- `CPF -> 1`
- `CNPJ -> 2`

## Erros tratados

O backend trata minimamente:

- `401` como falha de autenticacao ou token expirado
- `403` como acesso negado ou procuracao/servico nao autorizado
- `400` como entrada invalida
- `429` como limite de requisicoes
- `500` e `503` como falha ou indisponibilidade externa

Atencao especial foi dada a:

- `AcessoNegado-PROCURACOES-40300`
- `ICGERENCIADOR-022`
- `ICGERENCIADOR-041`
- `ICGERENCIADOR-044`
- `ICGERENCIADOR-045`
- `ICGERENCIADOR-052`

O erro de negocio `AcessoNegado-PROCURACOES-40300` e preservado de forma literal quando a API retorna:

- `Outorgante diferente do Contribuinte.`

## Persistencia operacional

Ao executar a integracao:

- sucesso atualiza `statusIntegracao`, `ultimoSucessoEm` e limpa `mensagemErroAtual`
- falha atualiza `statusIntegracao = ERRO`, `ultimoErroEm` e grava `mensagemErroAtual`
- `observacoes` so sao alteradas quando o fluxo real precisa sobrescrever o valor

## Tela de execucao

A execucao manual continua concentrada em:

- `/empresas/[id]`

O painel reaproveitado permite:

- executar o primeiro fluxo real
- informar outorgante
- informar outorgado
- opcionalmente ajustar `tipoOutorgante` e `tipoOutorgado`

## Fora de escopo

Este documento nao abre outras frentes do Integra Contador.

- DCTFWEB
- SITFIS
- parcelamentos
- divida ativa
- fila
- cron
- worker
- webhook
- polling
- batch
- novo painel
- nova pagina
