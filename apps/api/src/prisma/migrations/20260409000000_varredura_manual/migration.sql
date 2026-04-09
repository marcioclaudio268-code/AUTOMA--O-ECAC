-- CreateEnum
CREATE TYPE "TipoVarredura" AS ENUM ('MANUAL');

-- CreateEnum
CREATE TYPE "StatusExecucaoVarredura" AS ENUM ('INICIADA', 'CONCLUIDA', 'FALHA');

-- CreateTable
CREATE TABLE "Varredura" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipoVarredura" "TipoVarredura" NOT NULL,
    "statusExecucao" "StatusExecucaoVarredura" NOT NULL,
    "iniciadoEm" TIMESTAMP(3) NOT NULL,
    "finalizadoEm" TIMESTAMP(3),
    "resumoResultado" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Varredura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Varredura_empresaId_idx" ON "Varredura"("empresaId");

-- CreateIndex
CREATE INDEX "Varredura_tipoVarredura_idx" ON "Varredura"("tipoVarredura");

-- CreateIndex
CREATE INDEX "Varredura_statusExecucao_idx" ON "Varredura"("statusExecucao");

-- AddForeignKey
ALTER TABLE "Varredura" ADD CONSTRAINT "Varredura_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
