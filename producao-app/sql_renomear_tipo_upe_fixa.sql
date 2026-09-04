-- ============================================================
-- Renomeia a coluna d_atividades.tipo_upe_fixa -> tipo_preco
-- ============================================================
-- Motivo: a coluna hoje tem 3 valores (upe, fixo, justificativa), não só
-- upe/fixa como o nome antigo sugeria. tipo_preco descreve melhor o que
-- ela controla: como o preço da atividade é calculado.
--
-- Verificado antes de escrever isto: nenhuma view, materialized view ou
-- function do banco referencia tipo_upe_fixa (só a coluna "UPE"/
-- DESCRICAO_BASICA_SISTEMA eram usadas por view_prod_relatorio_equipes,
-- já corrigido na migração anterior). O trigger atualizar_upe_f_prod_serv
-- também não depende dela. Ou seja, esta é só uma questão de coluna +
-- código de aplicação, sem função/view pra corrigir junto.
-- ============================================================

ALTER TABLE d_atividades RENAME COLUMN tipo_upe_fixa TO tipo_preco;

-- Conferir depois:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'd_atividades' ORDER BY ordinal_position;
