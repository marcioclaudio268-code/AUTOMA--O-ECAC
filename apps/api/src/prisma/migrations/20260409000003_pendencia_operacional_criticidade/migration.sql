-- CreateEnum
CREATE TYPE "CriticidadePendenciaOperacional" AS ENUM ('BAIXA', 'MEDIA', 'ALTA');

-- AlterTable
ALTER TABLE "PendenciaOperacional"
ADD COLUMN "criticidade" "CriticidadePendenciaOperacional" NOT NULL DEFAULT 'MEDIA';

-- CreateIndex
CREATE INDEX "PendenciaOperacional_empresaId_status_criticidade_idx" ON "PendenciaOperacional"("empresaId", "status", "criticidade");
