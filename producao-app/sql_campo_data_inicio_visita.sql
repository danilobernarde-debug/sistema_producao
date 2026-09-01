-- ============================================================
-- Novo campo dinâmico: "Data Início da Visita"
-- Só pra Limpeza de Subestação (contrato 21, tipo de equipe 16).
--
-- Substitui a necessidade de lançar "Em Andamento - Sem Produção"
-- num dia separado só pra marcar quando a visita começou — agora
-- dá pra digitar direto no mesmo registro que tem a conclusão
-- (Roçagem/Capina Química). O relatório (LimpezaSubestacao.jsx)
-- passa a usar essa data quando preenchida, e só cai de volta no
-- pareamento antigo (por subestação + "Em Andamento" mais recente)
-- pra registros antigos que não tiverem esse campo.
--
-- tipo='data', is_coluna_real=false — metadado comum, sem precisar
-- de coluna nova em f_prod_registro nem código especial no
-- formulário (CampoDinamico.jsx já renderiza tipo='data' genérico).
--
-- Idempotente e seguro rodar de novo mesmo que a v1 (nome
-- data_inicio_visita) já tenha rodado antes — renomeia em vez de
-- duplicar.
-- ============================================================

-- 1) Renomeia se já existir com o nome antigo (v1 deste script)
UPDATE config_campos SET nome = 'data_inicio' WHERE nome = 'data_inicio_visita';

-- 2) Cria já com o nome definitivo, se ainda não existir de jeito nenhum
INSERT INTO config_campos (nome, label, tipo, is_coluna_real, secao_permitida)
SELECT 'data_inicio', 'Data Início da Visita', 'data', false, 'registro'
WHERE NOT EXISTS (SELECT 1 FROM config_campos WHERE nome = 'data_inicio');

-- 3) Garante o vínculo com Limpeza de Subestação (contrato 21, tipo 16)
INSERT INTO config_campos_contrato (campo_id, contrato_id, tipo_equipe_id, secao, obrigatorio, ordem)
SELECT cc.id, 21, 16, 'registro', false, 2
FROM config_campos cc
WHERE cc.nome = 'data_inicio'
AND NOT EXISTS (
  SELECT 1 FROM config_campos_contrato x
  WHERE x.campo_id = cc.id AND x.contrato_id = 21 AND x.tipo_equipe_id = 16 AND x.secao = 'registro'
);

-- Verificação
SELECT cc.id AS campo_id, cc.nome, cc.label, ccc.contrato_id, ccc.tipo_equipe_id, ccc.obrigatorio, ccc.ordem
FROM config_campos cc
JOIN config_campos_contrato ccc ON ccc.campo_id = cc.id
WHERE cc.nome = 'data_inicio';
