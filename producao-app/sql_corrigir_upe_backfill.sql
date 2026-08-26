-- ============================================================
-- Corrige upe (e consequentemente valor_total, gerado) nas 1.259
-- linhas do backfill histórico, que saíram com upe=1 em vez do
-- valor real — o trigger não preencheu como esperado no INSERT em
-- massa. Recalcula manualmente com a mesma lógica que o trigger
-- deveria ter aplicado.
-- ============================================================

-- Atividades reais (Roçagem/Capina): busca o preço vigente em
-- d_atividades_preco_fixa pela data_producao do registro.
UPDATE f_prod_atividades fa
SET upe = pf.valor
FROM f_prod_registro fr, d_atividades_preco_fixa pf
WHERE fa.registro_id = fr.id
  AND fr.contrato_id = 21
  AND (fr.metadata_registro->>'origem_backfill') = 'planilha_2026'
  AND pf.atividade_id = fa.atividade_id
  AND pf.vigencia_inicio <= fr.data_producao
  AND (pf.vigencia_fim IS NULL OR pf.vigencia_fim > fr.data_producao);

-- "Em Andamento" (LSE-AND): não tem linha em d_atividades_preco_fixa
-- (nunca foi semeada lá), então o UPDATE acima não toca essas linhas.
-- Valor sempre zero, de propósito.
UPDATE f_prod_atividades fa
SET upe = 0
FROM f_prod_registro fr, d_atividades da
WHERE fa.registro_id = fr.id
  AND fr.contrato_id = 21
  AND (fr.metadata_registro->>'origem_backfill') = 'planilha_2026'
  AND fa.atividade_id = da.id
  AND da.codigo_op = 'LSE-AND';

-- Conferir:
SELECT count(*) qtd, sum(valor_total) total
FROM f_prod_atividades fa
JOIN f_prod_registro fr ON fr.id = fa.registro_id
WHERE fr.contrato_id = 21 AND (fr.metadata_registro->>'origem_backfill') = 'planilha_2026';
