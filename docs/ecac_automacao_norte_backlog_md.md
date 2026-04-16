# ECAC AUTOMAÇÃO — Norte do Projeto e Backlog Técnico

## Norte fixo do projeto

**ECAC AUTOMAÇÃO é a plataforma própria de backoffice fiscal-operacional do escritório, com conector opcional do Acessórias para documentos, guias, protocolos e sinais de operação, sem dependência arquitetural do Acessórias.**

## Propósito do sistema

O sistema existe para:
- organizar a carteira de empresas do escritório;
- acompanhar status operacionais por empresa;
- controlar acesso, procuração, vigências e pendências;
- manter histórico auditável do que foi feito;
- evoluir para integrar fontes oficiais e semioficiais para consulta, monitoramento e tratamento operacional.

## O que o sistema é

- um centro interno de monitoramento da carteira;
- uma plataforma de tratamento operacional por empresa;
- uma base de rastreabilidade e auditoria;
- um futuro hub de integrações fiscais e cadastrais.

## O que o sistema não é

- não é uma cópia do Acessórias;
- não é só um portal do cliente;
- não é só um dashboard bonito;
- não deve depender do Acessórias para existir;
- não deve abrir automação pesada antes de consolidar a base.

## Regra estrutural principal

Sempre priorizar esta ordem:
1. manual confiável;
2. leitura externa assistida;
3. integração oficial por API;
4. automação seletiva;
5. RPA apenas quando não houver canal oficial viável.

## Princípios do projeto

- confiabilidade operacional primeiro;
- limpeza estrutural depois;
- evitar abrir frentes paralelas cedo;
- preservar o que já funciona;
- cada evolução deve aumentar clareza, rastreabilidade e capacidade de tratamento;
- API oficial antes de automação por navegador;
- Acessórias como conector opcional, nunca como núcleo.

## Estado atual consolidado

### Núcleo operacional manual já construído
- carteira operacional funcional;
- tela de empresa como centro de trabalho;
- pendências estruturadas;
- logs auditáveis;
- revisão operacional separada da conferência;
- conferência bloqueada quando houver pendência aberta;
- edição manual com rastreabilidade;
- vigência de certificado e procuração cadastrável;
- vigência visível nas listas;
- filtros e recortes de vigência na carteira.

### Objetivo da fase atual
Consolidar o núcleo operacional manual e preparar a base para integrações reais com órgãos públicos e sistemas externos.

## Estratégia de integração

### Arquitetura desejada
O ECAC deve ter:
- **núcleo próprio interno** como fonte principal de verdade;
- **conectores externos modulares**;
- **normalização dos dados externos** no modelo interno;
- **operação por exceção**, não exibição crua de payload externo.

### Conectores-alvo
- Integra Contador;
- DARE ICMS SP;
- REDESIM / JUCESP / Balcão Único;
- NFS-e Padrão Nacional e conectores municipais estratégicos;
- Acessórias;
- PGFN / REGULARIZE em camada assistida;
- outros conectores somente quando houver valor claro.

## Backlog técnico macro

### Épico 1 — Camada de identidade e autorização
Objetivo:
- controlar certificado digital;
- controlar procuração;
- controlar escopo de acesso por empresa;
- sustentar qualquer integração futura.

Inclui:
- modelo de credenciais;
- modelo de autorizações;
- status por conector;
- logs de tentativa e uso.

### Épico 2 — Integra Contador
Objetivo:
começar pela integração oficial federal com melhor custo-benefício.

Submódulos prioritários:
- procurações;
- caixa postal;
- Simples Nacional;
- MEI;
- DCTFWeb;
- DARF / Sicalc;
- pagamentos.

### Épico 3 — DARE ICMS São Paulo
Objetivo:
trazer emissão e controle de guias estaduais com canal oficial paulista.

### Épico 4 — REDESIM / JUCESP / Balcão Único
Objetivo:
acompanhar abertura, alteração, baixa, protocolos e eventos cadastrais.

### Épico 5 — NFS-e / ISS
Objetivo:
integrar municípios aderentes ao padrão nacional e conectores municipais estratégicos.

### Épico 6 — Parcelamentos e dívida ativa
Objetivo:
acompanhar parcelamentos do Simples/MEI e depois evoluir para camada assistida de PGFN/Regularize.

### Épico 7 — e-CAC assistido / semi automatizado
Objetivo:
tratar o e-CAC como domínio híbrido:
- API oficial onde existir;
- processo assistido ou automação muito controlada onde não existir.

## Backlog técnico da integração com Acessórias

## Norte da integração com Acessórias
**Acessórias entra como conector opcional de documentos, guias, protocolos e sinais operacionais, com sincronização controlada, dados normalizados no modelo interno do ECAC e independência arquitetural total do produto principal.**

### Épico A1 — Infra da integração Acessórias
Inclui:
- configuração do token/API;
- teste de conexão;
- status da integração;
- jobs e erros auditáveis.

### Épico A2 — Vínculo de empresas
Inclui:
- sincronização de empresas externas;
- vínculo por CNPJ;
- conferência manual em casos ambíguos.

### Épico A3 — Sincronização de documentos
Inclui:
- espelho de documentos relevantes por empresa;
- status de leitura/baixa quando disponível;
- exibição na tela da empresa.

### Épico A4 — Sincronização de guias
Inclui:
- espelho de guias por empresa;
- tipo, competência, valor, vencimento e situação;
- exibição na tela da empresa.

### Épico A5 — Protocolos e eventos
Inclui:
- evidência de entrega/leitura/assinatura, quando existir;
- eventos relevantes para operação;
- timeline por empresa.

### Épico A6 — Exibição operacional integrada
Inclui:
- bloco de integração Acessórias na tela da empresa;
- documentos recentes;
- guias recentes;
- protocolos recentes;
- eventos recentes.

### Épico A7 — Sinais operacionais e pendências derivadas
Inclui:
- documento novo não tratado;
- guia vencida ou a vencer;
- falha de sincronização;
- criação assistida de pendência a partir de item externo.

### Épico A8 — Jobs agendados e robustez
Inclui:
- sincronização full agendada;
- reprocessamento por empresa;
- cursores;
- retry controlado;
- idempotência.

## MVP da integração com Acessórias

O MVP inclui:
- configuração do token;
- teste de conexão;
- vínculo de empresas;
- sync manual de empresas;
- sync manual de documentos;
- sync manual de guias;
- exibição desses dados na tela da empresa;
- jobs e erros auditáveis.

## Fase 2 da integração com Acessórias

Inclui:
- protocolos;
- eventos;
- sinais operacionais derivados;
- criação assistida de pendências;
- sync agendado;
- filtros e visão gerencial.

## Regras para tomada de decisão

Antes de aceitar uma nova frente, perguntar:
1. isso fortalece a operação da carteira?
2. isso melhora rastreabilidade?
3. isso aproxima o produto do núcleo fiscal-operacional?
4. isso depende de canal oficial ou estamos improvisando cedo demais?
5. isso desvia o foco para portal, estética ou automação prematura?

Se a resposta não estiver clara, não priorizar.

## O que não priorizar agora

- automação pesada por navegador como base do produto;
- dashboard rico antes do ganho operacional real;
- copiar funcionalidades inteiras do Acessórias;
- integrações sem modelo interno consistente;
- features visuais sem ganho operacional claro.

## Ordem recomendada de execução a partir daqui

1. consolidar o núcleo operacional manual;
2. estruturar camada de identidade e autorização;
3. abrir primeiro conector oficial de maior valor;
4. usar Acessórias como conector opcional e complementar;
5. evoluir para operação por exceção alimentada por dados externos.

## Lembrete final

O projeto não é “mais um sistema do escritório”.

Ele deve se tornar o **backoffice fiscal-operacional central da carteira**, capaz de:
- organizar;
- rastrear;
- priorizar;
- integrar;
- e sustentar automação seletiva com segurança.

