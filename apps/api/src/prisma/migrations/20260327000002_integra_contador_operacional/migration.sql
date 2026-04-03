ALTER TYPE "TipoIntegracao" ADD VALUE IF NOT EXISTS 'INTEGRA_CONTADOR';

CREATE UNIQUE INDEX "IntegracaoEmpresa_empresaId_tipoIntegracao_key"
ON "IntegracaoEmpresa"("empresaId", "tipoIntegracao");
