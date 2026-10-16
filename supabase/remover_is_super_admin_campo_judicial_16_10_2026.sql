-- ============================================================
-- PARTE 2 (módulos de obra "campo_*" e judicial "jud_*") — Super Admin
-- decidido SÓ pelo perfil (d_auth_roles.name = 'Super Admin'); a coluna
-- d_auth_user.is_super_admin deixa de ser consultada.
--
-- ATENÇÃO — muda quem enxerga dados destes módulos:
--   * jud_pode_ver_processo: Super Admin vê TODOS os processos. Hoje isso
--     vale só para danilo e handreina (flag); com o perfil passam a valer
--     também Cleiton, joaogilberto, luiz.felipe, vinicius e yngrid.
--   * campo_has_obra_access: Super Admin acessa TODAS as obras (mesma mudança).
--   * campo_obra_usuario e jud_user_permissoes: os mesmos 7 Super Admins
--     passam a gerenciar vínculos de obra e permissões do judicial.
--   * marcos@dbmachado.com (User Local com a flag marcada) perde tudo isso.
-- Rode só depois de confirmar que é isso mesmo que se quer.
-- Funções: corpo idêntico ao atual, trocando apenas a 1ª checagem.
-- Data: 16/10/2026
-- ============================================================


-- ------------------------------------------------------------
-- Policies
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "campo_obra_usuario_write" ON campo_obra_usuario;
CREATE POLICY "campo_obra_usuario_write" ON campo_obra_usuario FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM d_auth_user u JOIN d_auth_roles r ON r.id = u.role_id
      WHERE u.uuid = auth.uid() AND r.name = 'Super Admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM d_auth_user u JOIN d_auth_roles r ON r.id = u.role_id
      WHERE u.uuid = auth.uid() AND r.name = 'Super Admin'
    )
  );

DROP POLICY IF EXISTS "admin_acesso_total" ON jud_user_permissoes;
CREATE POLICY "admin_acesso_total" ON jud_user_permissoes FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM d_auth_user u JOIN d_auth_roles r ON r.id = u.role_id
      WHERE u.uuid = auth.uid() AND r.name = 'Super Admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM d_auth_user u JOIN d_auth_roles r ON r.id = u.role_id
      WHERE u.uuid = auth.uid() AND r.name = 'Super Admin'
    )
  );


-- ------------------------------------------------------------
-- Funções
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.campo_has_obra_access(p_obra_id integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select
        exists (
            select 1
            from public.d_auth_user u
            join public.d_auth_roles r on r.id = u.role_id
            where u.uuid = auth.uid() and r.name = 'Super Admin'
        )
        or exists (
            select 1 from public.campo_obra_usuario
            where obra_id = p_obra_id and usuario_id = auth.uid()
        );
$function$;

CREATE OR REPLACE FUNCTION public.jud_pode_ver_processo(p_tipo text, p_tribunal text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT (
    EXISTS (
      SELECT 1 FROM d_auth_user u
      JOIN d_auth_roles r ON r.id = u.role_id
      WHERE u.uuid = auth.uid() AND r.name = 'Super Admin'
    )
    OR (
      p_tipo = 'juridico' AND p_tribunal ILIKE 'TRT%'
      AND EXISTS (
        SELECT 1 FROM jud_user_permissoes
        WHERE user_uuid = auth.uid() AND 'trabalhista' = ANY(tipos)
      )
    )
    OR (
      p_tipo = 'juridico' AND p_tribunal NOT ILIKE 'TRT%'
      AND EXISTS (
        SELECT 1 FROM jud_user_permissoes
        WHERE user_uuid = auth.uid() AND 'civel' = ANY(tipos)
      )
    )
    OR (
      p_tipo = 'administrativo'
      AND EXISTS (
        SELECT 1 FROM jud_user_permissoes
        WHERE user_uuid = auth.uid() AND 'administrativo' = ANY(tipos)
      )
    )
  );
$function$;


-- ------------------------------------------------------------
-- Conferência final (as duas partes rodadas): as duas listas devem vir vazias
-- ------------------------------------------------------------
SELECT 'policy' AS tipo, tablename || '.' || policyname AS objeto
FROM pg_policies
WHERE schemaname = 'public'
  AND (coalesce(qual,'') || coalesce(with_check,'')) ILIKE '%is_super_admin%'
UNION ALL
SELECT 'funcao', p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosrc ILIKE '%is_super_admin%';
