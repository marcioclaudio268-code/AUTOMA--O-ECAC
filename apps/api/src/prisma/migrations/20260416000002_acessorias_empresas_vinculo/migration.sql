-- AlterEnum
ALTER TYPE "TipoAcessoriasSyncJob" ADD VALUE IF NOT EXISTS 'SINCRONIZACAO_EMPRESAS';

-- AlterEnum
ALTER TYPE "TipoAcessoriasSyncCursor" ADD VALUE IF NOT EXISTS 'EMPRESAS';

-- CreateEnum
CREATE TYPE "StatusAcessoriasEmpresaVinculo" AS ENUM ('NAO_VINCULADA', 'VINCULADA', 'AMBIGUA', 'IGNORADA');

-- CreateTable
CREATE TABLE "AcessoriasEmpresaVinculo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT,
    "acessoriasEmpresaId" TEXT NOT NULL,
    "nomeExterno" TEXT NOT NULL,
    "cnpjExterno" TEXT NOT NULL,
    "statusVinculo" "StatusAcessoriasEmpresaVinculo" NOT NULL DEFAULT 'NAO_VINCULADA',
    "sincronizacaoHabilitada" BOOLEAN NOT NULL DEFAULT false,
    "matchAutomatico" BOOLEAN NOT NULL DEFAULT false,
    "ultimaSincronizacaoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcessoriasEmpresaVinculo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcessoriasEmpresaVinculo_empresaId_key" ON "AcessoriasEmpresaVinculo"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "AcessoriasEmpresaVinculo_acessoriasEmpresaId_key" ON "AcessoriasEmpresaVinculo"("acessoriasEmpresaId");

-- CreateIndex
CREATE INDEX "AcessoriasEmpresaVinculo_statusVinculo_idx" ON "AcessoriasEmpresaVinculo"("statusVinculo");

-- AddForeignKey
ALTER TABLE "AcessoriasEmpresaVinculo" ADD CONSTRAINT "AcessoriasEmpresaVinculo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
