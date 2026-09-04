-- Definição da materialized view que alimenta o Power BI (fn_prod_dados_anuais
-- lê dela) — preciso confirmar se ela referencia DESCRICAO_BASICA_SISTEMA/UPE
-- diretamente antes de renomear as colunas de d_atividades.
SELECT pg_get_viewdef('internal.mat_producao_powerbi'::regclass, true);

-- Ainda faltando: lista de colunas de d_atividades.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'd_atividades'
ORDER BY ordinal_position;
