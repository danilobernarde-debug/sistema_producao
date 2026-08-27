-- CORREÇÃO: equipe_regional não é atributo fixo da subestação — é da
-- visita/lançamento. No histórico, 21 das 369 subestações têm mais de 1
-- valor de EQUIPE entre visitas diferentes (a equipe despachada mudou ao
-- longo do tempo), então um campo fixo por subestação estava errado.
-- Substitui sql_add_equipe_regional_subestacoes.sql (não rode aquele
-- arquivo se ainda não rodou; se já rodou, este script desfaz).
--
-- Novo desenho: campo dinâmico no lançamento (config_campos), igual ao
-- campo "OS" — o usuário escolhe ao cadastrar o registro diário, não no
-- cadastro da subestação. Não precisa mexer em NovoRegistro.jsx nem
-- EditarRegistro.jsx: o formulário já renderiza qualquer campo vinculado
-- via config_campos_contrato automaticamente.

-- 1) Desfaz o campo no cadastro de subestações
ALTER TABLE d_subestacoes DROP COLUMN IF EXISTS equipe_regional;

-- 2) Cadastra o campo dinâmico + vincula ao lançamento (seção "registro")
DO $$
DECLARE
  v_contrato_id     smallint := 21;  -- contrato de Faixa
  v_tipo_equipe_id  bigint;
  v_campo_id        bigint;
BEGIN
  SELECT id INTO v_tipo_equipe_id FROM d_tipo_equipe WHERE descricao = 'Limpeza de Subestação';
  IF v_tipo_equipe_id IS NULL THEN
    RAISE EXCEPTION 'Tipo de equipe "Limpeza de Subestação" não encontrado — rode sql_limpeza_subestacao.sql primeiro.';
  END IF;

  -- tipo='select' = dropdown de opções fixas (não usa tabela_ref) — o
  -- componente CampoDinamico.jsx faz opcoes.split(',') pra montar a lista.
  INSERT INTO config_campos (nome, label, tipo, opcoes, placeholder)
  VALUES ('equipe_regional', 'Equipe Regional', 'select', 'AT - SUD 04,CENTRO,NORDESTE,NORTE,SUL', 'Selecione...')
  ON CONFLICT (nome) DO UPDATE SET opcoes = EXCLUDED.opcoes, tipo = EXCLUDED.tipo
  RETURNING id INTO v_campo_id;

  INSERT INTO config_campos_contrato (campo_id, contrato_id, tipo_equipe_id, secao, obrigatorio, ordem)
  VALUES (v_campo_id, v_contrato_id, v_tipo_equipe_id, 'registro', false, 3)
  ON CONFLICT (campo_id, contrato_id, tipo_equipe_id, secao) DO NOTHING;

  RAISE NOTICE 'OK — campo "equipe_regional" (select) vinculado ao tipo_equipe_id = %, campo_id = %',
    v_tipo_equipe_id, v_campo_id;
END $$;

-- Verificação: deve retornar 1 linha, secao='registro', obrigatorio=false, ordem=3.
SELECT cc.secao, cc.obrigatorio, cc.ordem, c.tipo, c.opcoes
FROM config_campos_contrato cc
JOIN config_campos c ON c.id = cc.campo_id
WHERE c.nome = 'equipe_regional' AND cc.contrato_id = 21;
