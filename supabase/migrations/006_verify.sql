-- ============================================================
--  006_verify.sql — confere se a 006 pegou. Não altera nada.
--
--  O SQL Editor do Supabase não mostra RAISE NOTICE, então a 006
--  roda "em silêncio". Esta query devolve o estado em tabela.
--
--  Também lista os UUIDs do auth — é daqui que sai o valor para
--  colar no topo da 007, sem precisar caçar no painel.
-- ============================================================

select * from (

  -- 1) Tabelas novas
  select 1 as ord, 'tabela' as tipo, t as item,
         case when to_regclass('public.'||t) is null then '❌ FALTANDO' else '✅ ok' end as status
    from unnest(array['profiles','duos','duo_members','duo_invites']) as t

  union all
  -- 2) profile_id nas seis tabelas de dados
  select 2, 'coluna profile_id', t,
         case when exists (
           select 1 from information_schema.columns
            where table_schema='public' and table_name=t and column_name='profile_id')
         then '✅ ok' else '❌ FALTANDO' end
    from unnest(array['workout_logs','body_weights','measurements',
                      'progress_photos','plan_exercises','volume_targets']) as t

  union all
  -- 3) owner_id no catálogo
  select 3, 'coluna', 'exercises.owner_id',
         case when exists (
           select 1 from information_schema.columns
            where table_schema='public' and table_name='exercises' and column_name='owner_id')
         then '✅ ok' else '❌ FALTANDO' end

  union all
  -- 4) A FK que não existia. Se aparecer FALTANDO, há log órfão:
  --    rode a query do bloco 8 para ver quais e me avise.
  select 4, 'foreign key', 'workout_logs.exercise_id',
         case when exists (
           select 1 from pg_constraint
            where conname='workout_logs_exercise_id_fkey'
              and conrelid='public.workout_logs'::regclass)
         then '✅ criada' else '❌ NAO criada (ha orfao)' end

  union all
  -- 5) Índices duplicados devem ter sumido
  select 5, 'indice duplicado', i,
         case when exists (select 1 from pg_indexes
                            where schemaname='public' and indexname=i)
         then '❌ ainda existe' else '✅ removido' end
    from unnest(array['uq_exercises_name','uq_plan_ex_active']) as i

  union all
  -- 6) Índices parciais novos do catálogo
  select 6, 'indice novo', i,
         case when exists (select 1 from pg_indexes
                            where schemaname='public' and indexname=i)
         then '✅ ok' else '❌ FALTANDO' end
    from unnest(array['uq_exercises_name_global','uq_exercises_name_owned']) as i

  union all
  -- 7) Trigger de criação de perfil
  select 7, 'trigger', 'on_auth_user_created',
         case when exists (select 1 from pg_trigger where tgname='on_auth_user_created')
         then '✅ ok' else '❌ FALTANDO' end

  union all
  -- 8) Logs órfãos (só informativo)
  select 8, 'info', 'logs sem exercise_id',
         (select count(*)::text from public.workout_logs where exercise_id is null) || ' log(s)'

  union all
  -- 9) >>> OS UUIDs PARA A 007 <<<
  --     Copie o id da linha do seu e-mail e cole no topo da 007.
  select 9, '>>> UUID p/ 007', coalesce(email,'(sem email)'), id::text
    from auth.users

  union all
  -- 10) Perfis já criados pelo trigger
  select 10, 'perfil existente', coalesce(nullif(display_name,''),'(sem nome)'), id::text
    from public.profiles

) x
order by ord, item;
