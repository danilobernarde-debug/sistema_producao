-- Preenche encarregado_id nos 1.168 lançamentos históricos de Limpeza
-- de Subestação (hoje todos NULL — nunca chegou a ser preenchido no
-- backfill original, não é referência quebrada). Usa o encarregado
-- real de cada equipe (cargo "ELETRICISTA ENCARREGADO A/B").
--
-- IMPORTANTE: rode sql_cadastrar_colaboradores_reais.sql ANTES deste
-- — precisa que cada uma das 6 equipes já tenha seu encarregado real
-- cadastrado com o cargo certo.

UPDATE f_prod_registro r
SET encarregado_id = enc.id
FROM d_colaboradores enc
JOIN d_colaboradores_funcao f ON f.id = enc.cargo_id
WHERE enc.equipe_id = r.equipe_id
  AND f.cargo ILIKE 'ELETRICISTA ENCARREGADO%'
  AND r.contrato_id = 21
  AND r.tipo_equipe_id = (SELECT id FROM d_tipo_equipe WHERE descricao = 'Limpeza de Subestação')
  AND r.encarregado_id IS NULL;

-- Verificação: sem_encarregado deve virar 0.
SELECT
  count(*) AS total_registros,
  count(*) FILTER (WHERE encarregado_id IS NULL) AS sem_encarregado,
  count(*) FILTER (WHERE encarregado_id IS NOT NULL AND c.id IS NULL) AS encarregado_orfao,
  count(*) FILTER (WHERE c.id IS NOT NULL) AS encarregado_valido
FROM f_prod_registro r
LEFT JOIN d_colaboradores c ON c.id = r.encarregado_id
WHERE r.contrato_id = 21
  AND r.tipo_equipe_id = (SELECT id FROM d_tipo_equipe WHERE descricao = 'Limpeza de Subestação');
