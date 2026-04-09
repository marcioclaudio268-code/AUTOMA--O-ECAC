-- CreateEnum
CREATE TYPE "TipoEventoOperacional" AS ENUM ('VARREDURA_RELEVANTE', 'MUDANCA_ESTADO');

-- CreateTable
CREATE TABLE "EventoOperacional" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "varreduraId" TEXT NOT NULL,
    "tipoEvento" "TipoEventoOperacional" NOT NULL,
    "descricao" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoOperacional_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventoOperacional_varreduraId_key" ON "EventoOperacional"("varreduraId");

-- CreateIndex
CREATE INDEX "EventoOperacional_empresaId_idx" ON "EventoOperacional"("empresaId");

-- CreateIndex
CREATE INDEX "EventoOperacional_varreduraId_idx" ON "EventoOperacional"("varreduraId");

-- CreateIndex
CREATE INDEX "EventoOperacional_tipoEvento_idx" ON "EventoOperacional"("tipoEvento");

-- AddForeignKey
ALTER TABLE "EventoOperacional" ADD CONSTRAINT "EventoOperacional_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoOperacional" ADD CONSTRAINT "EventoOperacional_varreduraId_fkey" FOREIGN KEY ("varreduraId") REFERENCES "Varredura"("id") ON DELETE CASCADE ON UPDATE CASCADE;
