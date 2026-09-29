-- ============================================================
-- Remove trigger_atualizar_upe de f_prod_atividades
-- ============================================================
-- Por que dá pra remover:
--   - O app só grava f_prod_atividades em dois lugares (NovoRegistro.jsx e
--     EditarRegistro.jsx), e os dois já mandam upe e preco_upe calculados:
--     fixo -> preço vigente de d_atividades_preco_fixo na data_producao
--     (pickPrecoFixa), justificativa -> 0, upe -> d_atividades.upe.
--     É a mesma regra que o trigger aplicava.
--   - EditarRegistro apaga e reinsere as atividades (nunca faz UPDATE de
--     atividade_id), então o ramo UPDATE OF atividade_id do trigger não é usado.
--   - Não há outras origens de lançamento (confirmado pelo usuário).
--
-- Só o trigger é removido; a função atualizar_upe_f_prod_serv fica no banco
-- (pra reverter basta recriar o trigger, comando no fim do arquivo).
--
-- Recomendado rodar junto com sql_upe_null_como_zero.sql (rede de segurança:
-- upe NULL vira 0 em vez de 1 na fórmula de valor_total).

DROP TRIGGER IF EXISTS trigger_atualizar_upe ON public.f_prod_atividades;

-- Reverter:
-- CREATE TRIGGER trigger_atualizar_upe
--   AFTER INSERT OR UPDATE OF atividade_id ON public.f_prod_atividades
--   FOR EACH ROW EXECUTE FUNCTION atualizar_upe_f_prod_serv();
