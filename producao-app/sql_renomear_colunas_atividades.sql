-- ============================================================
-- Migração de nomes em d_atividades:
--   DESCRICAO_BASICA_SISTEMA -> descricao
--   "UPE"                    -> upe
--   "ADICIONAL_30"           -> adicional_30
--   tipo_upe_fixa: 'FIXA' -> 'fixo', 'UPE' -> 'upe' (justificativa já minúsculo)
--
-- Investigação feita antes de escrever isto (rodada manualmente no SQL
-- Editor, resultado revisado):
--   - view_prod_relatorio_equipes usa DESCRICAO_BASICA_SISTEMA cru — é view,
--     o Postgres atualiza sozinha quando a coluna for renomeada.
--   - view_prod_relatorio_colaborador só usa d_atividades.bonificacao — não
--     é afetada.
--   - internal.mat_producao_powerbi (matview do Power BI) só lê
--     view_prod_relatorio_equipes.desc_atividade (um ALIAS, não muda) — não
--     é afetada.
--   - fn_prod_dados_anuais só lê da matview acima — não é afetada.
--   - A ÚNICA function que referencia a coluna "UPE" literalmente no corpo
--     dela é o trigger atualizar_upe_f_prod_serv — corrigida no passo 3.
--
-- IMPORTANTE — ordem de execução:
--   Rode este script E publique o deploy do código atualizado o mais perto
--   possível um do outro. Entre rodar o SQL e subir o deploy, o site em
--   produção fica com o código antigo tentando ler colunas que já não
--   existem mais (o app quebra até o deploy novo entrar no ar).
-- ============================================================

BEGIN;

-- 0) Pendência anterior (LSE-AND -> jus.232 / justificativa). Idempotente:
--    não faz nada se você já rodou o sql_migrar_justificativa_para_tipo_upe_fixa.sql
--    antes. Incluído aqui pra evitar que o UPDATE do passo 2 converta essa
--    atividade pra 'fixo' por engano (ela precisa continuar sendo 'justificativa').
UPDATE d_atividades
SET tipo_upe_fixa = 'justificativa',
    codigo_op = 'jus.232'
WHERE codigo_op = 'LSE-AND';

-- 1) Renomeia as colunas
ALTER TABLE d_atividades RENAME COLUMN "DESCRICAO_BASICA_SISTEMA" TO descricao;
ALTER TABLE d_atividades RENAME COLUMN "UPE" TO upe;
ALTER TABLE d_atividades RENAME COLUMN "ADICIONAL_30" TO adicional_30;

-- 2) Renomeia os valores de tipo_upe_fixa
UPDATE d_atividades SET tipo_upe_fixa = 'fixo' WHERE tipo_upe_fixa = 'FIXA';
UPDATE d_atividades SET tipo_upe_fixa = 'upe'  WHERE tipo_upe_fixa = 'UPE';

-- 3) Corrige a função do trigger (trigger_atualizar_upe, em f_prod_atividades)
--    pra usar d.upe em vez de d."UPE". CREATE OR REPLACE preserva o trigger
--    já existente, só troca a lógica de dentro.
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

-- ============================================================
-- Conferir depois de rodar:
-- ============================================================
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'd_atividades' ORDER BY ordinal_position;
-- SELECT DISTINCT tipo_upe_fixa FROM d_atividades;
-- SELECT pg_get_viewdef('view_prod_relatorio_equipes'::regclass, true); -- deve aparecer da.descricao
