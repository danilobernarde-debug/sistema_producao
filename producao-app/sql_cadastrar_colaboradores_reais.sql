-- Cadastra o roster real de colaboradores de Limpeza de Subestação
-- (20 pessoas, planilha "Colaboradores.xlsx" fornecida pelo usuário).
--
-- REESCRITO (v2): a primeira versão deste script usava um único UPDATE
-- multi-linha pros 6 encarregados — quando uma linha deu conflito de
-- matrícula/nome (Ozéias, matrícula 1542, já existia no banco em outra
-- equipe), o Postgres desfez o UPDATE inteiro, e os 6 placeholders
-- sumiram sem os dados reais entrarem no lugar. Essa versão processa
-- pessoa por pessoa (UPDATE se já existe pela matrícula, senão INSERT),
-- com tratamento de erro individual — um conflito isolado não trava
-- os outros. Idempotente, seguro rodar de novo.
--
-- ACHADOS desta importação:
-- 1) O código real da equipe do Eduardo é LSEGO-07, não LSEGO-06 (a
--    planilha histórica usada na importação original das equipes tinha
--    o código errado). PARTE 1 corrige renomeando a equipe existente.
-- 2) 5 pessoas do roster (Ozéias/1542, João da Silva/1638, Elisvaldo/
--    1884, Marcelo/2038, Eidimar/2525) já existiam no banco vinculadas
--    a outras equipes (FXGO-02, FXTO-08, FXGO-12, FXMS-02) — parecem
--    ter sido remanejados pra Limpeza de Subestação sem atualização de
--    cadastro. Este script move a equipe_id delas pra LSEGO
--    correspondente (a planilha do usuário é a fonte da verdade atual).
-- 3) A matrícula 2803 já pertencia a "FAGNER CABRAL DA SILVA" (matrícula
--    correta dele: 2808, conforme confirmado pelo usuário) — PARTE 1.5
--    corrige isso antes de cadastrar "JOSE ERIVANALDO DE MELO" (2803).

-- ============================================================
-- PARTE 1 — Corrige o código da equipe do Eduardo: LSEGO-06 → LSEGO-07
-- ============================================================
UPDATE d_equipes
SET equipe = 'LSEGO-07 - Eduardo', sistema_producao = 'LSEGO-07 - Eduardo'
WHERE equipe = 'LSEGO-06 - Eduardo'
  AND tipo_equipe_id = (SELECT id FROM d_tipo_equipe WHERE descricao = 'Limpeza de Subestação');

-- ============================================================
-- PARTE 1.5 — Corrige a matrícula do Fagner (já cadastrado, matrícula
-- errada) pra liberar a 2803 pro José Erivanaldo de Melo.
-- ============================================================
UPDATE d_colaboradores
SET matricula = 2808
WHERE matricula = 2803 AND nome ILIKE 'FAGNER CABRAL DA SILVA%';

-- ============================================================
-- PARTE 2 — Garante os 3 cargos reais em d_colaboradores_funcao
-- ============================================================
INSERT INTO d_colaboradores_funcao (cargo)
SELECT v.cargo
FROM (VALUES ('AJUDANTE DE SERVICOS GERAIS'), ('ELETRICISTA ENCARREGADO A'), ('ELETRICISTA ENCARREGADO B')) AS v(cargo)
WHERE NOT EXISTS (
  SELECT 1 FROM d_colaboradores_funcao f WHERE upper(trim(f.cargo)) = v.cargo
);

-- ============================================================
-- PARTE 3 — Upsert das 20 pessoas (UPDATE se a matrícula já existe,
-- senão INSERT) — pessoa por pessoa, com tratamento de erro individual.
-- ============================================================
DO $$
DECLARE
  v_tipo_equipe_id  bigint;
  r                 RECORD;
  v_id              bigint;
  v_equipe_id       bigint;
  v_cargo_id        bigint;
  v_atualizados     integer := 0;
  v_inseridos       integer := 0;
  v_erros           integer := 0;
BEGIN
  SELECT id INTO v_tipo_equipe_id FROM d_tipo_equipe WHERE descricao = 'Limpeza de Subestação';
  IF v_tipo_equipe_id IS NULL THEN
    RAISE EXCEPTION 'Tipo de equipe "Limpeza de Subestação" não encontrado.';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      (2480, 'JOAQUIM TEIXEIRA DA ROCHA',           'LSEGO-01', 'ELETRICISTA ENCARREGADO B'),
      (3173, 'ELIVALDO DE SOUSA MACHADO',           'LSEGO-01', 'AJUDANTE DE SERVICOS GERAIS'),
      (2493, 'GUSTAVO HENRIQUE PEREIRA MACHADO',    'LSEGO-02', 'ELETRICISTA ENCARREGADO B'),
      (2525, 'EIDIMAR ELIAS DA SILVA',               'LSEGO-02', 'AJUDANTE DE SERVICOS GERAIS'),
      (3169, 'FRANCISCO JOSE SANTOS SILVA',          'LSEGO-02', 'AJUDANTE DE SERVICOS GERAIS'),
      (1542, 'OZEIAS EUZEBIO',                       'LSEGO-03', 'ELETRICISTA ENCARREGADO A'),
      (1884, 'ELISVALDO SOUSA SILVA',                'LSEGO-03', 'AJUDANTE DE SERVICOS GERAIS'),
      (1638, 'JOAO DA SILVA',                        'LSEGO-03', 'AJUDANTE DE SERVICOS GERAIS'),
      (2788, 'LEONARDO BRUNO MENDONCA DE FREITAS',   'LSEGO-04', 'ELETRICISTA ENCARREGADO A'),
      (2934, 'ALEF DA SILVA GOMES',                  'LSEGO-04', 'AJUDANTE DE SERVICOS GERAIS'),
      (2803, 'JOSE ERIVANALDO DE MELO',              'LSEGO-04', 'AJUDANTE DE SERVICOS GERAIS'),
      (2790, 'WALLACE DAVID DA SILVA',               'LSEGO-04', 'AJUDANTE DE SERVICOS GERAIS'),
      (3140, 'EDUARDO RODRIGUES DOS PASSOS',         'LSEGO-07', 'ELETRICISTA ENCARREGADO A'),
      (3190, 'DANIEL LOUBACH BATISTA DOS SANTOS',    'LSEGO-07', 'AJUDANTE DE SERVICOS GERAIS'),
      (3189, 'IDENI FERREIRA',                       'LSEGO-07', 'AJUDANTE DE SERVICOS GERAIS'),
      (2670, 'IVALDO PEREIRA DO NASCIMENTO',         'LSEGO-07', 'AJUDANTE DE SERVICOS GERAIS'),
      (2038, 'MARCELO GOMES PEREIRA',                'LSEGO-07', 'AJUDANTE DE SERVICOS GERAIS'),
      (2936, 'FRANCISCO HELIO DE OLIVEIRA',          'LSEGO-09', 'ELETRICISTA ENCARREGADO A'),
      (2950, 'ADAO CHAVE DOS SANTOS',                'LSEGO-09', 'AJUDANTE DE SERVICOS GERAIS'),
      (2948, 'DIONES BOCK',                          'LSEGO-09', 'AJUDANTE DE SERVICOS GERAIS')
    ) AS t(matricula, nome, equipe_codigo, cargo)
  LOOP
    BEGIN
      SELECT id INTO v_equipe_id FROM d_equipes WHERE tipo_equipe_id = v_tipo_equipe_id AND equipe LIKE r.equipe_codigo || '%';
      IF v_equipe_id IS NULL THEN
        RAISE WARNING 'Equipe % não encontrada — pulando %', r.equipe_codigo, r.nome;
        v_erros := v_erros + 1;
        CONTINUE;
      END IF;

      SELECT id INTO v_cargo_id FROM d_colaboradores_funcao WHERE upper(trim(cargo)) = r.cargo;

      SELECT id INTO v_id FROM d_colaboradores WHERE matricula = r.matricula;

      IF v_id IS NOT NULL THEN
        UPDATE d_colaboradores
        SET nome = r.nome, equipe_id = v_equipe_id, cargo_id = v_cargo_id, is_ativo = true
        WHERE id = v_id;
        v_atualizados := v_atualizados + 1;
      ELSE
        INSERT INTO d_colaboradores (matricula, nome, equipe_id, cargo_id, is_ativo)
        VALUES (r.matricula, r.nome, v_equipe_id, v_cargo_id, true);
        v_inseridos := v_inseridos + 1;
      END IF;
    EXCEPTION WHEN unique_violation THEN
      v_erros := v_erros + 1;
      RAISE WARNING 'Conflito ao gravar % (matrícula %): %', r.nome, r.matricula, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'OK — % atualizados, % inseridos, % erros.', v_atualizados, v_inseridos, v_erros;
END $$;

-- ============================================================
-- Verificação 1: 20 colaboradores ativos, distribuídos pelas 6 equipes.
-- ============================================================
SELECT e.equipe, count(*) AS colaboradores
FROM d_colaboradores c
JOIN d_equipes e ON e.id = c.equipe_id
WHERE e.tipo_equipe_id = (SELECT id FROM d_tipo_equipe WHERE descricao = 'Limpeza de Subestação')
  AND c.is_ativo
GROUP BY e.equipe
ORDER BY e.equipe;

-- ============================================================
-- Verificação 2 (achado à parte, não corrigido por este script):
-- quantos dos 1.170 lançamentos históricos têm encarregado_id que não
-- aponta mais pra ninguém (órfão) — precisa de decisão separada sobre
-- como corrigir.
-- ============================================================
SELECT
  count(*) AS total_registros,
  count(*) FILTER (WHERE encarregado_id IS NULL) AS sem_encarregado,
  count(*) FILTER (WHERE encarregado_id IS NOT NULL AND c.id IS NULL) AS encarregado_orfao,
  count(*) FILTER (WHERE c.id IS NOT NULL) AS encarregado_valido
FROM f_prod_registro r
LEFT JOIN d_colaboradores c ON c.id = r.encarregado_id
WHERE r.contrato_id = 21
  AND r.tipo_equipe_id = (SELECT id FROM d_tipo_equipe WHERE descricao = 'Limpeza de Subestação');
