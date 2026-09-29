-- ============================================================
-- Justificativas devem valer R$ 0,00 (UPE = 0), não NULL
-- ============================================================
-- Sintoma: atividade tipo_preco='justificativa' (ex.: jus.215) aparecia
-- com R$ 1,00 no Dashboard. d_atividades.upe estava NULL; o trigger
-- atualizar_upe_f_prod_serv copia esse NULL pra f_prod_atividades.upe
-- (fallback), e o valor_total gerado acaba em 1,00.
--
-- 1) Antes: conferir o estado atual
SELECT a.codigo_op, a.upe, count(*) AS qtd_lancamentos,
       sum(fpa.valor_total) AS soma_valor_total
FROM d_atividades a
LEFT JOIN f_prod_atividades fpa ON fpa.atividade_id = a.id
WHERE a.tipo_preco = 'justificativa'
GROUP BY a.codigo_op, a.upe
HAVING sum(fpa.valor_total) IS DISTINCT FROM 0
ORDER BY 4 DESC NULLS FIRST;

BEGIN;

-- 2) Cadastro: justificativa sem UPE passa a ter UPE = 0
UPDATE d_atividades
SET upe = 0
WHERE tipo_preco = 'justificativa' AND upe IS NULL;

-- 3) Lançamentos já gravados: zera o upe (valor_total é gerado e se
--    recalcula sozinho; o trigger só dispara em INSERT/UPDATE OF atividade_id)
UPDATE f_prod_atividades fpa
SET upe = 0
FROM d_atividades a
WHERE a.id = fpa.atividade_id
  AND a.tipo_preco = 'justificativa'
  AND fpa.upe IS DISTINCT FROM 0;

COMMIT;

-- 4) Depois: deve voltar vazio (justificativa com valor <> 0)
-- SELECT fpa.id, fpa.upe, fpa.preco_upe, fpa.adicional, fpa.valor_total
-- FROM f_prod_atividades fpa JOIN d_atividades a ON a.id = fpa.atividade_id
-- WHERE a.tipo_preco = 'justificativa' AND fpa.valor_total <> 0;
