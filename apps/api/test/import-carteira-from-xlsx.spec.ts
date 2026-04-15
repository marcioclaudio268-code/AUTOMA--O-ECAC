import { mkdtemp, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { PrismaClient, RegimeTributario } from '@prisma/client';
import { afterEach, describe, expect, test, vi } from 'vitest';
import xlsx from 'xlsx';

import {
  normalizeCnpjStrict,
  normalizeRegimeTributarioFromPlan,
  parseCarteiraWorkbook,
  runCarteiraImport
} from '../scripts/import-carteira-from-xlsx';

type PrismaMock = Pick<PrismaClient, 'empresa'>;

async function createWorkbookFile(
  sheets: Array<{ name: string; rows: unknown[][] }>
) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'ecac-import-carteira-xlsx-')
  );
  const filePath = path.join(root, 'carteira.xlsx');
  const workbook = xlsx.utils.book_new();

  for (const sheet of sheets) {
    xlsx.utils.book_append_sheet(
      workbook,
      xlsx.utils.aoa_to_sheet(sheet.rows),
      sheet.name
    );
  }

  xlsx.writeFile(workbook, filePath);

  return {
    filePath,
    root
  };
}

function createPrismaMock(existingCnpjs: Set<string> = new Set()): PrismaMock {
  const findUnique = vi.fn(async ({ where }: { where: { cnpj: string } }) => {
    return existingCnpjs.has(where.cnpj) ? { id: 'existing-company-id' } : null;
  });

  const create = vi.fn(async () => ({ id: 'created-company-id' }));

  return {
    empresa: {
      create,
      findUnique
    }
  } as unknown as PrismaMock;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('importacao one-shot da carteira', () => {
  test('normaliza CNPJ e regime de forma conservadora', () => {
    expect(normalizeCnpjStrict('41.570.055/0001-14')).toBe('41570055000114');
    expect(normalizeCnpjStrict('I/I')).toBeNull();
    expect(normalizeRegimeTributarioFromPlan('SN')).toBe(
      RegimeTributario.SIMPLES_NACIONAL
    );
    expect(normalizeRegimeTributarioFromPlan('LP')).toBe(
      RegimeTributario.LUCRO_PRESUMIDO
    );
    expect(normalizeRegimeTributarioFromPlan('LR')).toBe(
      RegimeTributario.LUCRO_REAL
    );
    expect(normalizeRegimeTributarioFromPlan('I/I')).toBeNull();
  });

  test('parseia apenas as abas relevantes e ignora Plan1 com credenciais', async () => {
    const workbookFile = await createWorkbookFile([
      {
        name: 'SIMPLES',
        rows: [
          ['EMPRESAS SIMPLES NACIONAL'],
          ['CÓDIGO', 'RAZÃO', 'CNPJ', 'REG', 'SEGMENTO', 'SENHA PREFEITURA'],
          [833, 'A. B. S. REPRESENTACOES', '41.570.055/0001-14', 'SN', 'SERVIÇO', 1847]
        ]
      },
      {
        name: 'Plan1',
        rows: [
          ['COD.', 'EMPRESA', 'CIDADE', 'LOGIN', 'SENHA', 'LINK'],
          [850, 'MADRI', 'ITAPEVA', '267.471.948-61', 'pacova.10', 'https://nfe.exemplo/login']
        ]
      }
    ]);

    try {
      const workbook = xlsx.readFile(workbookFile.filePath);
      const report = parseCarteiraWorkbook(workbook);

      expect(report.sheetsIgnoradas).toContain('Plan1');
      expect(report.sheetsProcessadas).toContain('SIMPLES');
      expect(report.lines).toHaveLength(1);
      expect(report.lines[0]).toMatchObject({
        cnpjRaw: '41.570.055/0001-14',
        razaoSocial: 'A. B. S. REPRESENTACOES',
        regimeRaw: 'SN',
        sheetName: 'SIMPLES'
      });
      expect(report.lines.some((line) => line.sheetName === 'Plan1')).toBe(
        false
      );
      expect(
        report.lines.some((line) =>
          /login|senha|link/i.test(
            [line.code, line.reason, line.razaoSocial, line.regimeRaw]
              .filter(Boolean)
              .join(' ')
          )
        )
      ).toBe(false);
    } finally {
      await rm(workbookFile.root, { force: true, recursive: true });
    }
  });

  test('dry-run consulta existentes sem gravar', async () => {
    const workbookFile = await createWorkbookFile([
      {
        name: 'SIMPLES',
        rows: [
          ['CÓDIGO', 'RAZÃO', 'CNPJ', 'REG', 'SEGMENTO'],
          [833, 'A. B. S. REPRESENTACOES', '41.570.055/0001-14', 'SN', 'SERVIÇO']
        ]
      }
    ]);

    const prisma = createPrismaMock(new Set(['41570055000114']));

    try {
      const outcome = await runCarteiraImport(workbookFile.filePath, {
        apply: false,
        prisma
      });

      expect(prisma.empresa.create).not.toHaveBeenCalled();
      expect(prisma.empresa.findUnique).toHaveBeenCalledTimes(1);
      expect(outcome.summary).toMatchObject({
        criados: 0,
        ignorados: 0,
        invalidosCnpj: 0,
        invalidosRegime: 0,
        jaExistentes: 1,
        totalLido: 1,
        validos: 1
      });
      expect(outcome.lines[0]).toMatchObject({
        action: 'skip-existing',
        status: 'existing'
      });
    } finally {
      await rm(workbookFile.root, { force: true, recursive: true });
    }
  });

  test('apply cria apenas faltantes e preserva o create-missing', async () => {
    const workbookFile = await createWorkbookFile([
      {
        name: 'LR FRANCINES',
        rows: [
          ['CÓDIGO', 'RAZÃO', 'CNPJ', 'REG', 'SEGMENTO', 'SITE'],
          [756, 'FRANCINE MATRIZ', '32973535000135', 'LR', 'COMÉRCIO PIT STOP', 'VELOCE']
        ]
      }
    ]);

    const prisma = createPrismaMock();

    try {
      const outcome = await runCarteiraImport(workbookFile.filePath, {
        apply: true,
        prisma
      });

      expect(prisma.empresa.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.empresa.create).toHaveBeenCalledTimes(1);
      expect(prisma.empresa.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cnpj: '32973535000135',
            naCarteira: true,
            nomeFantasia: null,
            pendenciaOperacional: false,
            razaoSocial: 'FRANCINE MATRIZ',
            regimeTributario: RegimeTributario.LUCRO_REAL,
            responsavelInternoId: null,
            statusAcesso: 'NAO_VERIFICADO',
            statusProcuracao: 'NAO_VERIFICADA'
          })
        })
      );
      expect(outcome.summary).toMatchObject({
        criados: 1,
        ignorados: 0,
        invalidosCnpj: 0,
        invalidosRegime: 0,
        jaExistentes: 0,
        totalLido: 1,
        validos: 1
      });
      expect(outcome.lines[0]).toMatchObject({
        action: 'create',
        status: 'created'
      });
    } finally {
      await rm(workbookFile.root, { force: true, recursive: true });
    }
  });

  test('deduplica por CNPJ e descarta linhas invalidas', async () => {
    const workbookFile = await createWorkbookFile([
      {
        name: 'SIMPLES',
        rows: [
          ['CÓDIGO', 'RAZÃO', 'CNPJ', 'REG', 'SEGMENTO'],
          [833, 'A. B. S. REPRESENTACOES', '41.570.055/0001-14', 'SN', 'SERVIÇO']
        ]
      },
      {
        name: 'LR FRANCINES',
        rows: [
          ['CÓDIGO', 'RAZÃO', 'CNPJ', 'REG', 'SEGMENTO', 'SITE'],
          [900, 'A. B. S. REPRESENTACOES DUP', '41.570.055/0001-14', 'LR', 'SERVIÇO', 'SITE']
        ]
      },
      {
        name: 'LP LR',
        rows: [
          ['LUCRO PRESUMIDO E LUCRO REAL'],
          ['EMPRESAS COM MOVIMENTO MENSAL'],
          [504, 'INVALIDO CNPJ', '123', 'S', 'LP'],
          [505, 'INVALIDO REGIME', '32973535000135', 'S', 'I/I']
        ]
      }
    ]);

    const prisma = createPrismaMock();

    try {
      const outcome = await runCarteiraImport(workbookFile.filePath, {
        apply: true,
        prisma
      });

      expect(prisma.empresa.create).toHaveBeenCalledTimes(1);
      expect(outcome.summary).toMatchObject({
        criados: 1,
        ignorados: 3,
        invalidosCnpj: 1,
        invalidosRegime: 1,
        jaExistentes: 0,
        totalLido: 4,
        validos: 1
      });
      expect(outcome.lines.map((line) => line.status)).toEqual([
        'created',
        'invalid-cnpj',
        'invalid-regime',
        'duplicate'
      ]);
    } finally {
      await rm(workbookFile.root, { force: true, recursive: true });
    }
  });
});
