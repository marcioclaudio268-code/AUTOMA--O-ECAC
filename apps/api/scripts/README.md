# Importacao one-shot da carteira

Script para carregar a carteira inicial a partir da planilha `EMPRESAS ATUALIZADA 01-04-26.xlsx`.

## Uso

Dry-run padrao:

```powershell
corepack pnpm --filter @ecac/api import:carteira -- "C:\Users\Windows 11\Desktop\EMPRESAS ATUALIZADA 01-04-26.xlsx"
```

Aplicar no banco:

```powershell
corepack pnpm --filter @ecac/api import:carteira -- "C:\Users\Windows 11\Desktop\EMPRESAS ATUALIZADA 01-04-26.xlsx" --apply
```

Relatorio JSON opcional:

```powershell
corepack pnpm --filter @ecac/api import:carteira -- "C:\Users\Windows 11\Desktop\EMPRESAS ATUALIZADA 01-04-26.xlsx" --report "C:\Temp\carteira-import.json"
```

## Regras

- Deduplicacao por CNPJ normalizado.
- `Plan1` e qualquer aba fora de `SIMPLES`, `LP LR` e `LR FRANCINES` ficam fora da importacao.
- Credenciais, login, senha e link da `Plan1` nao sao importados.
- Regimes suportados: `SN`, `LP`, `LR`.
- Valores ambíguos ou fora desse conjunto sao ignorados.
- O `dry-run` ainda consulta o banco para identificar CNPJs ja existentes, mas nao grava nada.
- O script nao atualiza empresas existentes nesta etapa; ele apenas registra como ja existentes.

## Limitacoes

- Script one-shot para carga inicial, nao sincronizacao recorrente.
- Mapeamento conservador, somente para os campos que fazem sentido agora.
- `nomeFantasia` nao e inferido quando a planilha nao fornece dado confiavel.
