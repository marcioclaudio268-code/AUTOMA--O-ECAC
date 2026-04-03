import {
  PerfilUsuario,
  PrismaClient,
  RegimeTributario,
  StatusAcessoEmpresa,
  StatusIntegracao,
  StatusProcuracaoEmpresa,
  TipoIntegracao
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function upsertPriorityIntegration(
  empresaId: string,
  observacoes: string
) {
  const existing = await prisma.integracaoEmpresa.findFirst({
    where: {
      empresaId,
      tipoIntegracao: TipoIntegracao.INTEGRA_CONTADOR
    }
  });

  if (existing) {
    return prisma.integracaoEmpresa.update({
      data: {
        mensagemErroAtual: null,
        observacoes,
        statusIntegracao: StatusIntegracao.ATIVA,
        ultimoErroEm: null,
        ultimoSucessoEm: new Date()
      },
      where: {
        id: existing.id
      }
    });
  }

  return prisma.integracaoEmpresa.create({
    data: {
      empresaId,
      mensagemErroAtual: null,
      observacoes,
      statusIntegracao: StatusIntegracao.ATIVA,
      tipoIntegracao: TipoIntegracao.INTEGRA_CONTADOR,
      ultimoErroEm: null,
      ultimoSucessoEm: new Date()
    }
  });
}

async function main() {
  const adminSenhaHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.usuarioInterno.upsert({
    create: {
      ativo: true,
      email: 'admin@ecac.local',
      nome: 'Admin ECAC',
      perfil: PerfilUsuario.ADMIN,
      senhaHash: adminSenhaHash
    },
    update: {
      ativo: true,
      nome: 'Admin ECAC',
      perfil: PerfilUsuario.ADMIN,
      senhaHash: adminSenhaHash
    },
    where: {
      email: 'admin@ecac.local'
    }
  });

  const responsavel = await prisma.responsavelInterno.upsert({
    create: {
      ativo: true,
      email: 'responsavel.operacional@ecac.local',
      nome: 'Responsavel Operacional',
      usuarioInternoId: admin.id
    },
    update: {
      ativo: true,
      nome: 'Responsavel Operacional',
      usuarioInternoId: admin.id
    },
    where: {
      email: 'responsavel.operacional@ecac.local'
    }
  });

  const empresa1 = await prisma.empresa.upsert({
    create: {
      cnpj: '11222333000181',
      nomeFantasia: 'Alpha Contabilidade',
      naCarteira: true,
      observacoesOperacionais: 'Cadastro inicial de seed.',
      razaoSocial: 'Alpha Contabilidade Ltda',
      regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
      responsavelInternoId: responsavel.id,
      statusAcesso: StatusAcessoEmpresa.DISPONIVEL,
      statusProcuracao: StatusProcuracaoEmpresa.VALIDA
    },
    update: {
      nomeFantasia: 'Alpha Contabilidade',
      naCarteira: true,
      observacoesOperacionais: 'Cadastro inicial de seed.',
      razaoSocial: 'Alpha Contabilidade Ltda',
      regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
      responsavelInternoId: responsavel.id,
      statusAcesso: StatusAcessoEmpresa.DISPONIVEL,
      statusProcuracao: StatusProcuracaoEmpresa.VALIDA
    },
    where: {
      cnpj: '11222333000181'
    }
  });

  const empresa2 = await prisma.empresa.upsert({
    create: {
      cnpj: '22333444000192',
      nomeFantasia: 'Beta Servicos Contabeis',
      naCarteira: false,
      observacoesOperacionais: 'Cadastro inicial de seed.',
      razaoSocial: 'Beta Servicos Contabeis Ltda',
      regimeTributario: RegimeTributario.LUCRO_PRESUMIDO,
      responsavelInternoId: responsavel.id,
      statusAcesso: StatusAcessoEmpresa.NAO_VERIFICADO,
      statusProcuracao: StatusProcuracaoEmpresa.PENDENTE
    },
    update: {
      nomeFantasia: 'Beta Servicos Contabeis',
      naCarteira: false,
      observacoesOperacionais: 'Cadastro inicial de seed.',
      razaoSocial: 'Beta Servicos Contabeis Ltda',
      regimeTributario: RegimeTributario.LUCRO_PRESUMIDO,
      responsavelInternoId: responsavel.id,
      statusAcesso: StatusAcessoEmpresa.NAO_VERIFICADO,
      statusProcuracao: StatusProcuracaoEmpresa.PENDENTE
    },
    where: {
      cnpj: '22333444000192'
    }
  });

  await upsertPriorityIntegration(
    empresa1.id,
    'Integracao contador inicial da carteira.'
  );

  await upsertPriorityIntegration(
    empresa2.id,
    'Integracao contador inicial da carteira.'
  );

  console.log('Seed concluido.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
