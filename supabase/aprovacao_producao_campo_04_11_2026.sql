-- ============================================================================
-- Aprovação da produção lançada pelo app de campo (app_campo)
--
-- PRÉ-REQUISITO: rodar antes, uma vez, D:\Sistemas Claude\app_campo\supabase\
-- migracao_registro_producao.sql (cria campo_registros_producao e filhas).
-- Em 04/11/2026 essas tabelas ainda NÃO existiam no banco.
--
-- O que este script faz:
--   1. fn_prod_pode_aprovar_campo()      -> quem pode ver/avaliar a fila (Super Admin, pelo perfil)
--   2. Recria as policies da fila        -> trocam d_auth_user.is_super_admin (legado) pelo perfil
--   3. fn_prod_aprovar_registro_campo()  -> copia o registro para f_prod_* de uma vez só e marca aprovado
--   4. fn_prod_rejeitar_registro_campo() -> marca rejeitado, com motivo obrigatório
--
-- Rodar manualmente no SQL Editor do Supabase. Pode ser repetido sem problema.
-- Para liberar a aprovação a outros perfis (ex.: Admin), basta editar a lista em
-- fn_prod_pode_aprovar_campo(); policies e funções passam a valer na hora.
-- ============================================================================

do $$
begin
  if to_regclass('public.campo_registros_producao') is null then
    raise exception 'Rode antes app_campo/supabase/migracao_registro_producao.sql (tabelas campo_registro* não existem).';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. Quem aprova
-- ----------------------------------------------------------------------------
create or replace function public.fn_prod_pode_aprovar_campo()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.d_auth_user u
      join public.d_auth_roles r on r.id = u.role_id
     where u.uuid = auth.uid()
       and r.name = 'Super Admin'
  );
$$;

revoke all on function public.fn_prod_pode_aprovar_campo() from public, anon;
grant execute on function public.fn_prod_pode_aprovar_campo() to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Policies da fila (substituem as da migração do app, que usavam is_super_admin)
--    Encarregado: vê e reenvia só os próprios, enquanto pendente.
--    Aprovador: vê e avalia todos.
-- ----------------------------------------------------------------------------
drop policy if exists campo_registros_producao_select on public.campo_registros_producao;
create policy campo_registros_producao_select on public.campo_registros_producao
  for select to authenticated
  using (criado_por_id = auth.uid() or public.fn_prod_pode_aprovar_campo());

drop policy if exists campo_registros_producao_insert on public.campo_registros_producao;
create policy campo_registros_producao_insert on public.campo_registros_producao
  for insert to authenticated
  with check (criado_por_id = auth.uid() and status = 'pendente');

drop policy if exists campo_registros_producao_update on public.campo_registros_producao;
create policy campo_registros_producao_update on public.campo_registros_producao
  for update to authenticated
  using ((criado_por_id = auth.uid() and status = 'pendente') or public.fn_prod_pode_aprovar_campo())
  with check ((criado_por_id = auth.uid() and status = 'pendente') or public.fn_prod_pode_aprovar_campo());

drop policy if exists campo_registro_atividades_all on public.campo_registro_atividades;
create policy campo_registro_atividades_all on public.campo_registro_atividades
  for all to authenticated
  using (exists (
    select 1 from public.campo_registros_producao r
     where r.id = registro_id
       and ((r.criado_por_id = auth.uid() and r.status = 'pendente') or public.fn_prod_pode_aprovar_campo())
  ))
  with check (exists (
    select 1 from public.campo_registros_producao r
     where r.id = registro_id
       and ((r.criado_por_id = auth.uid() and r.status = 'pendente') or public.fn_prod_pode_aprovar_campo())
  ));

drop policy if exists campo_registro_colaboradores_all on public.campo_registro_colaboradores;
create policy campo_registro_colaboradores_all on public.campo_registro_colaboradores
  for all to authenticated
  using (exists (
    select 1 from public.campo_registros_producao r
     where r.id = registro_id
       and ((r.criado_por_id = auth.uid() and r.status = 'pendente') or public.fn_prod_pode_aprovar_campo())
  ))
  with check (exists (
    select 1 from public.campo_registros_producao r
     where r.id = registro_id
       and ((r.criado_por_id = auth.uid() and r.status = 'pendente') or public.fn_prod_pode_aprovar_campo())
  ));

drop policy if exists campo_registro_fotos_all on public.campo_registro_fotos;
create policy campo_registro_fotos_all on public.campo_registro_fotos
  for all to authenticated
  using (exists (
    select 1 from public.campo_registros_producao r
     where r.id = registro_id
       and ((r.criado_por_id = auth.uid() and r.status = 'pendente') or public.fn_prod_pode_aprovar_campo())
  ))
  with check (exists (
    select 1 from public.campo_registros_producao r
     where r.id = registro_id
       and ((r.criado_por_id = auth.uid() and r.status = 'pendente') or public.fn_prod_pode_aprovar_campo())
  ));

-- ----------------------------------------------------------------------------
-- 3. Aprovar: copia para f_prod_registro / f_prod_atividades / f_prod_colaboradores
--    Tudo numa transação só: se qualquer passo falhar (ex.: trigger de disponibilidade),
--    nada é gravado e o registro continua pendente. Devolve o id criado em f_prod_registro.
--    Mesmas colunas e mesma origem do lançamento normal (NovoRegistro.jsx); valor_total,
--    is_justificativa e a regra de disponibilidade ficam por conta das colunas geradas/triggers.
-- ----------------------------------------------------------------------------
create or replace function public.fn_prod_aprovar_registro_campo(p_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r         public.campo_registros_producao%rowtype;
  v_reg_id  bigint;
  v_sem_eq  text;
begin
  if not public.fn_prod_pode_aprovar_campo() then
    raise exception 'Sem permissão para aprovar registros do app de campo.' using errcode = '42501';
  end if;

  select * into r from public.campo_registros_producao where id = p_id for update;
  if not found then
    raise exception 'Registro não encontrado.';
  end if;
  if r.status <> 'pendente' then
    raise exception 'Este registro já foi % (não está mais pendente).', r.status;
  end if;
  if not exists (select 1 from public.campo_registro_atividades where registro_id = p_id) then
    raise exception 'O registro não tem nenhuma atividade.';
  end if;

  -- Presença exige equipe: usa a do dia, senão a do cadastro do colaborador, senão a do registro.
  select string_agg(coalesce(c.matricula_nome, cc.colaborador_id::text), ', ')
    into v_sem_eq
    from public.campo_registro_colaboradores cc
    left join public.d_colaboradores c on c.id = cc.colaborador_id
   where cc.registro_id = p_id
     and coalesce(cc.equipe_id, c.equipe_id, r.equipe_id) is null;
  if v_sem_eq is not null then
    raise exception 'Colaborador(es) sem equipe definida: %', v_sem_eq;
  end if;

  insert into public.f_prod_registro (
    data_producao, contrato_id, tipo_equipe_id, equipe_id, obra_id, encarregado_id,
    regional_id, metadata_registro, criado_por_id, criado_em, origem
  ) values (
    r.data_producao, r.contrato_id, r.tipo_equipe_id, r.equipe_id, r.obra_id, r.encarregado_id,
    r.regional_id, r.metadata_registro, r.criado_por_id, r.criado_em, 'sistema-claude'
  ) returning id into v_reg_id;

  insert into public.f_prod_atividades (
    registro_id, atividade_id, quantidade, upe, preco_upe, metadata_atividades, origem
  )
  select v_reg_id, a.atividade_id, a.quantidade, a.upe, a.preco_upe, a.metadata_atividades, 'sistema-claude'
    from public.campo_registro_atividades a
   where a.registro_id = p_id;

  insert into public.f_prod_colaboradores (registro_id, colaborador_id, equipe_id, origem)
  select v_reg_id, cc.colaborador_id, coalesce(cc.equipe_id, c.equipe_id, r.equipe_id), 'sistema-claude'
    from public.campo_registro_colaboradores cc
    left join public.d_colaboradores c on c.id = cc.colaborador_id
   where cc.registro_id = p_id;

  update public.campo_registros_producao
     set status = 'aprovado',
         motivo_rejeicao = null,
         avaliado_por_id = auth.uid(),
         avaliado_em = now(),
         f_prod_registro_id = v_reg_id
   where id = p_id;

  return v_reg_id;
end;
$$;

revoke all on function public.fn_prod_aprovar_registro_campo(uuid) from public, anon;
grant execute on function public.fn_prod_aprovar_registro_campo(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Rejeitar (motivo obrigatório; o encarregado vê no app)
-- ----------------------------------------------------------------------------
create or replace function public.fn_prod_rejeitar_registro_campo(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if not public.fn_prod_pode_aprovar_campo() then
    raise exception 'Sem permissão para rejeitar registros do app de campo.' using errcode = '42501';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Informe o motivo da rejeição.';
  end if;

  select status into v_status from public.campo_registros_producao where id = p_id for update;
  if not found then
    raise exception 'Registro não encontrado.';
  end if;
  if v_status <> 'pendente' then
    raise exception 'Este registro já foi % (não está mais pendente).', v_status;
  end if;

  update public.campo_registros_producao
     set status = 'rejeitado',
         motivo_rejeicao = btrim(p_motivo),
         avaliado_por_id = auth.uid(),
         avaliado_em = now()
   where id = p_id;
end;
$$;

revoke all on function public.fn_prod_rejeitar_registro_campo(uuid, text) from public, anon;
grant execute on function public.fn_prod_rejeitar_registro_campo(uuid, text) to authenticated;
