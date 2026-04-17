ALTER TYPE "TipoVarredura"
ADD VALUE IF NOT EXISTS 'DIVIDA_ATIVA' AFTER 'ACESSORIAS';

CREATE TABLE "DividaAtiva" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "referenciaExterna" TEXT NOT NULL,
    "numeroInscricao" TEXT NOT NULL,
    "tipoDivida" TEXT NOT NULL,
    "situacao" TEXT NOT NULL,
    "dataInscricao" TIMESTAMP(3),
    "requerAcao" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimaAtualizacaoEm" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DividaAtiva_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DividaAtiva_empresaId_referenciaExterna_key"
ON "DividaAtiva"("empresaId", "referenciaExterna");

CREATE INDEX "DividaAtiva_empresaId_idx" ON "DividaAtiva"("empresaId");

CREATE INDEX "DividaAtiva_empresaId_ativo_idx"
ON "DividaAtiva"("empresaId", "ativo");

CREATE INDEX "DividaAtiva_requerAcao_idx" ON "DividaAtiva"("requerAcao");

ALTER TABLE "DividaAtiva"
ADD CONSTRAINT "DividaAtiva_empresaId_fkey"
FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
