-- ============================================================
-- Preço com vigência para atividades FIXA — escopo: contrato de Faixa
-- Contexto completo em CONTEXTO_PROJETO.md > "Backlog — Preço com
-- vigência para atividades FIXA".
--
-- Decisão do usuário: aplicar por enquanto SÓ nas atividades FIXA do
-- contrato de Faixa (Limpeza de Faixa + as novas de Limpeza de
-- Subestação), não nas atividades FIXA dos demais contratos.
--
-- STATUS DESTE ARQUIVO:
--   PARTE 1 (tabela) e PARTE 2 (seed) — prontas para rodar como estão
--   (v_contrato_id já preenchido com 21, o contrato de Faixa).
--   PARTE 3 (trigger)  — AINDA NÃO ESCRITA. trigger_atualizar_upe
--   hoje copia d_atividades.UPE direto pra f_prod_atividades no
--   momento do lançamento (não olha data_producao). Preciso ver a
--   definição atual antes de escrever a substituição, pra não
--   quebrar o cálculo de UPE dos outros contratos que passam pelo
--   mesmo trigger. Rode isto no SQL editor do Supabase e me mande o
--   resultado:
--
--     SELECT pg_get_functiondef(oid)
--     FROM pg_proc
--     WHERE proname = 'trigger_atualizar_upe';
--
--   Assim que eu tiver a definição, escrevo a PARTE 3 (só o branch
--   FIXA muda; o branch UPE existente fica intocado) e aviso pra
--   rodar.
-- ============================================================


-- ============================================================
-- PARTE 1 — Histórico de preço por atividade (mesmo espírito de
-- d_contratos_preco_upe, só que por atividade em vez de contrato+LM/LV)
-- ============================================================

CREATE TABLE IF NOT EXISTS d_atividades_preco_fixa (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  atividade_id     integer NOT NULL REFERENCES d_atividades(id),
  valor            numeric(12,2) NOT NULL,
  vigencia_inicio  date NOT NULL,
  vigencia_fim     date,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  CHECK (vigencia_fim IS NULL OR vigencia_fim > vigencia_inicio)
);

COMMENT ON TABLE d_atividades_preco_fixa IS
  'Histórico de preço por vigência para atividades com tipo_upe_fixa = FIXA. Equivalente a d_contratos_preco_upe, mas chaveado por atividade_id. Usado pelo trigger_atualizar_upe para resolver o valor vigente na data_producao do lançamento, em vez do valor estático de d_atividades.UPE.';

-- Evita duas linhas com a mesma data de início pra mesma atividade
CREATE UNIQUE INDEX IF NOT EXISTS ux_atividades_preco_fixa_atividade_inicio
  ON d_atividades_preco_fixa (atividade_id, vigencia_inicio);

ALTER TABLE d_atividades_preco_fixa ENABLE ROW LEVEL SECURITY;

-- Leitura para todo usuário autenticado (mesmo padrão de config_campos)
CREATE POLICY "atividades_preco_fixa_select" ON d_atividades_preco_fixa FOR SELECT
  USING (auth.role() = 'authenticated');

-- Escrita só para super admin (mesmo padrão de config_campos_contrato)
CREATE POLICY "atividades_preco_fixa_write" ON d_atividades_preco_fixa FOR ALL
  USING (EXISTS (SELECT 1 FROM d_auth_user u WHERE u.uuid = auth.uid() AND u.is_super_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM d_auth_user u WHERE u.uuid = auth.uid() AND u.is_super_admin));


-- ============================================================
-- PARTE 2 — Seed: popula a vigência inicial para as atividades FIXA
-- já existentes do contrato de Faixa (não muda nada até o trigger da
-- PARTE 3 existir — até lá esta tabela fica só de referência/histórico).
-- ============================================================

DO $$
DECLARE
  v_contrato_id smallint := 21;  -- contrato de Faixa (confirmado pelo usuário, mesmo do outro script)
  v_inseridos    integer;
BEGIN
  IF v_contrato_id IS NULL THEN
    RAISE EXCEPTION 'Defina v_contrato_id (dentro deste bloco DO) antes de rodar este script.';
  END IF;

  -- Uma linha de vigência por atividade FIXA do contrato, com o UPE
  -- atual dela e vigência aberta (vigencia_inicio bem antiga, sem fim).
  -- Isso cobre tanto a Limpeza de Faixa já existente quanto as 8 novas
  -- de Limpeza de Subestação (rode sql_limpeza_subestacao.sql antes).
  INSERT INTO d_atividades_preco_fixa (atividade_id, valor, vigencia_inicio, vigencia_fim)
  SELECT a.id, a.UPE, DATE '2000-01-01', NULL
  FROM d_atividades a
  WHERE a.contrato_id = v_contrato_id
    AND a.tipo_upe_fixa = 'FIXA'
    AND a.UPE IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM d_atividades_preco_fixa p WHERE p.atividade_id = a.id);

  GET DIAGNOSTICS v_inseridos = ROW_COUNT;
  RAISE NOTICE 'OK — % atividade(s) FIXA do contrato % receberam vigência inicial.', v_inseridos, v_contrato_id;
END $$;

-- Quando o baremo reajustar de novo: em vez de editar d_atividades.UPE,
-- insira uma nova linha aqui com o novo valor e vigencia_inicio = data
-- do reajuste, e feche a linha anterior com vigencia_fim = essa mesma
-- data (tela de admin: Configurações > Preço Fixa por Vigência).


-- ============================================================
-- PARTE 3 — trigger_atualizar_upe com vigência (PENDENTE)
-- Aguardando a definição atual do trigger (ver instruções no topo
-- deste arquivo) antes de escrever a substituição.
-- ============================================================
