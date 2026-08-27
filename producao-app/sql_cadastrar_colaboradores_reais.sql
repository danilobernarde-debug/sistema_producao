-- Cadastra o roster real de colaboradores de Limpeza de Subestação
-- (20 pessoas, planilha "Colaboradores.xlsx" fornecida pelo usuário),
-- substituindo os 6 encarregados-placeholder (matrícula 9001-9006,
-- sem dado real de RH) pelos dados reais e adicionando os 14
-- trabalhadores de campo que faltavam.
--
-- ACHADO IMPORTANTE: o encarregado que eu tinha cadastrado como
-- "Eduardo" na equipe LSEGO-06 aparece no roster real como encarregado
-- da equipe LSEGO-07 (mesmo nome completo: Eduardo Rodrigues dos
-- Passos) — não existe LSEGO-06 no roster real nem LSEGO-07 no que eu
-- tinha. A planilha histórica original parece ter tido o código
-- errado. PARTE 1 corrige isso renomeando a equipe já existente (não
-- cria uma nova) — mantém intacto todo o histórico já lançado com
-- essa equipe, só corrige o rótulo/código.

-- ============================================================
-- PARTE 1 — Corrige o código da equipe do Eduardo: LSEGO-06 → LSEGO-07
-- ============================================================
UPDATE d_equipes
SET equipe = 'LSEGO-07 - Eduardo', sistema_producao = 'LSEGO-07 - Eduardo'
WHERE equipe = 'LSEGO-06 - Eduardo'
  AND tipo_equipe_id = (SELECT id FROM d_tipo_equipe WHERE descricao = 'Limpeza de Subestação');

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
-- PARTE 3 — Atualiza os 6 encarregados-placeholder com dados reais
-- (casa pela matrícula placeholder que eu mesmo criei: 9001-9006)
-- ============================================================
UPDATE d_colaboradores c
SET matricula = v.matricula_real,
    nome      = v.nome,
    cargo_id  = (SELECT id FROM d_colaboradores_funcao WHERE upper(trim(cargo)) = v.cargo)
FROM (VALUES
  (9005, 3140, 'EDUARDO RODRIGUES DOS PASSOS',       'ELETRICISTA ENCARREGADO A'),
  (9006, 2936, 'FRANCISCO HELIO DE OLIVEIRA',         'ELETRICISTA ENCARREGADO A'),
  (9002, 2493, 'GUSTAVO HENRIQUE PEREIRA MACHADO',    'ELETRICISTA ENCARREGADO B'),
  (9001, 2480, 'JOAQUIM TEIXEIRA DA ROCHA',           'ELETRICISTA ENCARREGADO B'),
  (9004, 2788, 'LEONARDO BRUNO MENDONCA DE FREITAS',  'ELETRICISTA ENCARREGADO A'),
  (9003, 1542, 'OZEIAS EUZEBIO',                       'ELETRICISTA ENCARREGADO A')
) AS v(matricula_placeholder, matricula_real, nome, cargo)
WHERE c.matricula = v.matricula_placeholder;

-- ============================================================
-- PARTE 4 — Insere os 14 novos colaboradores (trabalhadores de campo)
-- ============================================================
DO $$
DECLARE
  v_tipo_equipe_id  bigint;
  v_inseridos       integer;
BEGIN
  SELECT id INTO v_tipo_equipe_id FROM d_tipo_equipe WHERE descricao = 'Limpeza de Subestação';
  IF v_tipo_equipe_id IS NULL THEN
    RAISE EXCEPTION 'Tipo de equipe "Limpeza de Subestação" não encontrado.';
  END IF;

  INSERT INTO d_colaboradores (matricula, nome, equipe_id, cargo_id, is_ativo)
  SELECT v.matricula, v.nome, e.id,
    (SELECT id FROM d_colaboradores_funcao WHERE upper(trim(cargo)) = v.cargo),
    true
  FROM (VALUES
    (2950, 'ADAO CHAVE DOS SANTOS',               'LSEGO-09', 'AJUDANTE DE SERVICOS GERAIS'),
    (2934, 'ALEF DA SILVA GOMES',                 'LSEGO-04', 'AJUDANTE DE SERVICOS GERAIS'),
    (3190, 'DANIEL LOUBACH BATISTA DOS SANTOS',   'LSEGO-07', 'AJUDANTE DE SERVICOS GERAIS'),
    (2948, 'DIONES BOCK',                         'LSEGO-09', 'AJUDANTE DE SERVICOS GERAIS'),
    (2525, 'EIDIMAR ELIAS DA SILVA',               'LSEGO-02', 'AJUDANTE DE SERVICOS GERAIS'),
    (1884, 'ELISVALDO SOUSA SILVA',                'LSEGO-03', 'AJUDANTE DE SERVICOS GERAIS'),
    (3173, 'ELIVALDO DE SOUSA MACHADO',            'LSEGO-01', 'AJUDANTE DE SERVICOS GERAIS'),
    (3169, 'FRANCISCO JOSE SANTOS SILVA',          'LSEGO-02', 'AJUDANTE DE SERVICOS GERAIS'),
    (3189, 'IDENI FERREIRA',                       'LSEGO-07', 'AJUDANTE DE SERVICOS GERAIS'),
    (2670, 'IVALDO PEREIRA DO NASCIMENTO',         'LSEGO-07', 'AJUDANTE DE SERVICOS GERAIS'),
    (1638, 'JOAO DA SILVA',                        'LSEGO-03', 'AJUDANTE DE SERVICOS GERAIS'),
    (2803, 'JOSE ERIVANALDO DE MELO',              'LSEGO-04', 'AJUDANTE DE SERVICOS GERAIS'),
    (2038, 'MARCELO GOMES PEREIRA',                'LSEGO-07', 'AJUDANTE DE SERVICOS GERAIS'),
    (2790, 'WALLACE DAVID DA SILVA',               'LSEGO-04', 'AJUDANTE DE SERVICOS GERAIS')
  ) AS v(matricula, nome, equipe_codigo, cargo)
  JOIN d_equipes e ON e.tipo_equipe_id = v_tipo_equipe_id AND e.equipe LIKE v.equipe_codigo || '%'
  WHERE NOT EXISTS (SELECT 1 FROM d_colaboradores c WHERE c.matricula = v.matricula);

  GET DIAGNOSTICS v_inseridos = ROW_COUNT;
  RAISE NOTICE 'OK — % colaborador(es) novo(s) inserido(s).', v_inseridos;
END $$;

-- Verificação: 20 colaboradores ativos no total, agrupados por equipe.
SELECT e.equipe, count(*) AS colaboradores
FROM d_colaboradores c
JOIN d_equipes e ON e.id = c.equipe_id
WHERE e.tipo_equipe_id = (SELECT id FROM d_tipo_equipe WHERE descricao = 'Limpeza de Subestação')
  AND c.is_ativo
GROUP BY e.equipe
ORDER BY e.equipe;
