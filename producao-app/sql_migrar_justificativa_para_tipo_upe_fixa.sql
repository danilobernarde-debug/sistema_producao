-- ============================================================
-- Migra o conceito de "atividade de justificativa" (antes marcado
-- por d_atividades.referencia_codigo = 'justificativa', coluna que
-- foi apagada) para um terceiro valor de tipo_upe_fixa: 'justificativa'.
-- ============================================================
-- Contexto: o front-end (NovoRegistro.jsx / EditarRegistro.jsx) usava
-- referencia_codigo = 'justificativa' para liberar certas atividades
-- (ex: "Em Andamento - Sem Produção") mesmo quando o filtro de
-- porte/tipo de subestação não deixaria escolhê-las. Como a coluna
-- foi apagada, o código já foi ajustado para checar
-- tipo_upe_fixa = 'justificativa' no lugar — falta só migrar o dado.
--
-- Não há CHECK constraint em tipo_upe_fixa (é texto livre), então não
-- precisa de ALTER TABLE — só o UPDATE abaixo.
-- ============================================================

-- 1) Caso certo: "Em Andamento - Sem Produção" (Limpeza de Subestação,
--    contrato 21), criada em sql_limpeza_subestacao.sql com
--    codigo_op = 'LSE-AND' e tipo_upe_fixa = 'FIXA'. Aproveitando a
--    migração, o codigo_op também passa a ser 'jus.232', pra ficar no
--    mesmo padrão de nomenclatura das demais atividades de justificativa.
UPDATE d_atividades
SET tipo_upe_fixa = 'justificativa',
    codigo_op = 'jus.232'
WHERE codigo_op = 'LSE-AND';

-- 2) Candidatas a revisar manualmente: outras atividades tipo FIXA com
--    UPE = 0 (padrão comum de atividade "sem produção real", que pode
--    ter sido marcada como justificativa em outros contratos também).
--    Rode este SELECT e confira se alguma outra linha precisa do mesmo
--    UPDATE acima (com o codigo_op correto no lugar de 'LSE-AND'):
--
-- SELECT id, codigo_op, "DESCRICAO_BASICA_SISTEMA", contrato_id, tipo_upe_fixa, "UPE"
-- FROM d_atividades
-- WHERE tipo_upe_fixa = 'FIXA' AND "UPE" = 0;

-- 3) Conferir depois de rodar (deve mostrar codigo_op = 'jus.232'):
-- SELECT id, codigo_op, "DESCRICAO_BASICA_SISTEMA", contrato_id, tipo_upe_fixa
-- FROM d_atividades WHERE tipo_upe_fixa = 'justificativa';
