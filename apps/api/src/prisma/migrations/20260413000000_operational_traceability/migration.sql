-- CreateEnum
CREATE TYPE "TipoPendencia" AS ENUM ('ACESSO', 'OPERACIONAL', 'PROCURACAO');

-- CreateEnum
CREATE TYPE "StatusPendencia" AS ENUM ('ABERTA', 'RESOLVIDA');

-- CreateEnum
CREATE TYPE "PrioridadePendencia" AS ENUM ('BAIXA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "TipoLogExecucao" AS ENUM (
    'CONFERENCIA_OPERACIONAL',
    'REGISTRO_PENDENCIA',
    'REGULARIZACAO_PENDENCIA',
    'RETIRADA_CARTEIRA'
);

-- CreateEnum
CREATE TYPE "ResultadoLogExecucao" AS ENUM ('SUCESSO', 'SEM_ALTERACAO', 'FALHA');

-- CreateTable
CREATE TABLE "Pendencia" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "responsavelInternoId" TEXT,
    "tipo" "TipoPendencia" NOT NULL,
    "status" "StatusPendencia" NOT NULL DEFAULT 'ABERTA',
    "prioridade" "PrioridadePendencia" NOT NULL DEFAULT 'MEDIA',
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "origem" TEXT,
    "abertaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadaEm" TIMESTAMP(3),
    "criadaPorUsuarioInternoId" TEXT,
    "atualizadaPorUsuarioInternoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pendencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogExecucao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "pendenciaId" TEXT,
    "tipo" "TipoLogExecucao" NOT NULL,
    "resultado" "ResultadoLogExecucao" NOT NULL,
    "resumo" TEXT NOT NULL,
    "detalhes" TEXT,
    "executadoPorUsuarioInternoId" TEXT,
    "executadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chaveIdempotencia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogExecucao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pendencia_empresaId_idx" ON "Pendencia"("empresaId");

-- CreateIndex
CREATE INDEX "Pendencia_status_idx" ON "Pendencia"("status");

-- CreateIndex
CREATE INDEX "Pendencia_prioridade_idx" ON "Pendencia"("prioridade");

-- CreateIndex
CREATE INDEX "Pendencia_responsavelInternoId_idx" ON "Pendencia"("responsavelInternoId");

-- CreateIndex
CREATE INDEX "Pendencia_tipo_idx" ON "Pendencia"("tipo");

-- CreateIndex
CREATE INDEX "Pendencia_abertaEm_idx" ON "Pendencia"("abertaEm");

-- CreateIndex
CREATE INDEX "LogExecucao_empresaId_idx" ON "LogExecucao"("empresaId");

-- CreateIndex
CREATE INDEX "LogExecucao_pendenciaId_idx" ON "LogExecucao"("pendenciaId");

-- CreateIndex
CREATE INDEX "LogExecucao_executadoEm_idx" ON "LogExecucao"("executadoEm");

-- CreateIndex
CREATE INDEX "LogExecucao_tipo_idx" ON "LogExecucao"("tipo");

-- CreateIndex
CREATE INDEX "LogExecucao_resultado_idx" ON "LogExecucao"("resultado");

-- CreateIndex
CREATE INDEX "LogExecucao_executadoPorUsuarioInternoId_idx" ON "LogExecucao"("executadoPorUsuarioInternoId");

-- CreateIndex
CREATE INDEX "LogExecucao_chaveIdempotencia_idx" ON "LogExecucao"("chaveIdempotencia");

-- AddForeignKey
ALTER TABLE "Pendencia" ADD CONSTRAINT "Pendencia_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pendencia" ADD CONSTRAINT "Pendencia_responsavelInternoId_fkey" FOREIGN KEY ("responsavelInternoId") REFERENCES "ResponsavelInterno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pendencia" ADD CONSTRAINT "Pendencia_criadaPorUsuarioInternoId_fkey" FOREIGN KEY ("criadaPorUsuarioInternoId") REFERENCES "UsuarioInterno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pendencia" ADD CONSTRAINT "Pendencia_atualizadaPorUsuarioInternoId_fkey" FOREIGN KEY ("atualizadaPorUsuarioInternoId") REFERENCES "UsuarioInterno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogExecucao" ADD CONSTRAINT "LogExecucao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogExecucao" ADD CONSTRAINT "LogExecucao_pendenciaId_fkey" FOREIGN KEY ("pendenciaId") REFERENCES "Pendencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogExecucao" ADD CONSTRAINT "LogExecucao_executadoPorUsuarioInternoId_fkey" FOREIGN KEY ("executadoPorUsuarioInternoId") REFERENCES "UsuarioInterno"("id") ON DELETE SET NULL ON UPDATE CASCADE;
