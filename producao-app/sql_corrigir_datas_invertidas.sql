-- Corrige 2 visitas do histórico com erro de digitação de data na
-- planilha original: DATA INICIAL posterior à DATA FINAL (logicamente
-- impossível — início depois do fim). Confirmado com o usuário: nesses
-- casos, considerar como erro de digitação e usar a DATA FINAL nos dois
-- (ou seja, vira visita de 1 dia só, mesma regra de
-- "DATA INICIAL = DATA FINAL" já usada no resto do backfill).
--
--   SE ITAGUARU     — OS 53327 SGO — DATA INICIAL 2026-12-30, DATA FINAL 2026-01-02
--   SE USINA MAMBAI — OS 64276 SGO — DATA INICIAL 2026-06-25, DATA FINAL 2026-06-15
--
-- O backfill original (sql_backfill_producao_historica.sql) tratou as
-- duas como visita de 2 dias, criando um lançamento "Em Andamento" na
-- DATA INICIAL (linha_id 119 e 809 — datas 2026-12-30 e 2026-06-25,
-- ambas indevidas: a primeira inclusive no futuro) e o lançamento com a
-- atividade real na DATA FINAL (linha_id 120 e 810 — já corretos, não
-- precisam de nenhuma alteração). Esse script remove só os 2
-- lançamentos "Em Andamento" indevidos.
--
-- Rode ANTES de sql_backfill_equipe_regional.sql, se ainda não rodou —
-- esse script já foi atualizado pra casar essas 2 visitas pela DATA
-- FINAL nos dois, então precisa que os registros errados já tenham
-- sido removidos daqui.

DELETE FROM f_prod_atividades
WHERE registro_id IN (
  SELECT id FROM f_prod_registro
  WHERE contrato_id = 21
    AND (metadata_registro->>'origem_backfill_linha')::int IN (119, 809)
);

DELETE FROM f_prod_registro
WHERE contrato_id = 21
  AND (metadata_registro->>'origem_backfill_linha')::int IN (119, 809);

-- Verificação: nenhum lançamento de Limpeza de Subestação deve ter
-- data no futuro.
SELECT id, data_producao, metadata_registro->>'origem_backfill_linha' AS linha_id
FROM f_prod_registro
WHERE contrato_id = 21 AND data_producao > CURRENT_DATE;
