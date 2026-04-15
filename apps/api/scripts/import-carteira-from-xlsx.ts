import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import {
  PrismaClient,
  RegimeTributario,
  StatusAcessoEmpresa,
  StatusProcuracaoEmpresa
} from '@prisma/client';
import xlsx from 'xlsx';

import { isBasicCnpj, normalizeCnpj } from '../src/common/utils/cnpj';

const ALLOWED_SHEETS = ['SIMPLES', 'LP LR', 'LR FRANCINES'] as const;
const IGNORED_SHEETS = ['Plan1'] as const;

type AllowedSheetName = (typeof ALLOWED_SHEETS)[number];

type ParsedCarteiraRow = {
  codigo: string | null;
  cnpjNormalized: string;
  cnpjRaw: string | null;
  regimeRaw: string | null;
  regimeTributario: RegimeTributario;
  razaoSocial: string;
  segmento: string | null;
  sheetName: AllowedSheetName;
  site: string | null;
  sourceRow: number;
};

type ImportRowStatus =
  | 'created'
  | 'dry-run'
  | 'existing'
  | 'duplicate'
  | 'ignored'
  | 'invalid-cnpj'
  | 'invalid-regime'
  | 'error';

type ImportRowAction =
  | 'create'
  | 'skip-dry-run'
  | 'skip-existing'
  | 'skip-duplicate'
  | 'skip-ignored'
  | 'skip-invalid-cnpj'
  | 'skip-invalid-regime'
  | 'error';

type ImportRowReport = {
  action: ImportRowAction;
  cnpjNormalized: string | null;
  cnpjRaw: string | null;
  code: string | null;
  errorMessage: string | null;
  reason: string;
  razaoSocial: string | null;
  regimeRaw: string | null;
  segmento: string | null;
  sheetName: string;
  sourceRow: number | null;
  status: ImportRowStatus;
  site: string | null;
};

type ImportSummary = {
  criados: number;
  erros: number;
  ignorados: number;
  invalidosCnpj: number;
  invalidosRegime: number;
  jaExistentes: number;
  totalLido: number;
  validos: number;
};

type ImportReport = {
  lines: ImportRowReport[];
  sheetsIgnoradas: string[];
  sheetsProcessadas: string[];
  summary: ImportSummary;
};

type ImportOutcome = ImportReport & {
  workbookPath: string;
  dryRun: boolean;
};

type ImportPrisma = Pick<PrismaClient, 'empresa'>;

type ImportOptions = {
  apply: boolean;
  prisma: ImportPrisma;
  reportPath?: string;
};

type CliOptions = {
  apply: boolean;
  filePath: string;
  reportPath?: string;
};

function normalizeToken(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function trimCell(value: unknown): string {
  return String(value ?? '').trim();
}

function hasContent(value: unknown): boolean {
  return trimCell(value).length > 0;
}

export function normalizeCnpjStrict(value: unknown): string | null {
  const normalized = normalizeCnpj(value);
  if (!normalized || !isBasicCnpj(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizeRegimeTributarioFromPlan(
  value: unknown
): RegimeTributario | null {
  switch (normalizeToken(value)) {
    case 'SN':
      return RegimeTributario.SIMPLES_NACIONAL;
    case 'LP':
      return RegimeTributario.LUCRO_PRESUMIDO;
    case 'LR':
      return RegimeTributario.LUCRO_REAL;
    default:
      return null;
  }
}

function normalizeObservationText(value: unknown): string | null {
  const normalized = trimCell(value).replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
}

function isNoiseRow(row: unknown[]): boolean {
  const joined = row.map(normalizeToken).join('');
  if (joined.length === 0) {
    return true;
  }

  return (
    joined.includes('COLUNAS') ||
    joined.includes('EMPRESASSIMPLESNACIONAL') ||
    joined.includes('LUCROPRESUMIDOELUCROREAL') ||
    joined.includes('EMPRESASCOMMOVIMENTOMENSAL')
  );
}

function buildObservationLine(row: ParsedCarteiraRow): string {
  const lines = [
    `Origem da carteira: ${row.sheetName}`,
    `Codigo interno da planilha: ${row.codigo ?? '-'}`,
    `Segmento: ${row.segmento ?? '-'}`,
  ];

  if (row.site) {
    lines.push(`Site: ${row.site}`);
  }

  return lines.join('\n');
}

function headerKey(value: unknown): string {
  return normalizeToken(value);
}

function findHeaderRowIndex(
  rows: unknown[][],
  requiredHeaders: string[]
): number {
  const required = requiredHeaders.map(headerKey);

  return rows.findIndex((row) => {
    const normalized = row.map(headerKey);
    return required.every((header) => normalized.includes(header));
  });
}

function buildHeaderMap(row: unknown[]): Map<string, number> {
  const headerMap = new Map<string, number>();

  row.forEach((cell, index) => {
    const key = headerKey(cell);
    if (key && !headerMap.has(key)) {
      headerMap.set(key, index);
    }
  });

  return headerMap;
}

function readHeaderValue(
  row: unknown[],
  headers: Map<string, number>,
  headerName: string
): string | null {
  const index = headers.get(headerKey(headerName));

  if (index === undefined) {
    return null;
  }

  const value = trimCell(row[index]);
  return value.length > 0 ? value : null;
}

function parseStructuredSheet(
  rows: unknown[][],
  sheetName: 'SIMPLES' | 'LR FRANCINES'
): ParsedCarteiraRow[] {
  const requiredHeaders =
    sheetName === 'SIMPLES'
      ? ['CÓDIGO', 'RAZÃO', 'CNPJ', 'REG', 'SEGMENTO']
      : ['CÓDIGO', 'RAZÃO', 'CNPJ', 'REG', 'SEGMENTO', 'SITE'];
  const headerRowIndex = findHeaderRowIndex(rows, requiredHeaders);

  if (headerRowIndex < 0) {
    throw new Error(
      `Cabecalho esperado nao encontrado na aba ${sheetName}.`
    );
  }

  const headerMap = buildHeaderMap(rows[headerRowIndex] ?? []);
  const parsedRows: ParsedCarteiraRow[] = [];

  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];

    if (row.length === 0 || isNoiseRow(row)) {
      continue;
    }

    const codigo = readHeaderValue(row, headerMap, 'CÓDIGO');
    const razaoSocial = readHeaderValue(row, headerMap, 'RAZÃO');
    const cnpjRaw = readHeaderValue(row, headerMap, 'CNPJ');
    const regimeRaw = readHeaderValue(row, headerMap, 'REG');
    const segmento = readHeaderValue(row, headerMap, 'SEGMENTO');
    const site =
      sheetName === 'LR FRANCINES'
        ? readHeaderValue(row, headerMap, 'SITE')
        : null;

    parsedRows.push({
      codigo,
      cnpjNormalized: '',
      cnpjRaw,
      regimeRaw,
      regimeTributario: RegimeTributario.OUTRO,
      razaoSocial: razaoSocial ?? '',
      segmento,
      sheetName,
      site,
      sourceRow: index + 1
    });
  }

  return parsedRows;
}

function findLpDataStartRow(rows: unknown[][]): number {
  return rows.findIndex((row) => {
    if (row.length < 3 || isNoiseRow(row)) {
      return false;
    }

    return [row[0], row[1], row[2], row[3], row[4]].some(hasContent);
  });
}

function parseLpSheet(rows: unknown[][]): ParsedCarteiraRow[] {
  const startRow = findLpDataStartRow(rows);

  if (startRow < 0) {
    throw new Error('Nenhuma linha de dados valida encontrada na aba LP LR.');
  }

  const parsedRows: ParsedCarteiraRow[] = [];

  for (let index = startRow; index < rows.length; index += 1) {
    const row = rows[index] ?? [];

    if (row.length === 0 || isNoiseRow(row)) {
      continue;
    }

    const codigo = normalizeObservationText(row[0]);
    const razaoSocial = normalizeObservationText(row[1]);
    const cnpjRaw = normalizeObservationText(row[2]);
    const segmento = normalizeObservationText(row[3]);
    const regimeRaw = normalizeObservationText(row[4]);

    parsedRows.push({
      codigo,
      cnpjNormalized: '',
      cnpjRaw,
      regimeRaw,
      regimeTributario: RegimeTributario.OUTRO,
      razaoSocial: razaoSocial ?? '',
      segmento,
      sheetName: 'LP LR',
      site: null,
      sourceRow: index + 1
    });
  }

  return parsedRows;
}

export function parseCarteiraWorkbook(workbook: xlsx.WorkBook): ImportReport {
  const lines: ImportRowReport[] = [];
  const sheetsProcessadas: string[] = [];
  const sheetsIgnoradas = workbook.SheetNames.filter(
    (sheetName) => !ALLOWED_SHEETS.includes(sheetName as AllowedSheetName)
  );

  for (const sheetName of ALLOWED_SHEETS) {
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      continue;
    }

    const rows = xlsx.utils.sheet_to_json(worksheet, {
      blankrows: false,
      defval: '',
      header: 1,
      raw: false
    }) as unknown[][];

    const parsedRows =
      sheetName === 'LP LR'
        ? parseLpSheet(rows)
        : parseStructuredSheet(rows, sheetName);

    sheetsProcessadas.push(sheetName);

    for (const parsedRow of parsedRows) {
      lines.push({
        action: 'skip-ignored',
        cnpjNormalized: null,
        cnpjRaw: parsedRow.cnpjRaw,
        code: parsedRow.codigo,
        errorMessage: null,
        reason: 'Linha lida da planilha.',
        razaoSocial: parsedRow.razaoSocial,
        regimeRaw: parsedRow.regimeRaw,
        segmento: parsedRow.segmento,
        sheetName: parsedRow.sheetName,
        sourceRow: parsedRow.sourceRow,
        status: 'ignored',
        site: parsedRow.site
      });
    }
  }

  return {
    lines,
    sheetsIgnoradas,
    sheetsProcessadas,
    summary: {
      criados: 0,
      erros: 0,
      ignorados: 0,
      invalidosCnpj: 0,
      invalidosRegime: 0,
      jaExistentes: 0,
      totalLido: 0,
      validos: 0
    }
  };
}

async function classifyAndImportRows(
  workbookReport: ImportReport,
  prisma: ImportPrisma,
  apply: boolean
): Promise<ImportOutcome> {
  const seenCnpjs = new Set<string>();
  const reportRows: ImportRowReport[] = [];
  const summary: ImportSummary = {
    criados: 0,
    erros: 0,
    ignorados: 0,
    invalidosCnpj: 0,
    invalidosRegime: 0,
    jaExistentes: 0,
    totalLido: 0,
    validos: 0
  };

  for (const row of workbookReport.lines) {
    summary.totalLido += 1;

    const razaoSocial = normalizeObservationText(row.razaoSocial);
    const cnpjRaw = normalizeObservationText(row.cnpjRaw);
    const cnpjNormalized = normalizeCnpjStrict(cnpjRaw);

    if (!razaoSocial) {
      summary.ignorados += 1;
      reportRows.push({
        ...row,
        action: 'skip-ignored',
        cnpjNormalized: cnpjNormalized ?? null,
        errorMessage: null,
        reason: 'Razao social ausente.',
        razaoSocial: null,
        regimeRaw: row.regimeRaw,
        segmento: row.segmento,
        site: row.site,
        status: 'ignored'
      });
      continue;
    }

    if (!cnpjNormalized) {
      summary.invalidosCnpj += 1;
      summary.ignorados += 1;
      reportRows.push({
        ...row,
        action: 'skip-invalid-cnpj',
        cnpjNormalized: null,
        errorMessage: null,
        reason: 'CNPJ invalido ou ausente.',
        razaoSocial,
        regimeRaw: row.regimeRaw,
        segmento: row.segmento,
        site: row.site,
        status: 'invalid-cnpj'
      });
      continue;
    }

    const regimeTributario = normalizeRegimeTributarioFromPlan(row.regimeRaw);

    if (!regimeTributario) {
      summary.invalidosRegime += 1;
      summary.ignorados += 1;
      reportRows.push({
        ...row,
        action: 'skip-invalid-regime',
        cnpjNormalized,
        errorMessage: null,
        reason: 'Regime tributario nao suportado.',
        razaoSocial,
        regimeRaw: row.regimeRaw,
        segmento: row.segmento,
        site: row.site,
        status: 'invalid-regime'
      });
      continue;
    }

    if (seenCnpjs.has(cnpjNormalized)) {
      summary.ignorados += 1;
      reportRows.push({
        ...row,
        action: 'skip-duplicate',
        cnpjNormalized,
        errorMessage: null,
        reason: 'CNPJ duplicado dentro do arquivo.',
        razaoSocial,
        regimeRaw: row.regimeRaw,
        segmento: row.segmento,
        site: row.site,
        status: 'duplicate'
      });
      continue;
    }

    seenCnpjs.add(cnpjNormalized);
    summary.validos += 1;

    let existing: { id: string } | null = null;

    try {
      existing = await prisma.empresa.findUnique({
        select: {
          id: true
        },
        where: {
          cnpj: cnpjNormalized
        }
      });
    } catch (error) {
      summary.erros += 1;
      reportRows.push({
        ...row,
        action: 'error',
        cnpjNormalized,
        errorMessage:
          error instanceof Error ? error.message : 'Falha ao consultar empresa.',
        reason: 'Erro ao consultar existencia da empresa.',
        razaoSocial,
        regimeRaw: row.regimeRaw,
        segmento: row.segmento,
        site: row.site,
        status: 'error'
      });
      continue;
    }

    const enrichedRow: ParsedCarteiraRow = {
      ...row,
      cnpjNormalized,
      regimeTributario,
      razaoSocial
    };

    if (existing) {
      summary.jaExistentes += 1;
      reportRows.push({
        ...row,
        action: 'skip-existing',
        cnpjNormalized,
        errorMessage: null,
        reason: 'CNPJ ja existente no banco.',
        razaoSocial,
        regimeRaw: row.regimeRaw,
        segmento: row.segmento,
        site: row.site,
        status: 'existing'
      });
      continue;
    }

    if (!apply) {
      reportRows.push({
        ...row,
        action: 'skip-dry-run',
        cnpjNormalized,
        errorMessage: null,
        reason: 'Dry-run sem gravacao.',
        razaoSocial,
        regimeRaw: row.regimeRaw,
        segmento: row.segmento,
        site: row.site,
        status: 'dry-run'
      });
      continue;
    }

    try {
      await prisma.empresa.create({
        data: {
          cnpj: cnpjNormalized,
          naCarteira: true,
          nomeFantasia: null,
          observacoesOperacionais: buildObservationLine(enrichedRow),
          pendenciaOperacional: false,
          razaoSocial,
          regimeTributario,
          responsavelInternoId: null,
          statusAcesso: StatusAcessoEmpresa.NAO_VERIFICADO,
          statusProcuracao: StatusProcuracaoEmpresa.NAO_VERIFICADA
        }
      });

      summary.criados += 1;
      reportRows.push({
        ...row,
        action: 'create',
        cnpjNormalized,
        errorMessage: null,
        reason: 'Empresa criada com sucesso.',
        razaoSocial,
        regimeRaw: row.regimeRaw,
        segmento: row.segmento,
        site: row.site,
        status: 'created'
      });
    } catch (error) {
      summary.erros += 1;
      reportRows.push({
        ...row,
        action: 'error',
        cnpjNormalized,
        errorMessage:
          error instanceof Error ? error.message : 'Falha ao criar empresa.',
        reason: 'Erro ao gravar empresa.',
        razaoSocial,
        regimeRaw: row.regimeRaw,
        segmento: row.segmento,
        site: row.site,
        status: 'error'
      });
    }
  }

  return {
    ...workbookReport,
    dryRun: !apply,
    lines: reportRows,
    summary
  };
}

export async function runCarteiraImport(
  filePath: string,
  options: ImportOptions
): Promise<ImportOutcome> {
  const workbook = xlsx.readFile(filePath, {
    cellDates: false
  });

  const workbookReport = parseCarteiraWorkbook(workbook);
  const outcome = await classifyAndImportRows(
    workbookReport,
    options.prisma,
    options.apply
  );

  if (options.reportPath) {
    const reportDir = path.dirname(options.reportPath);
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      options.reportPath,
      `${JSON.stringify(outcome, null, 2)}\n`,
      'utf8'
    );
  }

  return {
    ...outcome,
    workbookPath: path.resolve(filePath)
  };
}

function parseCliArgs(argv: string[]): CliOptions {
  const positional: string[] = [];
  let apply = false;
  let reportPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (!value) {
      continue;
    }

    if (value === '--apply') {
      apply = true;
      continue;
    }

    if (value === '--report') {
      const nextValue = argv[index + 1];
      if (nextValue && !nextValue.startsWith('--')) {
        reportPath = nextValue;
        index += 1;
      } else {
        reportPath = undefined;
      }
      continue;
    }

    if (value.startsWith('--report=')) {
      reportPath = value.slice('--report='.length);
      continue;
    }

    if (value === '--help' || value === '-h') {
      printUsageAndExit();
    }

    positional.push(value);
  }

  if (positional.length === 0) {
    printUsageAndExit('Caminho do arquivo XLSX nao informado.');
  }

  return {
    apply,
    filePath: positional[0] as string,
    reportPath
  };
}

function printUsageAndExit(errorMessage?: string): never {
  if (errorMessage) {
    console.error(errorMessage);
  }

  console.error(
    [
      'Uso:',
      '  tsx scripts/import-carteira-from-xlsx.ts <arquivo.xlsx> [--apply] [--report <arquivo.json>]',
      '',
      'Comportamento padrao:',
      '  - dry-run',
      '  - deduplicacao por CNPJ',
      '  - ignorar Plan1 e credenciais',
      '',
      'Flags:',
      '  --apply     grava novas empresas validas',
      '  --report    grava um JSON simples com o detalhamento da importacao'
    ].join('\n')
  );

  process.exit(errorMessage ? 1 : 0);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const cli = parseCliArgs(argv);
  const prisma = new PrismaClient();

  try {
    const outcome = await runCarteiraImport(cli.filePath, {
      apply: cli.apply,
      prisma,
      reportPath: cli.reportPath
    });

    console.log(`Arquivo: ${outcome.workbookPath}`);
    console.log(`Modo: ${outcome.dryRun ? 'dry-run' : 'apply'}`);
    console.log(
      `Abas processadas: ${outcome.sheetsProcessadas.join(', ') || '-'}`
    );
    console.log(`Abas ignoradas: ${outcome.sheetsIgnoradas.join(', ') || '-'}`);
    console.log(`Total lido: ${outcome.summary.totalLido}`);
    console.log(`Validos: ${outcome.summary.validos}`);
    console.log(`Ignorados: ${outcome.summary.ignorados}`);
    console.log(`Criados: ${outcome.summary.criados}`);
    console.log(`Ja existentes: ${outcome.summary.jaExistentes}`);
    console.log(`Invalidos por CNPJ: ${outcome.summary.invalidosCnpj}`);
    console.log(`Invalidos por regime: ${outcome.summary.invalidosRegime}`);
    console.log(`Erros: ${outcome.summary.erros}`);

    if (cli.reportPath) {
      console.log(`Relatorio salvo em: ${path.resolve(cli.reportPath)}`);
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Falha ao importar carteira.'
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
