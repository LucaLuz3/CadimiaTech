-- ============================================================
--  008a_pre_deploy.sql — o que precisa existir ANTES do deploy
--
--  A 008 foi dividida em duas depois de inspecionar a produção pelo
--  conector do Supabase em 13/09. Duas descobertas forçaram isso:
--
--  1. O Supabase LIGA RLS sozinho em tabela nova no schema public. As
--     quatro tabelas da 006 (profiles, duos, duo_members, duo_invites)
--     estão com RLS ligada e ZERO políticas — ou seja, negam tudo.
--     O app novo não conseguiria ler nem o próprio nome.
--
--  2. As três views ainda agrupam por `person`. O app novo consulta
--     `.eq("profile_id", …)` nelas e receberia "column does not exist".
--
--  Nada aqui afeta o app ANTIGO: ele não conhece profiles nem duos, e
--  as views continuam expondo `person` além de profile_id. Por isso
--  esta migração é segura de rodar agora, antes do deploy.
--
--      006 ✅ → 007 ✅ → 007b ✅ → [ 008a ] → DEPLOY → 008b → 009
--
--  Idempotente.
-- ============================================================

-- 1) FUNÇÕES DE APOIO -----------------------------------------
-- SECURITY DEFINER para não entrar em recursão: a política de
-- duo_members precisa saber qual é a minha dupla, e descobrir isso
-- lendo duo_members com RLS ligada se morderia pelo rabo.

create or replace function public.my_duo_id()
returns uuid language sql stable security definer set search_path = public as $$
  select duo_id from public.duo_members where profile_id = auth.uid() limit 1;
$$;

-- Perfis cujos dados eu posso LER: o meu, mais o do parceiro que
-- deixou. Note o `outro.share_enabled` — quem decide se eu vejo é ele.
create or replace function public.readable_profile_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select auth.uid()
  union
  select outro.profile_id
    from public.duo_members meu
    join public.duo_members outro
      on outro.duo_id = meu.duo_id and outro.profile_id <> meu.profile_id
   where meu.profile_id = auth.uid()
     and outro.share_enabled;
$$;

-- 2) ACEITE DE CONVITE ----------------------------------------
-- Precisa ser função: quem aceita ainda não é membro, logo não enxerga
-- a dupla para se inserir nela. O `for update` no token é a trava
-- contra corrida — o mesmo cuidado que o seed precisou quando o
-- onAuthStateChange do Supabase disparou duas vezes no login.

create or replace function public.accept_duo_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_duo uuid;
  v_me  uuid := auth.uid();
  v_n   int;
begin
  if v_me is null then raise exception 'Não autenticado.'; end if;

  select duo_id into v_duo
    from public.duo_invites
   where token = p_token and accepted_by is null and expires_at > now()
     for update;

  if v_duo is null then raise exception 'Convite inválido ou expirado.'; end if;

  if exists (select 1 from public.duo_members where profile_id = v_me and duo_id <> v_duo) then
    raise exception 'Você já está em outra dupla. Desfaça a atual antes.';
  end if;

  select count(*) into v_n from public.duo_members where duo_id = v_duo;
  if v_n >= 2 and not exists (select 1 from public.duo_members where duo_id = v_duo and profile_id = v_me) then
    raise exception 'Essa dupla já está completa.';
  end if;

  insert into public.duo_members (duo_id, profile_id) values (v_duo, v_me)
  on conflict do nothing;

  update public.duo_invites
     set accepted_by = v_me, accepted_at = now()
   where token = p_token;

  return v_duo;
end $$;

-- 3) QUEM PODE CHAMAR O QUÊ -----------------------------------
-- O linter de segurança do Supabase apontou duas funções SECURITY
-- DEFINER expostas como RPC pública em /rest/v1/rpc/ — inclusive a
-- handle_new_user, que é gatilho e não tem por que ser chamável.
-- Fechamos tudo e liberamos só o necessário.

revoke execute on function public.handle_new_user()          from anon, authenticated, public;
revoke execute on function public.duo_partner_ids(uuid)      from anon, authenticated, public;
revoke execute on function public.my_duo_id()                from anon, authenticated, public;
revoke execute on function public.readable_profile_ids()     from anon, authenticated, public;
revoke execute on function public.accept_duo_invite(text)    from anon, authenticated, public;

-- Só estas três, e só para quem está logado.
grant execute on function public.my_duo_id()             to authenticated;
grant execute on function public.readable_profile_ids()  to authenticated;
grant execute on function public.accept_duo_invite(text) to authenticated;

-- duo_partner_ids e handle_new_user ficam sem grant nenhum: a primeira
-- é usada só internamente pelo app via getMyDuo, a segunda é gatilho e
-- roda no contexto do próprio INSERT em auth.users.

-- 4) POLÍTICAS DAS QUATRO TABELAS -----------------------------

do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies
            where schemaname='public'
              and tablename in ('profiles','duos','duo_members','duo_invites')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Garantia: se algum dia alguém desligar, volta a ligar.
alter table public.profiles     enable row level security;
alter table public.duos         enable row level security;
alter table public.duo_members  enable row level security;
alter table public.duo_invites  enable row level security;

create policy "perfil: leio o meu e o do parceiro" on public.profiles
  for select to authenticated
  using (id in (select public.readable_profile_ids()));

create policy "perfil: edito só o meu" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Sem INSERT nem DELETE em profiles: quem cria é o trigger
-- on_auth_user_created, quem apaga é o cascade de auth.users.

create policy "dupla: vejo a minha" on public.duos
  for select to authenticated using (id = public.my_duo_id());

create policy "dupla: crio a minha" on public.duos
  for insert to authenticated with check (true);

-- Sair da dupla desfaz a dupla — sem parceiro, dupla de um não é nada.
create policy "dupla: desfaço a minha" on public.duos
  for delete to authenticated using (id = public.my_duo_id());

create policy "membros: vejo os da minha dupla" on public.duo_members
  for select to authenticated using (duo_id = public.my_duo_id());

-- Entrar na dupla de outra pessoa é exclusividade do accept_duo_invite.
create policy "membros: entro como eu mesmo" on public.duo_members
  for insert to authenticated with check (profile_id = auth.uid());

create policy "membros: mudo só o meu compartilhamento" on public.duo_members
  for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "membros: saio eu mesmo" on public.duo_members
  for delete to authenticated using (profile_id = auth.uid());

create policy "convites: vejo os que criei" on public.duo_invites
  for select to authenticated using (created_by = auth.uid());

create policy "convites: crio para a minha dupla" on public.duo_invites
  for insert to authenticated
  with check (created_by = auth.uid() and duo_id = public.my_duo_id());

create policy "convites: apago os meus" on public.duo_invites
  for delete to authenticated using (created_by = auth.uid());

-- 5) VIEWS COM AS DUAS COLUNAS --------------------------------
-- Esta é a peça que deixa app antigo e app novo conviverem: as views
-- passam a expor `profile_id` E `person`. O app antigo continua
-- filtrando por person, o novo filtra por profile_id, e os dois leem a
-- mesma linha. Como person↔profile_id é 1:1, incluir as duas no GROUP
-- BY não muda nenhum número.
--
-- DROP antes de recriar: `create or replace view` não aceita mudança de
-- colunas ("cannot change name of view column").
-- A 008b remove o `person` daqui, junto com o resto.

drop view if exists public.v_weekly_volume_performed;
drop view if exists public.v_weekly_volume_planned;
drop view if exists public.v_unmapped_exercises;

create view public.v_weekly_volume_performed as
select
  wl.profile_id,
  wl.person,
  (date_trunc('week', wl.date))::date as week_start,
  em.muscle_slug,
  sum(ws.n * em.contribution)         as sets
from public.workout_logs wl
join lateral (
  select count(*)::numeric as n
    from jsonb_array_elements(wl.sets) as s
   where coalesce((s->>'warmup')::boolean, false) = false
) ws on true
join public.exercise_muscles em on em.exercise_id = wl.exercise_id
where wl.exercise_id is not null
group by wl.profile_id, wl.person, (date_trunc('week', wl.date))::date, em.muscle_slug;

create view public.v_weekly_volume_planned as
select
  pe.profile_id,
  pe.person,
  em.muscle_slug,
  sum(coalesce(pe.sets_n, 0) * em.contribution) as sets
from public.plan_exercises pe
join public.exercise_muscles em on em.exercise_id = pe.exercise_id
where pe.active
group by pe.profile_id, pe.person, em.muscle_slug;

create view public.v_unmapped_exercises as
select distinct
  pe.profile_id,
  pe.person,
  e.id   as exercise_id,
  e.name as exercise_name,
  e.muscles
from public.plan_exercises pe
join public.exercises e on e.id = pe.exercise_id
where pe.active
  and not exists (select 1 from public.exercise_muscles em where em.exercise_id = e.id);

alter view public.v_weekly_volume_performed set (security_invoker = on);
alter view public.v_weekly_volume_planned   set (security_invoker = on);
alter view public.v_unmapped_exercises      set (security_invoker = on);

grant select on public.v_weekly_volume_performed to authenticated;
grant select on public.v_weekly_volume_planned   to authenticated;
grant select on public.v_unmapped_exercises      to authenticated;

-- 6) CONFERÊNCIA VISÍVEL --------------------------------------

select * from (
  select 1 as ord, 'politicas' as tipo, tablename as item, count(*)::text || ' ✅' as detalhe
    from pg_policies
   where schemaname='public' and tablename in ('profiles','duos','duo_members','duo_invites')
   group by tablename

  union all
  select 2, 'tabela bloqueada?', c.relname,
         case when c.relrowsecurity and (select count(*) from pg_policies p
              where p.schemaname='public' and p.tablename=c.relname) = 0
              then '❌ RLS sem politica' else '✅ ok' end
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r'
     and c.relname in ('profiles','duos','duo_members','duo_invites')

  union all
  select 3, 'view', viewname,
         case when definition like '%profile_id%' and definition like '%person%'
              then '✅ as duas colunas'
              when definition like '%profile_id%' then '⚠️ so profile_id'
              else '❌ so person' end
    from pg_views where schemaname='public'

  union all
  select 4, 'rpc exposta', p.proname,
         case when has_function_privilege('anon', p.oid, 'execute')
              then '❌ anon ainda pode chamar'
              when has_function_privilege('authenticated', p.oid, 'execute')
              then '✅ so logado'
              else '✅ fechada' end
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public'
     and p.proname in ('handle_new_user','duo_partner_ids','my_duo_id',
                       'readable_profile_ids','accept_duo_invite')

  union all
  select 5, 'pronto para', 'deploy do app novo',
         case when not exists (
                select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where n.nspname='public' and c.relkind='r'
                   and c.relname in ('profiles','duos','duo_members','duo_invites')
                   and c.relrowsecurity
                   and (select count(*) from pg_policies p
                         where p.schemaname='public' and p.tablename=c.relname) = 0)
              and (select count(*) from pg_views
                    where schemaname='public' and definition like '%profile_id%') = 3
              then '✅ pode subir o app' else '❌ ainda nao' end
) v order by ord, item;
