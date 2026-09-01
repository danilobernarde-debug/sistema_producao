-- ============================================================
-- ETAPA 2 de 2 — APLICA A MUDANÇA. Rode só depois de conferir o
-- resultado da etapa 1 (sql_migrar_data_inicio_1_conferir.sql) e
-- os números fizerem sentido.
--
-- Autocontido — recalcula o mesmo pareamento sozinho, não depende
-- de ter rodado a etapa 1 antes na mesma sessão.
--
-- O que faz:
--  1) Preenche "Data Início" (metadata_registro) em cada registro
--     de conclusão que tem um "Em Andamento" pareado.
--  2) Apaga os registros de "Em Andamento" que foram efetivamente
--     usados no pareamento (atividades + registro).
--
-- NÃO mexe em:
--  - Conclusões que já têm Data Início preenchida manualmente
--  - "Em Andamento" que não foi pareado com nenhuma conclusão
--    (visita ainda em aberto — fica intacto, sem ser apagado)
--
-- Tudo dentro de uma transação — se der erro no meio, desfaz tudo
-- automaticamente.
-- ============================================================

BEGIN;

CREATE TEMP TABLE tmp_pareamento (
  conclusao_id   bigint,
  andamento_id   bigint,
  data_inicio    date
);

DO $$
DECLARE
  se_id integer;
  reg RECORD;
  pendente_id bigint;
  pendente_data date;
BEGIN
  FOR se_id IN
    SELECT DISTINCT (metadata_registro->>'subestacao_id')::integer
    FROM f_prod_registro
    WHERE contrato_id = 21 AND metadata_registro->>'subestacao_id' IS NOT NULL
  LOOP
    pendente_id := NULL;
    pendente_data := NULL;
    FOR reg IN
      SELECT r.id, r.data_producao, r.metadata_registro,
        EXISTS (
          SELECT 1 FROM f_prod_atividades a JOIN d_atividades da ON da.id = a.atividade_id
          WHERE a.registro_id = r.id AND da.codigo_op = 'LSE-AND'
        ) AS tem_andamento,
        EXISTS (
          SELECT 1 FROM f_prod_atividades a JOIN d_atividades da ON da.id = a.atividade_id
          WHERE a.registro_id = r.id AND da.codigo_op = ANY(ARRAY['LSE-P','LSE-M','LSE-G','LSE-GG','LSE-XG','CQ-CHAV','CQ-MT','CQ-AT'])
        ) AS tem_conclusao
      FROM f_prod_registro r
      WHERE r.contrato_id = 21 AND (r.metadata_registro->>'subestacao_id')::integer = se_id
      ORDER BY r.data_producao
    LOOP
      IF reg.tem_conclusao THEN
        IF pendente_data IS NOT NULL AND (reg.metadata_registro->>'data_inicio') IS NULL THEN
          INSERT INTO tmp_pareamento (conclusao_id, andamento_id, data_inicio)
          VALUES (reg.id, pendente_id, pendente_data);
        END IF;
        pendente_id := NULL;
        pendente_data := NULL;
      ELSIF reg.tem_andamento THEN
        pendente_id := reg.id;
        pendente_data := reg.data_producao;
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Pareamentos encontrados: %', (SELECT count(*) FROM tmp_pareamento);
END $$;

-- 1) Preenche Data Início nos registros de conclusão
UPDATE f_prod_registro r
SET metadata_registro = COALESCE(r.metadata_registro, '{}'::jsonb)
  || jsonb_build_object('data_inicio', to_char(t.data_inicio, 'YYYY-MM-DD'))
FROM tmp_pareamento t
WHERE r.id = t.conclusao_id;

-- 2) Apaga as atividades e os registros de "Em Andamento" já usados
DELETE FROM f_prod_atividades WHERE registro_id IN (SELECT andamento_id FROM tmp_pareamento);
DELETE FROM f_prod_registro WHERE id IN (SELECT andamento_id FROM tmp_pareamento);

COMMIT;

-- Verificação final
SELECT
  count(*) FILTER (WHERE metadata_registro->>'data_inicio' IS NOT NULL) AS com_data_inicio,
  count(*) FILTER (WHERE metadata_registro->>'data_inicio' IS NULL) AS sem_data_inicio
FROM f_prod_registro
WHERE contrato_id = 21;
