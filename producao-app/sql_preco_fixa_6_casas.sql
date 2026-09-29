-- Alarga d_atividades_preco_fixo.valor de numeric(12,2) para numeric(12,6),
-- igual a f_prod_atividades.upe e d_atividades."UPE", pra o preço fixo
-- não ser arredondado em 2 casas antes de chegar no trigger de UPE.
ALTER TABLE d_atividades_preco_fixo ALTER COLUMN valor TYPE numeric(12,6);
