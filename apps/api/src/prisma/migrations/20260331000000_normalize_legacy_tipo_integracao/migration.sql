-- Normalize legacy integration enum values to the current schema.
UPDATE "IntegracaoEmpresa"
SET "tipoIntegracao" = 'MANUAL'
WHERE "tipoIntegracao"::text NOT IN ('MANUAL', 'API', 'RPA');
