-- ============================================================
-- Corrige "nova linha viola a política de segurança em nível de linha
-- para a tabela d_subestacoes" ao criar/editar/excluir em
-- Configurações > Subestações.
-- Causa: as policies originais (sql_limpeza_subestacao.sql) só reconheciam
-- Super Admin pela coluna d_auth_user.is_super_admin, que o resto do sistema
-- não usa (o app e as demais policies/RPCs usam d_auth_roles.name = 'Super Admin').
-- Sem a flag marcada, só passava quem tivesse d_auth_contratos.insert = true
-- no contrato da subestação.
-- A tela já é restrita a Super Admin no front (RotaSuperAdmin em App.jsx).
-- Mantém as regras antigas (is_super_admin e d_auth_contratos) e soma o perfil.
-- Data: 16/10/2026
-- ============================================================

DROP POLICY IF EXISTS "subestacoes_select" ON d_subestacoes;
CREATE POLICY "subestacoes_select" ON d_subestacoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM d_auth_user u JOIN d_auth_roles r ON r.id = u.role_id
      WHERE u.uuid = auth.uid() AND r.name = 'Super Admin'
    )
    OR EXISTS (SELECT 1 FROM d_auth_user u WHERE u.uuid = auth.uid() AND u.is_super_admin)
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
    OR EXISTS (SELECT 1 FROM d_auth_user u WHERE u.uuid = auth.uid() AND u.is_super_admin)
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
    OR EXISTS (SELECT 1 FROM d_auth_user u WHERE u.uuid = auth.uid() AND u.is_super_admin)
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
    OR EXISTS (SELECT 1 FROM d_auth_user u WHERE u.uuid = auth.uid() AND u.is_super_admin)
    OR EXISTS (
      SELECT 1 FROM d_auth_contratos ac
      WHERE ac.user_uuid = auth.uid() AND ac.contrato_id = d_subestacoes.contrato_id AND ac.delete
    )
  );

-- Confere as 4 policies (SELECT, INSERT, UPDATE, DELETE)
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'd_subestacoes' ORDER BY cmd;
