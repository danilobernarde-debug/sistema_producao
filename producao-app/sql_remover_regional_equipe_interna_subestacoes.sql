-- Remove regional_id e equipe_interna_id de d_subestacoes — nunca
-- foram usados de fato: regional_id ficou redundante com
-- superintendencia (que já cobre NORTE/NORDESTE/SUL/SUDOESTE/CENTRO)
-- e equipe_interna_id era só metadado informativo, nunca preenchido
-- de forma confiável nem usado em nenhuma lógica do sistema.

ALTER TABLE d_subestacoes DROP COLUMN IF EXISTS regional_id;
ALTER TABLE d_subestacoes DROP COLUMN IF EXISTS equipe_interna_id;

-- Verificação: confere as colunas restantes.
SELECT column_name FROM information_schema.columns
WHERE table_name = 'd_subestacoes' ORDER BY ordinal_position;
