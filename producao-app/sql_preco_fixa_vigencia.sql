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
DROP POLICY IF EXISTS "atividades_preco_fixa_select" ON d_atividades_preco_fixa;
CREATE POLICY "atividades_preco_fixa_select" ON d_atividades_preco_fixa FOR SELECT
  USING (auth.role() = 'authenticated');

-- Escrita só para super admin (mesmo padrão de config_campos_contrato)
DROP POLICY IF EXISTS "atividades_preco_fixa_write" ON d_atividades_preco_fixa;
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
  -- "UPE" tem maiúscula no nome real da coluna — precisa de aspas.
  INSERT INTO d_atividades_preco_fixa (atividade_id, valor, vigencia_inicio, vigencia_fim)
  SELECT a.id, a."UPE", DATE '2000-01-01', NULL
  FROM d_atividades a
  WHERE a.contrato_id = v_contrato_id
    AND a.tipo_upe_fixa = 'FIXA'
    AND a."UPE" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM d_atividades_preco_fixa p WHERE p.atividade_id = a.id);

  GET DIAGNOSTICS v_inseridos = ROW_COUNT;
  RAISE NOTICE 'OK — % atividade(s) FIXA do contrato % receberam vigência inicial.', v_inseridos, v_contrato_id;
END $$;

-- Quando o baremo reajustar de novo: em vez de editar d_atividades.UPE,
-- insira uma nova linha aqui com o novo valor e vigencia_inicio = data
-- do reajuste, e feche a linha anterior com vigencia_fim = essa mesma
-- data (tela de admin: Configurações > Preço Fixa por Vigência).


-- ============================================================
-- PARTE 3 — trigger_atualizar_upe com vigência
-- ============================================================
--
-- Definição original (função real por trás do trigger
-- "trigger_atualizar_upe" é "atualizar_upe_f_prod_serv", obtida em
-- 2026-08-26 via pg_get_functiondef):
--
--   CREATE OR REPLACE FUNCTION public.atualizar_upe_f_prod_serv()
--    RETURNS trigger
--    LANGUAGE plpgsql
--   AS $function$BEGIN
--       UPDATE f_prod_atividades
--       SET upe = (
--           SELECT d."UPE"
--           FROM d_atividades d
--           WHERE d.id = NEW.atividade_id
--       )
--       WHERE id = NEW.id;
--       RETURN NEW;
--   END;$function$
--
-- Ela só mantém "upe" = d_atividades."UPE" (valor atual), sem olhar
-- data_producao nem tipo_upe_fixa. Quem decide o preço final é o
-- FRONTEND (NovoRegistro.jsx/EditarRegistro.jsx): pra atividades UPE,
-- já resolve por vigência via d_contratos_preco_upe; pra atividades
-- FIXA, manda preco_upe=1 e confia no "upe" — que esse trigger
-- imediatamente sobrescreve com o valor atual. Por isso a correção
-- tem que ser aqui, não só no frontend.
--
-- A troca abaixo é ADITIVA: primeiro tenta achar um preço vigente em
-- d_atividades_preco_fixa pra data_producao do registro; só usa isso
-- se achar. Se não achar nada (é o caso de toda atividade fora do
-- escopo desta migração — outros contratos, ou tipo UPE), cai
-- exatamente no comportamento original, sem nenhuma mudança.
CREATE OR REPLACE FUNCTION public.atualizar_upe_f_prod_serv()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_data_producao date;
  v_preco_fixa    numeric;
BEGIN
  SELECT r.data_producao INTO v_data_producao
  FROM f_prod_registro r
  WHERE r.id = NEW.registro_id;

  SELECT p.valor INTO v_preco_fixa
  FROM d_atividades_preco_fixa p
  WHERE p.atividade_id = NEW.atividade_id
    AND p.vigencia_inicio <= v_data_producao
    AND (p.vigencia_fim IS NULL OR p.vigencia_fim > v_data_producao)
  ORDER BY p.vigencia_inicio DESC
  LIMIT 1;

  IF v_preco_fixa IS NOT NULL THEN
    UPDATE f_prod_atividades SET upe = v_preco_fixa WHERE id = NEW.id;
  ELSE
    UPDATE f_prod_atividades
    SET upe = (
        SELECT d."UPE"
        FROM d_atividades d
        WHERE d.id = NEW.atividade_id
    )
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Não precisa recriar o CREATE TRIGGER em si — CREATE OR REPLACE
-- FUNCTION preserva o trigger já existente (timing/evento/condição),
-- só troca a lógica de dentro.
