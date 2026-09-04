-- ============================================================
-- Preço Fixa com vigência — estender para todas as atividades FIXA,
-- de qualquer contrato (não só o contrato 21 / Subestação, que já
-- tinha sido semeado em sql_preco_fixa_vigencia.sql).
-- ============================================================
-- Contexto: a tabela d_atividades_preco_fixa e o trigger
-- atualizar_upe_f_prod_serv (ver sql_preco_fixa_sem_vigencia_fim.sql)
-- já são agnósticos de contrato — o vínculo é via atividade_id, que
-- carrega o contrato_id dela mesma (d_atividades.contrato_id). Não
-- precisa mudar nem tabela nem trigger, só faltam os dados: cada
-- atividade com tipo_upe_fixa='FIXA' precisa de uma linha inicial em
-- d_atividades_preco_fixa, senão o trigger cai no fallback
-- d_atividades."UPE" (comportamento antigo — funciona, mas não fica
-- disponível pra reajuste por vigência nem aparece nas telas de
-- Configurações > Atividades Preço Fixa / Reajuste Preço Fixa).
--
-- Esta migração cobre TODAS as atividades FIXA de TODOS os contratos
-- que ainda não têm nenhuma linha em d_atividades_preco_fixa — o
-- NOT EXISTS evita duplicar as do contrato 21 já semeadas antes.
-- ============================================================

DO $$
DECLARE
  v_inseridos integer;
BEGIN
  INSERT INTO d_atividades_preco_fixa (atividade_id, valor, vigencia_inicio)
  SELECT a.id, a."UPE", DATE '2000-01-01'
  FROM d_atividades a
  WHERE a.tipo_upe_fixa = 'FIXA'
    AND a."UPE" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM d_atividades_preco_fixa p WHERE p.atividade_id = a.id);

  GET DIAGNOSTICS v_inseridos = ROW_COUNT;
  RAISE NOTICE 'OK — % atividade(s) FIXA (todos os contratos) receberam vigência inicial.', v_inseridos;
END $$;

-- ============================================================
-- Verificar depois de rodar (deve incluir contratos além do 21):
-- ============================================================
-- SELECT a.contrato_id, count(*)
-- FROM d_atividades_preco_fixa p
-- JOIN d_atividades a ON a.id = p.atividade_id
-- GROUP BY a.contrato_id
-- ORDER BY a.contrato_id;
