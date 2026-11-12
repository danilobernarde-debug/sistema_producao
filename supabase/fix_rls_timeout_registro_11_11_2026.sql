-- ============================================================
-- Corrige "statement timeout" (HTTP 500) em f_prod_registro, view_prod_disponibilidade_mes
-- e telas que leem essas tabelas (Dashboard, Lista de Produção, Disponibilidade).
--
-- Causa provável (não medida): as policies chamavam fn_prod_eh_encarregado() e auth.uid()
-- "soltos". Assim o Postgres reavalia a função (SECURITY DEFINER, com join em 2 tabelas)
-- para CADA linha lida. Embrulhando em (select ...) vira um InitPlan: é calculado uma
-- única vez por consulta. A regra de acesso é exatamente a mesma, só muda o desempenho.
--
-- ALTER POLICY mantém tipo (RESTRICTIVE/PERMISSIVE), comando e roles de cada policy.
-- Data: 11/11/2026
-- ============================================================

-- Antes de rodar, para comparar: no SQL Editor, como o seu usuário (ou pelo app),
-- abra Produção > Lista e o Dashboard e veja se dão erro. Depois de rodar, repita.

BEGIN;

-- 1) Policies RESTRICTIVE "encarregado não acessa" (a mesma regra em 3 tabelas)
ALTER POLICY "encarregado_sem_acesso" ON public.f_prod_registro
  USING ((SELECT NOT public.fn_prod_eh_encarregado()))
  WITH CHECK ((SELECT NOT public.fn_prod_eh_encarregado()));

ALTER POLICY "encarregado_sem_acesso" ON public.f_prod_atividades
  USING ((SELECT NOT public.fn_prod_eh_encarregado()))
  WITH CHECK ((SELECT NOT public.fn_prod_eh_encarregado()));

ALTER POLICY "encarregado_sem_acesso" ON public.f_prod_colaboradores
  USING ((SELECT NOT public.fn_prod_eh_encarregado()))
  WITH CHECK ((SELECT NOT public.fn_prod_eh_encarregado()));

-- 2) d_contratos é consultada por linha dentro de registros_acesso (f_prod_registro):
--    auth.uid() passa a ser calculado uma vez só.
ALTER POLICY "contratos_visivel" ON public.d_contratos
  USING (
    (EXISTS (
      SELECT 1
        FROM public.d_auth_user u
        JOIN public.d_auth_roles r ON r.id = u.role_id
       WHERE u.uuid = (SELECT auth.uid())
         AND r.name = ANY (ARRAY['Super Admin'::text, 'Admin'::text])
    ))
    OR
    (EXISTS (
      SELECT 1
        FROM public.d_auth_contratos ac
       WHERE ac.user_uuid = (SELECT auth.uid())
         AND ac.contrato_id = d_contratos.id
    ))
  );

COMMIT;

-- ============================================================
-- Conferir depois de rodar (deve mostrar "(SELECT ...)" nas expressões):
--   select tablename, policyname, qual from pg_policies
--    where schemaname='public'
--      and policyname in ('encarregado_sem_acesso','contratos_visivel');
--
-- Desfazer (volta ao estado anterior):
--   ALTER POLICY "encarregado_sem_acesso" ON public.f_prod_registro
--     USING (NOT public.fn_prod_eh_encarregado()) WITH CHECK (NOT public.fn_prod_eh_encarregado());
--   (idem para f_prod_atividades e f_prod_colaboradores)
--   ALTER POLICY "contratos_visivel" ON public.d_contratos USING (
--     (EXISTS (SELECT 1 FROM d_auth_user u JOIN d_auth_roles r ON r.id = u.role_id
--               WHERE u.uuid = auth.uid() AND r.name = ANY (ARRAY['Super Admin','Admin'])))
--     OR (EXISTS (SELECT 1 FROM d_auth_contratos WHERE user_uuid = auth.uid() AND contrato_id = d_contratos.id)));
-- ============================================================
