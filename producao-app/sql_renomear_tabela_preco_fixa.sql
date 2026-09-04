-- ============================================================
-- Renomeia a tabela d_atividades_preco_fixa -> d_atividades_preco_fixo
-- ============================================================
-- Verificado antes de escrever isto:
--   - Nenhuma view depende dessa tabela (pg_depend vazio).
--   - Só uma function referencia ela no corpo (texto): atualizar_upe_f_prod_serv
--     (trigger_atualizar_upe, em f_prod_atividades) — corrigida no passo 2,
--     na mesma transação, pra não deixar o sistema quebrado entre os dois
--     passos.
-- ============================================================

BEGIN;

ALTER TABLE d_atividades_preco_fixa RENAME TO d_atividades_preco_fixo;

CREATE OR REPLACE FUNCTION public.atualizar_upe_f_prod_serv()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_data_producao date;
  v_preco_fixa    numeric;
BEGIN
  SELECT r.data_producao INTO v_data_producao
  FROM f_prod_registro r
  WHERE r.id = NEW.registro_id;

  SELECT p.valor INTO v_preco_fixa
  FROM d_atividades_preco_fixo p
  WHERE p.atividade_id = NEW.atividade_id
    AND p.vigencia_inicio <= v_data_producao
  ORDER BY p.vigencia_inicio DESC
  LIMIT 1;

  IF v_preco_fixa IS NOT NULL THEN
    UPDATE f_prod_atividades SET upe = v_preco_fixa WHERE id = NEW.id;
  ELSE
    UPDATE f_prod_atividades
    SET upe = (
        SELECT d.upe
        FROM d_atividades d
        WHERE d.id = NEW.atividade_id
    )
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;

-- Conferir depois:
-- SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'd_atividades_preco%';
