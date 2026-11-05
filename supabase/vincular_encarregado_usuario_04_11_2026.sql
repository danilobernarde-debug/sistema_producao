-- ============================================================================
-- Vincula o usuário com perfil Encarregado ao seu cadastro (colaborador) e à sua equipe
--
-- d_auth_user.colaborador_id = o colaborador que é esse encarregado.
-- d_auth_user.equipe_id      = a equipe dele (d_equipes).
-- O contrato NÃO é gravado: vem da equipe (d_equipes.contrato_id).
-- O app de campo lê esses valores e já preenche Contrato, Equipe e Encarregado nos registros.
-- Quem grava é o Super Admin, em Configurações → Usuários (a policy super_admin_update de
-- d_auth_user já restringe isso).
--
-- Colunas opcionais: só são usadas quando o perfil é Encarregado. Pode ser repetido sem problema.
-- ============================================================================

alter table public.d_auth_user
  add column if not exists colaborador_id integer
  references public.d_colaboradores (id) on delete set null;

alter table public.d_auth_user
  add column if not exists equipe_id integer
  references public.d_equipes (id) on delete set null;

-- Um colaborador não pode estar vinculado a dois usuários (evita registros no nome errado).
-- A equipe pode repetir (mais de um usuário na mesma equipe).
create unique index if not exists uq_d_auth_user_colaborador
  on public.d_auth_user (colaborador_id)
  where colaborador_id is not null;
