-- CreateEnum
CREATE TYPE "StatusIntegracaoAcessorias" AS ENUM ('NAO_CONFIGURADA', 'CONFIGURADA', 'ATIVA', 'ERRO');

-- CreateEnum
CREATE TYPE "TipoAcessoriasSyncJob" AS ENUM ('TESTE_CONEXAO');

-- CreateEnum
CREATE TYPE "StatusAcessoriasSyncJob" AS ENUM ('INICIADO', 'SUCESSO', 'FALHA');

-- CreateEnum
CREATE TYPE "TipoAcessoriasSyncCursor" AS ENUM ('GERAL');

-- CreateTable
CREATE TABLE "IntegracaoAcessoriasConfig" (
    "id" TEXT NOT NULL,
    "apiTokenCriptografado" TEXT NOT NULL,
    "status" "StatusIntegracaoAcessorias" NOT NULL DEFAULT 'NAO_CONFIGURADA',
    "ultimaSincronizacaoEm" TIMESTAMP(3),
    "ultimoErroEm" TIMESTAMP(3),
    "mensagemErroAtual" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegracaoAcessoriasConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcessoriasSyncJob" (
    "id" TEXT NOT NULL,
    "tipoJob" "TipoAcessoriasSyncJob" NOT NULL,
    "status" "StatusAcessoriasSyncJob" NOT NULL DEFAULT 'INICIADO',
    "iniciadoEm" TIMESTAMP(3) NOT NULL,
    "finalizadoEm" TIMESTAMP(3),
    "processados" INTEGER NOT NULL DEFAULT 0,
    "criados" INTEGER NOT NULL DEFAULT 0,
    "atualizados" INTEGER NOT NULL DEFAULT 0,
    "ignorados" INTEGER NOT NULL DEFAULT 0,
    "falhas" INTEGER NOT NULL DEFAULT 0,
    "detalhesErro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcessoriasSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcessoriasSyncCursor" (
    "id" TEXT NOT NULL,
    "tipoCursor" "TipoAcessoriasSyncCursor" NOT NULL DEFAULT 'GERAL',
    "valorCursor" TEXT,
    "ultimaPagina" INTEGER,
    "ultimaExecucaoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcessoriasSyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcessoriasSyncJob_createdAt_idx" ON "AcessoriasSyncJob"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcessoriasSyncCursor_tipoCursor_key" ON "AcessoriasSyncCursor"("tipoCursor");
