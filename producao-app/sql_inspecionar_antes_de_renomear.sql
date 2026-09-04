-- ============================================================
-- Passo 1 (SOMENTE LEITURA) da migração de nomes de colunas em d_atividades:
--   DESCRICAO_BASICA_SISTEMA -> descricao
--   "UPE"                    -> upe
--   "ADICIONAL_30"           -> adicional_30
--   tipo_upe_fixa: 'FIXA' -> 'fixo', 'UPE' -> 'upe'
--
-- Este script NÃO altera nada — só busca as definições de objetos do
-- banco (views e a function fn_prod_dados_anuais) que não estão
-- versionados no repositório, pra eu confirmar se referenciam as
-- colunas que serão renomeadas antes de escrever o script de migração
-- de verdade. Rode e me mande o resultado completo de cada consulta.
-- ============================================================

-- 1) A view usada em Relatórios > Equipes expõe "desc_atividade" —
--    provavelmente um alias de DESCRICAO_BASICA_SISTEMA.
SELECT pg_get_viewdef('view_prod_relatorio_equipes'::regclass, true);

-- 2) Outras views usadas pelo app — confirmar se dependem das colunas.
SELECT pg_get_viewdef('view_prod_registro'::regclass, true);
SELECT pg_get_viewdef('view_prod_relatorio_colaborador'::regclass, true);

-- 3) Function usada no dashboard anual — também expõe "desc_atividade".
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'fn_prod_dados_anuais';

-- 4) Confirmar se a coluna ADICIONAL_30 existe mesmo (não achei nenhuma
--    referência a ela em nenhum arquivo do código nem dos scripts SQL).
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'd_atividades'
ORDER BY ordinal_position;

-- 5) Conferir se algum outro objeto do banco (função, view, trigger)
--    depende dessas 3 colunas, além do que já sabemos
--    (atualizar_upe_f_prod_serv já está mapeada nos scripts do repo).
SELECT DISTINCT dependent_ns.nspname AS dependent_schema,
       dependent_view.relname AS dependent_object,
       dependent_view.relkind
FROM pg_depend
JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
JOIN pg_class AS dependent_view ON pg_rewrite.ev_class = dependent_view.oid
JOIN pg_class AS source_table ON pg_depend.refobjid = source_table.oid
JOIN pg_namespace dependent_ns ON dependent_view.relnamespace = dependent_ns.oid
WHERE source_table.relname = 'd_atividades'
  AND dependent_view.relname NOT IN ('d_atividades');
