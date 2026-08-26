-- ============================================================
-- Módulo: Limpeza de Subestação
-- Contexto completo em CONTEXTO_PROJETO.md > "Backlog — Módulo
-- Limpeza de Subestação".
--
-- COMO RODAR:
--   Rode o arquivo inteiro de uma vez (PARTE 1 cria a tabela de
--   cadastro de subestações, PARTE 2 faz o seed). v_contrato_id já
--   está preenchido com 21 (contrato de Faixa, confirmado pelo
--   usuário) — só ajuste se esse número mudar.
--
-- As policies de RLS abaixo foram modeladas no padrão documentado
-- em CONTEXTO_PROJETO.md (d_auth_user.is_super_admin +
-- d_auth_contratos por contrato, igual d_obras). Não temos acesso
-- direto ao banco para comparar byte a byte com as policies reais
-- de d_obras — vale conferir/ajustar se algo não bater.
-- ============================================================


-- ============================================================
-- PARTE 1 — Cadastro de subestações
-- ============================================================

CREATE TABLE IF NOT EXISTS d_subestacoes (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome               text NOT NULL,
  municipio          text,
  contrato_id        smallint NOT NULL REFERENCES d_contratos(id),
  regional_id        smallint REFERENCES d_regional(id),
  porte              text NOT NULL CHECK (porte IN ('P', 'M', 'G', 'GG', 'XG')),
  tipo               text NOT NULL CHECK (tipo IN ('MT', 'AT', 'CHAVEAMENTO')),
  equipe_interna_id  integer REFERENCES d_equipes(id),
  is_ativo           boolean NOT NULL DEFAULT true,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nome, contrato_id)
);

COMMENT ON TABLE d_subestacoes IS
  'Cadastro de subestações atendidas pelo serviço de Limpeza de Subestação. Porte determina o preço de Roçagem/Limpeza; tipo determina o preço de Capina Química.';
COMMENT ON COLUMN d_subestacoes.porte IS
  'P = até 5.000 m², M = 5.001-15.000, G = 15.001-25.000, GG = 25.001-50.001, XG = acima de 50.001.';
COMMENT ON COLUMN d_subestacoes.tipo IS
  'Classe da subestação para preço de Capina Química: MT, AT ou CHAVEAMENTO.';

ALTER TABLE d_subestacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subestacoes_select" ON d_subestacoes;
CREATE POLICY "subestacoes_select" ON d_subestacoes FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM d_auth_user u WHERE u.uuid = auth.uid() AND u.is_super_admin)
    OR EXISTS (
      SELECT 1 FROM d_auth_contratos ac
      WHERE ac.user_uuid = auth.uid() AND ac.contrato_id = d_subestacoes.contrato_id AND ac.read
    )
  );

DROP POLICY IF EXISTS "subestacoes_insert" ON d_subestacoes;
CREATE POLICY "subestacoes_insert" ON d_subestacoes FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM d_auth_user u WHERE u.uuid = auth.uid() AND u.is_super_admin)
    OR EXISTS (
      SELECT 1 FROM d_auth_contratos ac
      WHERE ac.user_uuid = auth.uid() AND ac.contrato_id = d_subestacoes.contrato_id AND ac.insert
    )
  );

DROP POLICY IF EXISTS "subestacoes_update" ON d_subestacoes;
CREATE POLICY "subestacoes_update" ON d_subestacoes FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM d_auth_user u WHERE u.uuid = auth.uid() AND u.is_super_admin)
    OR EXISTS (
      SELECT 1 FROM d_auth_contratos ac
      WHERE ac.user_uuid = auth.uid() AND ac.contrato_id = d_subestacoes.contrato_id AND ac.update
    )
  );

DROP POLICY IF EXISTS "subestacoes_delete" ON d_subestacoes;
CREATE POLICY "subestacoes_delete" ON d_subestacoes FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM d_auth_user u WHERE u.uuid = auth.uid() AND u.is_super_admin)
    OR EXISTS (
      SELECT 1 FROM d_auth_contratos ac
      WHERE ac.user_uuid = auth.uid() AND ac.contrato_id = d_subestacoes.contrato_id AND ac.delete
    )
  );


-- ============================================================
-- PARTE 2 — Seed: tipo de equipe, atividades e campo dinâmico
-- ============================================================

DO $$
DECLARE
  v_contrato_id     smallint := 21;  -- contrato de Faixa (confirmado pelo usuário)
  v_tipo_equipe_id  bigint;
  v_campo_id        bigint;
BEGIN
  IF v_contrato_id IS NULL THEN
    RAISE EXCEPTION 'Defina v_contrato_id (dentro deste bloco DO) antes de rodar este script.';
  END IF;

  -- 1) Tipo de equipe — grupo_atividades = próprio id (auto-referência),
  --    é o que NovoRegistro.jsx usa para filtrar as atividades do tipo.
  --    Idempotente: reaproveita se já existir (ex: reexecução após erro).
  SELECT id INTO v_tipo_equipe_id FROM d_tipo_equipe WHERE descricao = 'Limpeza de Subestação';

  IF v_tipo_equipe_id IS NULL THEN
    INSERT INTO d_tipo_equipe (descricao, qtd_minima_colaboradores)
    VALUES ('Limpeza de Subestação', 1)
    RETURNING id INTO v_tipo_equipe_id;

    UPDATE d_tipo_equipe SET grupo_atividades = v_tipo_equipe_id WHERE id = v_tipo_equipe_id;
  END IF;

  -- 2) e 3) Atividades — Roçagem/Limpeza por porte + Capina Química por
  --    tipo (FIXA). Valores extraídos da planilha atual, vigência
  --    21/07/2025. IMPORTANTE: "DESCRICAO_BASICA_SISTEMA" e "UPE" são
  --    colunas com maiúsculas no nome real — precisam de aspas duplas,
  --    senão o Postgres procura a versão toda minúscula e erra.
  --    Idempotente: só semeia se este tipo de equipe ainda não tiver
  --    nenhuma atividade.
  --
  --    "UPE" hoje é numeric(10,6) (máx. 9999,999999) — o Porte XG
  --    (10.522,52) estoura isso. Alarga pra numeric(12,6), igual ao
  --    tipo de f_prod_atividades.upe. Não afeta valores já gravados
  --    (só amplia o limite) e é seguro rodar de novo (idempotente).
  ALTER TABLE d_atividades ALTER COLUMN "UPE" TYPE numeric(12,6);

  --    codigo_op também é NOT NULL na tabela real (não estava assim na
  --    documentação nem marcado obrigatório na tela de Atividades) —
  --    cada atividade nova recebe um código curto próprio (padrão LSE,
  --    igual aos códigos de equipe "LSEGO-xx" da planilha original).
  IF NOT EXISTS (SELECT 1 FROM d_atividades WHERE tipo_equipe_id = v_tipo_equipe_id) THEN
    INSERT INTO d_atividades (codigo_op, "DESCRICAO_BASICA_SISTEMA", contrato_id, unidade, tipo_upe_fixa, "UPE", tipo_equipe_id)
    VALUES
      ('LSE-P',      'Roçagem/Limpeza SE - Porte P',  v_contrato_id, 'un', 'FIXA', 5261.26,  v_tipo_equipe_id),
      ('LSE-M',      'Roçagem/Limpeza SE - Porte M',  v_contrato_id, 'un', 'FIXA', 7155.31,  v_tipo_equipe_id),
      ('LSE-G',      'Roçagem/Limpeza SE - Porte G',  v_contrato_id, 'un', 'FIXA', 7365.77,  v_tipo_equipe_id),
      ('LSE-GG',     'Roçagem/Limpeza SE - Porte GG', v_contrato_id, 'un', 'FIXA', 9891.17,  v_tipo_equipe_id),
      ('LSE-XG',     'Roçagem/Limpeza SE - Porte XG', v_contrato_id, 'un', 'FIXA', 10522.52, v_tipo_equipe_id),
      ('CQ-CHAV',    'Capina Química SE - Chaveamento', v_contrato_id, 'un', 'FIXA', 1052.25, v_tipo_equipe_id),
      ('CQ-MT',      'Capina Química SE - MT',          v_contrato_id, 'un', 'FIXA', 1578.38, v_tipo_equipe_id),
      ('CQ-AT',      'Capina Química SE - AT',          v_contrato_id, 'un', 'FIXA', 3314.59, v_tipo_equipe_id);
  END IF;

  -- 4) Campo dinâmico "Subestação" (dropdown -> d_subestacoes) no catálogo global.
  --    Não existe coluna "obrigatorio_padrao" na tabela real — o
  --    obrigatório é definido por contrato/tipo em config_campos_contrato
  --    (item 5 abaixo). is_coluna_real fica no default (false), que é o
  --    correto: o valor vai para metadata_registro, não uma coluna real.
  INSERT INTO config_campos (nome, label, tipo, tabela_ref, coluna_valor, coluna_label, placeholder)
  VALUES ('subestacao_id', 'Subestação', 'dropdown', 'd_subestacoes', 'id', 'nome', 'Selecione a subestação')
  ON CONFLICT (nome) DO UPDATE SET tabela_ref = EXCLUDED.tabela_ref
  RETURNING id INTO v_campo_id;

  -- 5) Vincula o campo ao contrato + tipo de equipe, na seção "registro"
  INSERT INTO config_campos_contrato (campo_id, contrato_id, tipo_equipe_id, secao, obrigatorio, ordem)
  VALUES (v_campo_id, v_contrato_id, v_tipo_equipe_id, 'registro', true, 1)
  ON CONFLICT (campo_id, contrato_id, tipo_equipe_id, secao) DO NOTHING;

  RAISE NOTICE 'OK — tipo_equipe_id = %, contrato_id = %, campo_id (subestacao_id) = %',
    v_tipo_equipe_id, v_contrato_id, v_campo_id;
END $$;

-- Depois de rodar: cadastre as subestações em Configurações > Subestações
-- (tela nova, com importação em massa por XLSX) antes de liberar o
-- lançamento para as equipes.


-- ============================================================
-- PARTE 3 — Equipes internas de Limpeza de Subestação
-- Extraídas da aba "Valores" da planilha original (código LSEGO-xx +
-- encarregado + regional). "LSEGO-00" fica de fora: nos dados reais
-- aparece só como código secundário/genérico misturado em algumas
-- linhas, não como equipe própria com encarregado definido.
-- ============================================================

DO $$
DECLARE
  v_contrato_id     smallint := 21;  -- contrato de Faixa
  v_tipo_equipe_id  bigint;
  v_inseridos       integer;
BEGIN
  SELECT id INTO v_tipo_equipe_id FROM d_tipo_equipe WHERE descricao = 'Limpeza de Subestação';
  IF v_tipo_equipe_id IS NULL THEN
    RAISE EXCEPTION 'Tipo de equipe "Limpeza de Subestação" não encontrado — rode a PARTE 2 primeiro.';
  END IF;

  INSERT INTO d_equipes (equipe, sistema_producao, tipo_equipe_id, contrato_id, estado, is_ativo)
  SELECT v.nome, v.nome, v_tipo_equipe_id, v_contrato_id, 'GO', true
  FROM (VALUES
    ('LSEGO-01 - Joaquim'),
    ('LSEGO-02 - Gustavo'),
    ('LSEGO-03 - Ozéias'),
    ('LSEGO-04 - Leonardo'),
    ('LSEGO-06 - Eduardo'),
    ('LSEGO-09 - Hélio')
  ) AS v(nome)
  WHERE NOT EXISTS (
    SELECT 1 FROM d_equipes e
    WHERE e.tipo_equipe_id = v_tipo_equipe_id AND e.equipe = v.nome
  );

  GET DIAGNOSTICS v_inseridos = ROW_COUNT;
  RAISE NOTICE 'OK — % equipe(s) nova(s) cadastrada(s) para tipo_equipe_id = %', v_inseridos, v_tipo_equipe_id;
END $$;

-- Nota: as 369 subestações importadas antes tentaram linkar
-- "equipe_interna" pelo texto "LSEGO-xx" puro, mas essas equipes não
-- existiam ainda — então equipe_interna_id deve ter ficado em branco
-- pra maioria. Isso é só metadado informativo (não afeta lançamento
-- nem preço); se quiser, faço uma atualização depois pra linkar pelo
-- código.


-- ============================================================
-- PARTE 5 — Campo "OS" no lançamento
-- Já existe no catálogo global (config_campos, usado por outros
-- contratos) — só falta vincular ao nosso tipo de equipe.
-- ============================================================

DO $$
DECLARE
  v_contrato_id     smallint := 21;
  v_tipo_equipe_id  bigint;
  v_campo_id        bigint;
BEGIN
  SELECT id INTO v_tipo_equipe_id FROM d_tipo_equipe WHERE descricao = 'Limpeza de Subestação';
  IF v_tipo_equipe_id IS NULL THEN
    RAISE EXCEPTION 'Tipo de equipe "Limpeza de Subestação" não encontrado — rode a PARTE 2 primeiro.';
  END IF;

  SELECT id INTO v_campo_id FROM config_campos WHERE nome = 'os';
  IF v_campo_id IS NULL THEN
    RAISE EXCEPTION 'Campo "os" não encontrado em config_campos — confira o nome exato antes de continuar.';
  END IF;

  INSERT INTO config_campos_contrato (campo_id, contrato_id, tipo_equipe_id, secao, obrigatorio, ordem)
  VALUES (v_campo_id, v_contrato_id, v_tipo_equipe_id, 'registro', false, 2)
  ON CONFLICT (campo_id, contrato_id, tipo_equipe_id, secao) DO NOTHING;

  RAISE NOTICE 'OK — campo "os" vinculado ao tipo_equipe_id = %', v_tipo_equipe_id;
END $$;


-- ============================================================
-- PARTE 6 — Encarregados (d_colaboradores) das 6 equipes internas
-- Necessário pro campo "Encarregado" do lançamento funcionar. Nomes
-- extraídos da aba "Valores" da planilha original. "matricula" é
-- numérico no banco real (não texto) — não temos matrícula real de
-- RH na planilha, então uso uma faixa reservada (9001-9006) só como
-- placeholder; o código LSEGO fica visível entre parênteses no nome
-- pra identificação. Troque pela matrícula real quando tiver.
-- ============================================================

DO $$
DECLARE
  v_tipo_equipe_id  bigint;
  v_inseridos       integer;
BEGIN
  SELECT id INTO v_tipo_equipe_id FROM d_tipo_equipe WHERE descricao = 'Limpeza de Subestação';
  IF v_tipo_equipe_id IS NULL THEN
    RAISE EXCEPTION 'Tipo de equipe "Limpeza de Subestação" não encontrado — rode a PARTE 2 primeiro.';
  END IF;

  INSERT INTO d_colaboradores (nome, matricula, equipe_id, is_ativo)
  SELECT v.nome, v.matricula, e.id, true
  FROM (VALUES
    ('Joaquim (LSEGO-01)',  9001, 'LSEGO-01 - Joaquim'),
    ('Gustavo (LSEGO-02)',  9002, 'LSEGO-02 - Gustavo'),
    ('Ozéias (LSEGO-03)',   9003, 'LSEGO-03 - Ozéias'),
    ('Leonardo (LSEGO-04)', 9004, 'LSEGO-04 - Leonardo'),
    ('Eduardo (LSEGO-06)',  9005, 'LSEGO-06 - Eduardo'),
    ('Hélio (LSEGO-09)',    9006, 'LSEGO-09 - Hélio')
  ) AS v(nome, matricula, equipe_nome)
  JOIN d_equipes e ON e.tipo_equipe_id = v_tipo_equipe_id AND e.equipe = v.equipe_nome
  WHERE NOT EXISTS (
    SELECT 1 FROM d_colaboradores c WHERE c.matricula = v.matricula
  );

  GET DIAGNOSTICS v_inseridos = ROW_COUNT;
  RAISE NOTICE 'OK — % encarregado(s) cadastrado(s).', v_inseridos;
END $$;


-- ============================================================
-- PARTE 4 — Atividade "Em Andamento" (dia trabalhado sem conclusão)
-- O formulário de lançamento sempre exige pelo menos 1 atividade
-- selecionada (não dá pra salvar um registro com a lista vazia) —
-- então "sem nenhuma atividade lançada" nos dias em andamento não é
-- viável na prática. Esta atividade resolve isso: valor sempre zero
-- (UPE=0) e referencia_codigo='justificativa' faz o trigger já
-- existente (atualizar_is_justificativa) marcar is_justificativa=true
-- automaticamente — mesmo mecanismo já usado pra chuva/falta de
-- material, exclui dos relatórios de produção real.
-- ============================================================

DO $$
DECLARE
  v_contrato_id     smallint := 21;  -- contrato de Faixa
  v_tipo_equipe_id  bigint;
BEGIN
  SELECT id INTO v_tipo_equipe_id FROM d_tipo_equipe WHERE descricao = 'Limpeza de Subestação';
  IF v_tipo_equipe_id IS NULL THEN
    RAISE EXCEPTION 'Tipo de equipe "Limpeza de Subestação" não encontrado — rode a PARTE 2 primeiro.';
  END IF;

  INSERT INTO d_atividades (codigo_op, "DESCRICAO_BASICA_SISTEMA", contrato_id, unidade, tipo_upe_fixa, "UPE", tipo_equipe_id, referencia_codigo)
  SELECT 'LSE-AND', 'Em Andamento - Sem Produção', v_contrato_id, 'un', 'FIXA', 0, v_tipo_equipe_id, 'justificativa'
  WHERE NOT EXISTS (
    SELECT 1 FROM d_atividades WHERE tipo_equipe_id = v_tipo_equipe_id AND codigo_op = 'LSE-AND'
  );

  RAISE NOTICE 'OK — atividade "Em Andamento" cadastrada para tipo_equipe_id = %', v_tipo_equipe_id;
END $$;
