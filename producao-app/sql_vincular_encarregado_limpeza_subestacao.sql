-- Vincula o campo "Encarregado" (já existe no catálogo global —
-- config_campos, usado por outros contratos, tratado como caso
-- especial em NovoRegistro.jsx/EditarRegistro.jsx com seletor
-- próprio) ao tipo de equipe "Limpeza de Subestação" no contrato de
-- Faixa. Sem esse vínculo em config_campos_contrato, o formulário
-- nunca mostra o seletor — o "Colaboradores Presentes" já funciona
-- automaticamente (não depende de config_campos), esse aqui era o
-- único campo faltando.
--
-- obrigatorio = true: todo lançamento passa a exigir um encarregado
-- responsável (mesmo padrão do campo "Subestação", que também é
-- obrigatório — diferente de "OS"/"Equipe Regional", que são
-- informativos e ficaram opcionais).

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

  SELECT id INTO v_campo_id FROM config_campos WHERE nome = 'encarregado_id';
  IF v_campo_id IS NULL THEN
    RAISE EXCEPTION 'Campo "encarregado_id" não encontrado em config_campos — confira o nome exato antes de continuar.';
  END IF;

  INSERT INTO config_campos_contrato (campo_id, contrato_id, tipo_equipe_id, secao, obrigatorio, ordem)
  VALUES (v_campo_id, v_contrato_id, v_tipo_equipe_id, 'registro', true, 4)
  ON CONFLICT (campo_id, contrato_id, tipo_equipe_id, secao) DO NOTHING;

  RAISE NOTICE 'OK — campo "encarregado_id" vinculado ao tipo_equipe_id = %', v_tipo_equipe_id;
END $$;

-- Verificação: deve retornar 1 linha, secao='registro', obrigatorio=true.
SELECT cc.secao, cc.obrigatorio, cc.ordem
FROM config_campos_contrato cc
JOIN config_campos c ON c.id = cc.campo_id
WHERE c.nome = 'encarregado_id' AND cc.contrato_id = 21;
