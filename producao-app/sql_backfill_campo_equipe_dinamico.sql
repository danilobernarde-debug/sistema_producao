-- ============================================================
-- Backfill: campo Equipe (config_campos.id=29, nome='equipe_id')
-- como config_campos_contrato pra TODOS os contratos normais
-- (logica_contrato=false) x todos os tipos de equipe reais
-- (exclui tipo_equipe_id=0 "Desativada").
--
-- Contexto: Equipe era um campo "fixo" hardcoded no código do
-- lançamento de produção — sempre aparecia pra contratos com
-- logica_contrato=false, sem opção de remover, só de deixar
-- opcional (feito antes). Virou campo dinâmico de verdade, com
-- botão de remover no Editor de Formulário, igual Obra/Encarregado/
-- Regional. Esse backfill garante que nenhum contrato que já
-- depende do campo hoje fique sem ele quando o hardcode sair do
-- código (NovoRegistro.jsx / EditarRegistro.jsx).
--
-- ordem=1 pra sempre aparecer logo depois de "Tipo de Equipe"
-- (campo fixo) e antes de qualquer outro campo dinâmico já
-- configurado (ex: Encarregado em Limpeza Subestação, ordem=4).
-- obrigatorio=false, mantendo o comportamento opcional já aplicado.
--
-- 8 contratos x 9 tipos = 72 linhas. Idempotente — não duplica se
-- já existir.
-- ============================================================

INSERT INTO config_campos_contrato (campo_id, contrato_id, tipo_equipe_id, secao, obrigatorio, ordem)
SELECT 29, c.contrato_id, c.tipo_equipe_id, 'registro', false, 1
FROM (VALUES
  (4,1),(4,2),(4,3),(4,4),(4,5),(4,6),(4,7),(4,8),(4,16),
  (5,1),(5,2),(5,3),(5,4),(5,5),(5,6),(5,7),(5,8),(5,16),
  (15,1),(15,2),(15,3),(15,4),(15,5),(15,6),(15,7),(15,8),(15,16),
  (16,1),(16,2),(16,3),(16,4),(16,5),(16,6),(16,7),(16,8),(16,16),
  (17,1),(17,2),(17,3),(17,4),(17,5),(17,6),(17,7),(17,8),(17,16),
  (18,1),(18,2),(18,3),(18,4),(18,5),(18,6),(18,7),(18,8),(18,16),
  (19,1),(19,2),(19,3),(19,4),(19,5),(19,6),(19,7),(19,8),(19,16),
  (21,1),(21,2),(21,3),(21,4),(21,5),(21,6),(21,7),(21,8),(21,16)
) AS c(contrato_id, tipo_equipe_id)
WHERE NOT EXISTS (
  SELECT 1 FROM config_campos_contrato x
  WHERE x.campo_id = 29 AND x.contrato_id = c.contrato_id
    AND x.tipo_equipe_id = c.tipo_equipe_id AND x.secao = 'registro'
);

-- Verificação: deve retornar 72
SELECT count(*) AS total_inserido FROM config_campos_contrato WHERE campo_id = 29;
