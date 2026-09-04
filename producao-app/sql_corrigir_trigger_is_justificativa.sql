-- ============================================================
-- CORREÇÃO URGENTE — trigger que bloqueia TODO insert em f_prod_atividades
-- ============================================================
-- A função atualizar_is_justificativa() (trigger BEFORE INSERT/UPDATE OF
-- atividade_id em f_prod_atividades) referenciava d_atividades.referencia_codigo,
-- coluna apagada anteriormente. Desde então, TODO lançamento de produção
-- (Novo Registro / Editar Registro) falha ao inserir o item da atividade
-- com erro "column referencia_codigo does not exist" — e como o front-end
-- não verificava o erro desse insert, o registro "pai" ficava salvo sem
-- nenhum item, sem aviso nenhum pro usuário.
--
-- Esta função não estava em nenhum arquivo do repositório (descoberta só
-- agora, tentando reproduzir o bug relatado pelo usuário). Corrigida pra
-- usar tipo_preco = 'justificativa' (nome atual, depois das migrações
-- de d_atividades já aplicadas).
-- ============================================================

CREATE OR REPLACE FUNCTION public.atualizar_is_justificativa()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$BEGIN
  -- Atualiza is_justificativa baseado no tipo_preco da atividade
  NEW.is_justificativa := (SELECT tipo_preco = 'justificativa'
                           FROM d_atividades
                           WHERE id = NEW.atividade_id);
  RETURN NEW;
END;$function$
