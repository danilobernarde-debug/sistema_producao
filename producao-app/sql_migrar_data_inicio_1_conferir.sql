-- ============================================================
-- ETAPA 1 de 2 — SÓ CONFERÊNCIA, NÃO ALTERA NADA.
--
-- Calcula, pra cada visita antiga de Limpeza de Subestação, qual
-- seria a Data Início migrada (mesmo pareamento que o relatório já
-- usa: por subestação, em ordem cronológica, casa cada conclusão
-- com o "Em Andamento" mais recente ainda aberto).
--
-- Mostra quantas linhas seriam afetadas e uma amostra. Rode isso
-- primeiro e confira se os números fazem sentido antes de rodar a
-- etapa 2 (sql_migrar_data_inicio_2_aplicar.sql), que de fato
-- grava a Data Início e apaga os "Em Andamento" usados.
-- ============================================================

CREATE TEMP TABLE tmp_pareamento (
  conclusao_id   bigint,
  andamento_id   bigint,
  data_inicio    date,
  data_final     date,
  subestacao_id  integer
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
          INSERT INTO tmp_pareamento (conclusao_id, andamento_id, data_inicio, data_final, subestacao_id)
          VALUES (reg.id, pendente_id, pendente_data, reg.data_producao, se_id);
        END IF;
        pendente_id := NULL;
        pendente_data := NULL;
      ELSIF reg.tem_andamento THEN
        pendente_id := reg.id;
        pendente_data := reg.data_producao;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Quantos pareamentos foram encontrados (= quantos registros de
-- conclusão vão ganhar Data Início, e quantos "Em Andamento" vão
-- ser apagados na etapa 2)
SELECT count(*) AS total_pareamentos FROM tmp_pareamento;

-- Amostra pra conferir visualmente
SELECT t.*, se.nome AS subestacao
FROM tmp_pareamento t
LEFT JOIN d_subestacoes se ON se.id = t.subestacao_id
ORDER BY t.data_inicio
LIMIT 30;
