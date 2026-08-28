-- ============================================================
-- Simplifica d_atividades_preco_fixa: deixa de precisar de vigencia_fim
-- ============================================================
-- Contexto: a tela de Reajuste de Preco Fixa (Configuracoes > Atividades)
-- fazia duas operacoes por atividade alterada — fechar o preco atual
-- (UPDATE ... SET vigencia_fim = data_reajuste) e inserir o novo
-- (INSERT ... vigencia_inicio = data_reajuste). Isso e desnecessario:
-- pra achar o preco vigente numa data D, basta pegar a linha de maior
-- vigencia_inicio que seja <= D — o vigencia_fim nunca muda esse
-- resultado, ja que toda linha nova sempre tem vigencia_inicio maior
-- que a anterior (jamais duas linhas "abertas" ao mesmo tempo pra
-- mesma atividade).
--
-- Depois de rodar este script:
--   - O front-end (Reajuste de Preco Fixa e Preco Fixa por Vigencia)
--     so faz INSERT, nunca mais escreve em vigencia_fim.
--   - A coluna vigencia_fim continua existindo na tabela (nao foi
--     dropada, dados antigos ficam la), mas nao e mais lida por
--     ninguem. Se quiser limpar de vez, tem um DROP COLUMN comentado
--     no final — so rode se tiver certeza que nada mais depende dela.
-- ============================================================

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

  -- Preco vigente = a linha de maior vigencia_inicio que seja <= data_producao.
  -- Nao depende mais de vigencia_fim.
  SELECT p.valor INTO v_preco_fixa
  FROM d_atividades_preco_fixa p
  WHERE p.atividade_id = NEW.atividade_id
    AND p.vigencia_inicio <= v_data_producao
  ORDER BY p.vigencia_inicio DESC
  LIMIT 1;

  IF v_preco_fixa IS NOT NULL THEN
    UPDATE f_prod_atividades SET upe = v_preco_fixa WHERE id = NEW.id;
  ELSE
    UPDATE f_prod_atividades
    SET upe = (
        SELECT d."UPE"
        FROM d_atividades d
        WHERE d.id = NEW.atividade_id
    )
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================
-- Verificar depois de rodar:
-- ============================================================
-- SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'atualizar_upe_f_prod_serv';

-- ============================================================
-- Opcional — limpeza total da coluna (SO rodar se tiver certeza):
-- ============================================================
-- ALTER TABLE d_atividades_preco_fixa DROP COLUMN vigencia_fim;
