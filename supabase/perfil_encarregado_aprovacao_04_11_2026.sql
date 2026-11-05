-- ============================================================================
-- Perfil "Encarregado" (só acesso pelo app de campo) + quem pode aprovar a produção do campo
--
-- PRÉ-REQUISITO: aprovacao_producao_campo_04_11_2026.sql já rodado.
-- Pode ser repetido sem problema.
--
-- 1. Cria o perfil Encarregado em d_auth_roles (aparece em Configurações → Usuários).
-- 2. Aprovação: quem pode lançar produção. Super Admin e Admin aprovam qualquer contrato;
--    User Local aprova só os contratos em d_auth_contratos. Encarregado, Planejamento e powerbi
--    não aprovam. A decisão é POR CONTRATO do registro (fn_prod_pode_aprovar_campo(contrato_id)).
-- 3. Trava no banco: o Encarregado não lê nem grava f_prod_* (nem escreve em d_obras /
--    d_colaboradores) mesmo chamando a API direto -- o app dele só grava na fila campo_*.
--    O bloqueio do site (login) é feito no front (useAuth).
--
-- Para o Encarregado funcionar no app: Configurações → Usuários → perfil Encarregado e marcar
-- os contratos dele (o app lê os cadastros por contrato); a obra continua em campo_obra_usuario.
-- ============================================================================

do $$
begin
  if to_regprocedure('public.fn_prod_aprovar_registro_campo(uuid)') is null then
    raise exception 'Rode antes aprovacao_producao_campo_04_11_2026.sql.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. Perfil
-- ----------------------------------------------------------------------------
insert into public.d_auth_roles (name)
select 'Encarregado'
 where not exists (select 1 from public.d_auth_roles where name = 'Encarregado');

-- ----------------------------------------------------------------------------
-- 2. Quem aprova (por contrato)
-- ----------------------------------------------------------------------------
create or replace function public.fn_prod_pode_aprovar_campo(p_contrato_id integer)
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
       and u.ativo
       and (
            r.name in ('Super Admin', 'Admin')
         or (
              r.name = 'User Local'
              and exists (
                select 1 from public.d_auth_contratos ac
                 where ac.user_uuid = auth.uid()
                   and ac.contrato_id = p_contrato_id
              )
            )
       )
  );
$$;

revoke all on function public.fn_prod_pode_aprovar_campo(integer) from public, anon;
grant execute on function public.fn_prod_pode_aprovar_campo(integer) to authenticated;

-- Eh encarregado? (usado nas travas abaixo)
create or replace function public.fn_prod_eh_encarregado()
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
       and r.name = 'Encarregado'
  );
$$;

revoke all on function public.fn_prod_eh_encarregado() from public, anon;
grant execute on function public.fn_prod_eh_encarregado() to authenticated;

-- Policies da fila: agora decididas pelo contrato do registro
drop policy if exists campo_registros_producao_select on public.campo_registros_producao;
create policy campo_registros_producao_select on public.campo_registros_producao
  for select to authenticated
  using (criado_por_id = auth.uid() or public.fn_prod_pode_aprovar_campo(contrato_id));

drop policy if exists campo_registros_producao_update on public.campo_registros_producao;
create policy campo_registros_producao_update on public.campo_registros_producao
  for update to authenticated
  using ((criado_por_id = auth.uid() and status = 'pendente') or public.fn_prod_pode_aprovar_campo(contrato_id))
  with check ((criado_por_id = auth.uid() and status = 'pendente') or public.fn_prod_pode_aprovar_campo(contrato_id));

drop policy if exists campo_registro_atividades_all on public.campo_registro_atividades;
create policy campo_registro_atividades_all on public.campo_registro_atividades
  for all to authenticated
  using (exists (
    select 1 from public.campo_registros_producao r
     where r.id = registro_id
       and ((r.criado_por_id = auth.uid() and r.status = 'pendente') or public.fn_prod_pode_aprovar_campo(r.contrato_id))
  ))
  with check (exists (
    select 1 from public.campo_registros_producao r
     where r.id = registro_id
       and ((r.criado_por_id = auth.uid() and r.status = 'pendente') or public.fn_prod_pode_aprovar_campo(r.contrato_id))
  ));

drop policy if exists campo_registro_colaboradores_all on public.campo_registro_colaboradores;
create policy campo_registro_colaboradores_all on public.campo_registro_colaboradores
  for all to authenticated
  using (exists (
    select 1 from public.campo_registros_producao r
     where r.id = registro_id
       and ((r.criado_por_id = auth.uid() and r.status = 'pendente') or public.fn_prod_pode_aprovar_campo(r.contrato_id))
  ))
  with check (exists (
    select 1 from public.campo_registros_producao r
     where r.id = registro_id
       and ((r.criado_por_id = auth.uid() and r.status = 'pendente') or public.fn_prod_pode_aprovar_campo(r.contrato_id))
  ));

drop policy if exists campo_registro_fotos_all on public.campo_registro_fotos;
create policy campo_registro_fotos_all on public.campo_registro_fotos
  for all to authenticated
  using (exists (
    select 1 from public.campo_registros_producao r
     where r.id = registro_id
       and ((r.criado_por_id = auth.uid() and r.status = 'pendente') or public.fn_prod_pode_aprovar_campo(r.contrato_id))
  ))
  with check (exists (
    select 1 from public.campo_registros_producao r
     where r.id = registro_id
       and ((r.criado_por_id = auth.uid() and r.status = 'pendente') or public.fn_prod_pode_aprovar_campo(r.contrato_id))
  ));

-- Aprovar
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
  select * into r from public.campo_registros_producao where id = p_id for update;
  if not found then
    raise exception 'Registro não encontrado.';
  end if;
  if not public.fn_prod_pode_aprovar_campo(r.contrato_id) then
    raise exception 'Sem permissão para aprovar registros deste contrato.' using errcode = '42501';
  end if;
  if r.status <> 'pendente' then
    raise exception 'Este registro já foi % (não está mais pendente).', r.status;
  end if;
  if not exists (select 1 from public.campo_registro_atividades where registro_id = p_id) then
    raise exception 'O registro não tem nenhuma atividade.';
  end if;

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

-- Rejeitar
create or replace function public.fn_prod_rejeitar_registro_campo(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.campo_registros_producao%rowtype;
begin
  select * into r from public.campo_registros_producao where id = p_id for update;
  if not found then
    raise exception 'Registro não encontrado.';
  end if;
  if not public.fn_prod_pode_aprovar_campo(r.contrato_id) then
    raise exception 'Sem permissão para rejeitar registros deste contrato.' using errcode = '42501';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Informe o motivo da rejeição.';
  end if;
  if r.status <> 'pendente' then
    raise exception 'Este registro já foi % (não está mais pendente).', r.status;
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

-- A versão antiga (sem contrato, só Super Admin) não é mais usada por nada: remove.
drop function if exists public.fn_prod_pode_aprovar_campo();

-- ----------------------------------------------------------------------------
-- 3. Trava do Encarregado (policies RESTRICTIVE: somam-se às existentes, nunca liberam)
-- ----------------------------------------------------------------------------
drop policy if exists encarregado_sem_acesso on public.f_prod_registro;
create policy encarregado_sem_acesso on public.f_prod_registro
  as restrictive for all to authenticated
  using (not public.fn_prod_eh_encarregado())
  with check (not public.fn_prod_eh_encarregado());

drop policy if exists encarregado_sem_acesso on public.f_prod_atividades;
create policy encarregado_sem_acesso on public.f_prod_atividades
  as restrictive for all to authenticated
  using (not public.fn_prod_eh_encarregado())
  with check (not public.fn_prod_eh_encarregado());

drop policy if exists encarregado_sem_acesso on public.f_prod_colaboradores;
create policy encarregado_sem_acesso on public.f_prod_colaboradores
  as restrictive for all to authenticated
  using (not public.fn_prod_eh_encarregado())
  with check (not public.fn_prod_eh_encarregado());

-- Cadastros que o app só lê: o Encarregado não escreve (leitura segue liberada).
drop policy if exists encarregado_so_leitura_ins on public.d_obras;
create policy encarregado_so_leitura_ins on public.d_obras
  as restrictive for insert to authenticated with check (not public.fn_prod_eh_encarregado());
drop policy if exists encarregado_so_leitura_upd on public.d_obras;
create policy encarregado_so_leitura_upd on public.d_obras
  as restrictive for update to authenticated using (not public.fn_prod_eh_encarregado()) with check (not public.fn_prod_eh_encarregado());
drop policy if exists encarregado_so_leitura_del on public.d_obras;
create policy encarregado_so_leitura_del on public.d_obras
  as restrictive for delete to authenticated using (not public.fn_prod_eh_encarregado());

drop policy if exists encarregado_so_leitura_ins on public.d_colaboradores;
create policy encarregado_so_leitura_ins on public.d_colaboradores
  as restrictive for insert to authenticated with check (not public.fn_prod_eh_encarregado());
drop policy if exists encarregado_so_leitura_upd on public.d_colaboradores;
create policy encarregado_so_leitura_upd on public.d_colaboradores
  as restrictive for update to authenticated using (not public.fn_prod_eh_encarregado()) with check (not public.fn_prod_eh_encarregado());
drop policy if exists encarregado_so_leitura_del on public.d_colaboradores;
create policy encarregado_so_leitura_del on public.d_colaboradores
  as restrictive for delete to authenticated using (not public.fn_prod_eh_encarregado());
