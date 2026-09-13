-- ============================================================
--  008b_lockdown.sql — aperta a RLS das tabelas de dados
--
--  Segunda metade da antiga 008. A primeira virou 008a e roda ANTES do
--  deploy (políticas de profiles/dupla + views com as duas colunas).
--  Esta aqui roda DEPOIS, porque aperta as seis tabelas de dados para
--  `profile_id = auth.uid()` — e o app antigo, que consulta por
--  `person`, pararia de enxergar os dados da Bela.
--
--      006 ✅ → 007 ✅ → 007b ✅ → 008a → DEPLOY → [ 008b ] → 009
--
--  Idempotente: as políticas são dropadas e recriadas.
--
--  Fecha os achados que sobraram:
--    1  fotos de progresso legíveis e apagáveis por qualquer autenticado
--    2  setExerciseMuscles reescrevendo o volume de todo mundo
--    3  as nove políticas em using(true)
--    4  muscle_groups apagável, com cascade para vínculos e metas
-- ============================================================

-- 0) PRÉ-CONDIÇÕES --------------------------------------------

do $$
declare n int;
begin
  select (select count(*) from public.workout_logs    where profile_id is null)
       + (select count(*) from public.body_weights    where profile_id is null)
       + (select count(*) from public.measurements    where profile_id is null)
       + (select count(*) from public.progress_photos where profile_id is null)
       + (select count(*) from public.plan_exercises  where profile_id is null)
       + (select count(*) from public.volume_targets  where profile_id is null)
    into n;
  if n > 0 then
    raise exception 'A 007 nao terminou: % linha(s) sem profile_id.', n;
  end if;

  if to_regprocedure('public.readable_profile_ids()') is null then
    raise exception 'Rode a 008a antes desta: a funcao readable_profile_ids nao existe.';
  end if;
end $$;

-- 1) LIMPEZA DAS POLÍTICAS ANTIGAS ----------------------------
-- As nove `for all to authenticated using (true)`, mais as de storage
-- (nomes antigos E os que esta migração cria, para ser idempotente).

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where (schemaname = 'public' and tablename in (
             'workout_logs','body_weights','measurements','progress_photos',
             'plan_exercises','volume_targets','exercises','exercise_muscles',
             'muscle_groups'))
        or (schemaname = 'storage' and tablename = 'objects'
            and (policyname in ('auth read photos','auth upload photos','auth delete photos')
                 or policyname like 'fotos:%'))
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'workout_logs','body_weights','measurements','progress_photos',
    'plan_exercises','volume_targets','exercises','exercise_muscles','muscle_groups'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- 2) TABELAS DE DADOS -----------------------------------------
-- Padrão: LEIO o meu e o do parceiro que compartilha; ESCREVO só o meu.
-- O `with check (profile_id = auth.uid())` é o que impede gravar linha
-- em nome do parceiro mesmo estando na tela dele.

do $$
declare t text;
begin
  foreach t in array array[
    'workout_logs','body_weights','measurements',
    'progress_photos','plan_exercises','volume_targets'
  ] loop
    execute format($f$
      create policy "%1$s: leio meu e do parceiro" on public.%1$I
        for select to authenticated
        using (profile_id in (select public.readable_profile_ids()));

      create policy "%1$s: insiro só como eu" on public.%1$I
        for insert to authenticated
        with check (profile_id = auth.uid());

      create policy "%1$s: altero só o meu" on public.%1$I
        for update to authenticated
        using (profile_id = auth.uid()) with check (profile_id = auth.uid());

      create policy "%1$s: apago só o meu" on public.%1$I
        for delete to authenticated
        using (profile_id = auth.uid());
    $f$, t);
  end loop;
end $$;

-- 3) CATÁLOGO -------------------------------------------------
-- Achado 2. Global (owner_id null) é legível por todos e editável por
-- ninguém; quem quiser mapeamento próprio cria uma cópia sua.

create policy "exercicios: vejo global e os meus" on public.exercises
  for select to authenticated
  using (owner_id is null or owner_id = auth.uid());

create policy "exercicios: crio os meus" on public.exercises
  for insert to authenticated with check (owner_id = auth.uid());

create policy "exercicios: altero só os meus" on public.exercises
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "exercicios: apago só os meus" on public.exercises
  for delete to authenticated using (owner_id = auth.uid());

-- Vínculo muscular herda o dono do exercício. É isto que impede um
-- usuário de mudar o volume calculado de todos os outros.
create policy "vinculos: leio todos" on public.exercise_muscles
  for select to authenticated using (true);

create policy "vinculos: escrevo só nos meus exercicios" on public.exercise_muscles
  for all to authenticated
  using (exists (select 1 from public.exercises e
                  where e.id = exercise_muscles.exercise_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from public.exercises e
                       where e.id = exercise_muscles.exercise_id and e.owner_id = auth.uid()));

-- 4) TAXONOMIA ------------------------------------------------
-- Achado 4: era `for all`, e as FKs de exercise_muscles e
-- volume_targets são ON DELETE CASCADE. Um delete aqui apagava
-- vínculos e metas de todo mundo. Taxonomia muda por migração.

create policy "musculos: só leitura" on public.muscle_groups
  for select to authenticated using (true);

-- 5) STORAGE -------------------------------------------------
-- Achado 1. Resolve o dono por JOIN com progress_photos, não por
-- prefixo do caminho — assim os objetos legados em `isa/…` continuam
-- válidos sem mover arquivo nenhum.

create policy "fotos: leio as minhas" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'progress-photos'
    and exists (select 1 from public.progress_photos p
                 where p.path = storage.objects.name and p.profile_id = auth.uid())
  );

-- No upload a linha em progress_photos ainda não existe, então a
-- verificação é pelo prefixo do caminho: o app grava em <uid>/arquivo.jpg.
create policy "fotos: subo na minha pasta" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'progress-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "fotos: apago as minhas" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'progress-photos'
    and (
      exists (select 1 from public.progress_photos p
               where p.path = storage.objects.name and p.profile_id = auth.uid())
      or split_part(name, '/', 1) = auth.uid()::text
    )
  );

-- 6) VIEWS SEM O `person` --------------------------------------
-- A 008a criou as views com as duas colunas para app antigo e novo
-- conviverem. O antigo já saiu do ar, então `person` sai daqui.

drop view if exists public.v_weekly_volume_performed;
drop view if exists public.v_weekly_volume_planned;
drop view if exists public.v_unmapped_exercises;

create view public.v_weekly_volume_performed as
select
  wl.profile_id,
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
group by wl.profile_id, (date_trunc('week', wl.date))::date, em.muscle_slug;

create view public.v_weekly_volume_planned as
select
  pe.profile_id,
  em.muscle_slug,
  sum(coalesce(pe.sets_n, 0) * em.contribution) as sets
from public.plan_exercises pe
join public.exercise_muscles em on em.exercise_id = pe.exercise_id
where pe.active
group by pe.profile_id, em.muscle_slug;

create view public.v_unmapped_exercises as
select distinct
  pe.profile_id,
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

-- 7) NOT NULL --------------------------------------------------
-- Última coisa: a partir daqui é impossível criar linha órfã.

do $$
declare t text;
begin
  foreach t in array array[
    'workout_logs','body_weights','measurements',
    'progress_photos','plan_exercises','volume_targets'
  ] loop
    execute format('alter table public.%I alter column profile_id set not null', t);
  end loop;
end $$;

-- 8) CONFERÊNCIA VISÍVEL -------------------------------------
-- O SQL Editor do Supabase não mostra RAISE NOTICE, então a migração
-- termina devolvendo o estado em tabela.
--
-- A primeira seção checa a janela de risco da 007b: entre aquela
-- migração e o deploy, o app antigo ainda gravava pela conta
-- compartilhada, e o `default auth.uid()` podia carimbar o dono errado.
-- Qualquer linha em que `person` e `profile_id` discordem aparece aqui.

with ids as (
  select '70b40be1-7797-4322-958c-63fa080eaa80'::uuid as bela,
         '14f6dfe3-45ad-4aff-8af2-84326ec631dd'::uuid as luca
),
divergencia as (
  select 'workout_logs' as t, count(*) as n from public.workout_logs, ids
    where person is not null
      and profile_id <> (case person when 'isa' then ids.bela else ids.luca end)
  union all
  select 'body_weights', count(*) from public.body_weights, ids
    where person is not null
      and profile_id <> (case person when 'isa' then ids.bela else ids.luca end)
  union all
  select 'measurements', count(*) from public.measurements, ids
    where person is not null
      and profile_id <> (case person when 'isa' then ids.bela else ids.luca end)
  union all
  select 'plan_exercises', count(*) from public.plan_exercises, ids
    where person is not null
      and profile_id <> (case person when 'isa' then ids.bela else ids.luca end)
)
select * from (
  select 0 as ord, 'divergencia dono' as tipo, t as item,
         case when n = 0 then '✅ nenhuma' else '⚠️ ' || n || ' linha(s) — me avise' end as detalhe
    from divergencia

  union all
  select 1, 'politicas na tabela', tablename, count(*)::text
    from pg_policies where schemaname = 'public'
   group by tablename

  union all
  select 2, 'politicas storage', 'progress-photos', count(*)::text
    from pg_policies where schemaname = 'storage' and tablename = 'objects'

  union all
  select 3, 'rls ligada', t,
         case when (select relrowsecurity from pg_class where oid = ('public.'||t)::regclass)
              then '✅ sim' else '❌ NAO' end
    from unnest(array['profiles','duos','duo_members','duo_invites','workout_logs',
                      'body_weights','measurements','progress_photos','plan_exercises',
                      'volume_targets','exercises','exercise_muscles','muscle_groups']) as t

  union all
  select 4, 'funcao', p.proname, '✅ ok'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('my_duo_id','readable_profile_ids','accept_duo_invite','duo_partner_ids')

  union all
  select 5, 'view por profile_id', c.relname,
         case when exists (select 1 from information_schema.columns
                            where table_schema='public' and table_name=c.relname
                              and column_name='profile_id')
              then '✅ ok' else '❌ FALTANDO' end
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relkind='v'
) v order by ord, item;
