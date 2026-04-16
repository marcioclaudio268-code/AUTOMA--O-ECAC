CREATE TABLE "Parcelamento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "referenciaExterna" TEXT NOT NULL,
    "modalidade" TEXT NOT NULL,
    "situacao" TEXT NOT NULL,
    "quantidadeParcelas" INTEGER,
    "parcelaAtual" INTEGER,
    "dataVencimentoRelevante" TIMESTAMP(3),
    "indicioAtraso" BOOLEAN NOT NULL DEFAULT false,
    "requerAcao" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimaAtualizacaoEm" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parcelamento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Parcelamento_empresaId_referenciaExterna_key"
ON "Parcelamento"("empresaId", "referenciaExterna");

CREATE INDEX "Parcelamento_empresaId_idx" ON "Parcelamento"("empresaId");

CREATE INDEX "Parcelamento_empresaId_ativo_idx"
ON "Parcelamento"("empresaId", "ativo");

CREATE INDEX "Parcelamento_requerAcao_idx" ON "Parcelamento"("requerAcao");

ALTER TABLE "Parcelamento"
ADD CONSTRAINT "Parcelamento_empresaId_fkey"
FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
