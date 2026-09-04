-- ============================================================
-- Trava no banco os valores válidos de d_atividades.tipo_preco e
-- d_atividades.tipo_lm_lv, pra impedir cadastro errado (principalmente
-- via importação XLSX, que aceita texto livre nessas colunas).
-- ============================================================
-- Verificado antes de escrever isto:
--   - tipo_preco: hoje só tem 'fixo', 'upe', 'justificativa' (nenhum NULL
--     nem valor fora do padrão) — constraint pode ser criada direto.
--   - tipo_lm_lv: tem 5 linhas com string vazia '' (não NULL) além de
--     'LM'/'LV'/NULL — precisa normalizar pra NULL antes, senão o
--     ALTER TABLE falha.
-- As duas colunas continuam aceitando NULL (nenhuma delas é obrigatória
-- hoje no cadastro) — só passam a rejeitar qualquer outro texto.
-- ============================================================

UPDATE d_atividades SET tipo_lm_lv = NULL WHERE tipo_lm_lv = '';

ALTER TABLE d_atividades
  ADD CONSTRAINT chk_d_atividades_tipo_preco
  CHECK (tipo_preco IS NULL OR tipo_preco IN ('upe', 'fixo', 'justificativa'));

ALTER TABLE d_atividades
  ADD CONSTRAINT chk_d_atividades_tipo_lm_lv
  CHECK (tipo_lm_lv IS NULL OR tipo_lm_lv IN ('LM', 'LV'));

-- Conferir depois:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'd_atividades'::regclass AND contype = 'c';
