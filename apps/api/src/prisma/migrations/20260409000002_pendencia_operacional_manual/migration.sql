-- CreateEnum
CREATE TYPE "StatusPendenciaOperacional" AS ENUM ('ABERTA', 'RESOLVIDA');

-- CreateEnum
CREATE TYPE "TipoPendenciaOperacional" AS ENUM ('ACESSO', 'OPERACIONAL', 'PROCURACAO');

-- CreateTable
CREATE TABLE "PendenciaOperacional" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoPendenciaOperacional" NOT NULL,
    "status" "StatusPendenciaOperacional" NOT NULL DEFAULT 'ABERTA',
    "descricao" TEXT NOT NULL,
    "origem" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendenciaOperacional_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendenciaOperacional_empresaId_idx" ON "PendenciaOperacional"("empresaId");

-- CreateIndex
CREATE INDEX "PendenciaOperacional_status_idx" ON "PendenciaOperacional"("status");

-- CreateIndex
CREATE INDEX "PendenciaOperacional_tipo_idx" ON "PendenciaOperacional"("tipo");

-- CreateIndex
CREATE INDEX "PendenciaOperacional_createdAt_idx" ON "PendenciaOperacional"("createdAt");

-- AddForeignKey
ALTER TABLE "PendenciaOperacional" ADD CONSTRAINT "PendenciaOperacional_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
