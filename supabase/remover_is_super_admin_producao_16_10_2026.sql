-- ============================================================
-- PARTE 1 (sistema de produção) — Super Admin decidido SÓ pelo perfil
-- (d_auth_roles.name = 'Super Admin'); a coluna d_auth_user.is_super_admin
-- deixa de ser consultada. Motivo: a flag é nula para 5 dos 7 Super Admins
-- (nada a sincroniza com o perfil) e bloqueava a escrita deles.
--
-- Tabelas: d_subestacoes, config_campos, config_campos_contrato,
-- d_atividades_preco_fixo. Cada policy mantém o mesmo comando e os mesmos
-- roles de antes; só muda a checagem de Super Admin.
-- Efeito colateral esperado: marcos@dbmachado.com (User Local com a flag
-- marcada) perde a escrita nessas tabelas.
-- Data: 16/10/2026
-- ============================================================


-- ------------------------------------------------------------
-- d_subestacoes (mantém a regra por contrato via d_auth_contratos)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "subestacoes_select" ON d_subestacoes;
CREATE POLICY "subestacoes_select" ON d_subestacoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM d_auth_user u JOIN d_auth_roles r ON r.id = u.role_id
      WHERE u.uuid = auth.uid() AND r.name = 'Super Admin'
    )
    OR EXISTS (
      SELECT 1 FROM d_auth_contratos ac
      WHERE ac.user_uuid = auth.uid() AND ac.contrato_id = d_subestacoes.contrato_id AND ac.read
    )
  );

DROP POLICY IF EXISTS "subestacoes_insert" ON d_subestacoes;
CREATE POLICY "subestacoes_insert" ON d_subestacoes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM d_auth_user u JOIN d_auth_roles r ON r.id = u.role_id
      WHERE u.uuid = auth.uid() AND r.name = 'Super Admin'
    )
    OR EXISTS (
      SELECT 1 FROM d_auth_contratos ac
      WHERE ac.user_uuid = auth.uid() AND ac.contrato_id = d_subestacoes.contrato_id AND ac.insert
    )
  );

DROP POLICY IF EXISTS "subestacoes_update" ON d_subestacoes;
CREATE POLICY "subestacoes_update" ON d_subestacoes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM d_auth_user u JOIN d_auth_roles r ON r.id = u.role_id
      WHERE u.uuid = auth.uid() AND r.name = 'Super Admin'
    )
    OR EXISTS (
      SELECT 1 FROM d_auth_contratos ac
      WHERE ac.user_uuid = auth.uid() AND ac.contrato_id = d_subestacoes.contrato_id AND ac.update
    )
  );

DROP POLICY IF EXISTS "subestacoes_delete" ON d_subestacoes;
CREATE POLICY "subestacoes_delete" ON d_subestacoes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM d_auth_user u JOIN d_auth_roles r ON r.id = u.role_id
      WHERE u.uuid = auth.uid() AND r.name = 'Super Admin'
    )
    OR EXISTS (
      SELECT 1 FROM d_auth_contratos ac
      WHERE ac.user_uuid = auth.uid() AND ac.contrato_id = d_subestacoes.contrato_id AND ac.delete
    )
  );


-- ------------------------------------------------------------
-- config_campos e config_campos_contrato (leitura continua aberta a
-- qualquer autenticado, por outra policy; aqui só a escrita)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Super admin pode gerenciar config_campos" ON config_campos;
CREATE POLICY "Super admin pode gerenciar config_campos" ON config_campos
  FOR ALL TO authenticated
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

DROP POLICY IF EXISTS "Super admin pode gerenciar config_campos_contrato" ON config_campos_contrato;
CREATE POLICY "Super admin pode gerenciar config_campos_contrato" ON config_campos_contrato
  FOR ALL TO authenticated
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
-- d_atividades_preco_fixo (leitura segue aberta a autenticados)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "atividades_preco_fixa_write" ON d_atividades_preco_fixo;
CREATE POLICY "atividades_preco_fixa_write" ON d_atividades_preco_fixo FOR ALL
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
-- Conferência: o que ainda usa is_super_admin. Depois da PARTE 1 devem
-- sobrar só campo_obra_usuario e jud_user_permissoes (PARTE 2).
-- ------------------------------------------------------------
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND (coalesce(qual,'') || coalesce(with_check,'')) ILIKE '%is_super_admin%'
ORDER BY tablename, policyname;
