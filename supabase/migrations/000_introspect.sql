-- ============================================================
--  000_introspect.sql — NÃO altera nada. Só lê.
--
--  Rode no SQL Editor do Supabase e me mande o resultado inteiro.
--  O schema já divergiu do repo antes (ver cabeçalho do 002), então
--  preciso do estado REAL antes de escrever a migração multi-tenant.
--
--  Devolve uma única coluna de texto para caber num copiar/colar.
-- ============================================================

with
tabelas as (
  select
    10 as ord,
    format('TABELA  %-22s  %-18s  %s  %s',
           c.relname,
           a.attname,
           rpad(format_type(a.atttypid, a.atttypmod), 14),
           case when a.attnotnull then 'NOT NULL' else '' end) as linha
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where n.nspname = 'public'
    and c.relkind = 'r'
),
views as (
  select 20 as ord,
         format('VIEW    %-22s  security_invoker=%s',
                c.relname,
                coalesce((select option_value from pg_options_to_table(c.reloptions)
                           where option_name = 'security_invoker'), 'off')) as linha
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
),
politicas as (
  select 30 as ord,
         format('POLICY  %-22s  %-26s  cmd=%-6s  roles=%s',
                tablename, policyname, cmd, array_to_string(roles, ',')) as linha
  from pg_policies
  where schemaname in ('public','storage')
),
rls as (
  select 40 as ord,
         format('RLS     %-22s  enabled=%s', c.relname, c.relrowsecurity) as linha
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
indices as (
  select 50 as ord,
         format('INDEX   %-22s  %s', tablename, indexdef) as linha
  from pg_indexes
  where schemaname = 'public'
),
constraints as (
  select 60 as ord,
         format('CHECK   %-22s  %s  %s',
                rel.relname, con.conname, pg_get_constraintdef(con.oid)) as linha
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public' and con.contype in ('c','f','p','u')
),
contagens as (
  select 70 as ord, linha from (
    select format('DADOS   workout_logs       person=%-6s  n=%s  primeiro=%s  ultimo=%s',
                  person, count(*), min(date), max(date)) as linha
      from public.workout_logs group by person
    union all
    select format('DADOS   body_weights       person=%-6s  n=%s  primeiro=%s  ultimo=%s',
                  person, count(*), min(date), max(date))
      from public.body_weights group by person
    union all
    select format('DADOS   measurements       person=%-6s  n=%s', person, count(*))
      from public.measurements group by person
    union all
    select format('DADOS   progress_photos    person=%-6s  n=%s', person, count(*))
      from public.progress_photos group by person
    union all
    select format('DADOS   plan_exercises     person=%-6s  n=%s  ativos=%s',
                  person, count(*), count(*) filter (where active))
      from public.plan_exercises group by person
    union all
    select format('DADOS   volume_targets     person=%-6s  n=%s', person, count(*))
      from public.volume_targets group by person
    union all
    select format('DADOS   exercises          total=%s  com_vinculo_muscular=%s',
                  (select count(*) from public.exercises),
                  (select count(distinct exercise_id) from public.exercise_muscles))
    union all
    select format('DADOS   exercise_muscles   total=%s', (select count(*) from public.exercise_muscles))
    union all
    select format('DADOS   logs sem exercise_id  n=%s',
                  (select count(*) from public.workout_logs where exercise_id is null))
  ) q
),
usuarios as (
  select 80 as ord,
         format('AUTH    id=%s  email=%s  criado=%s  confirmado=%s',
                id, email, created_at::date,
                case when email_confirmed_at is null then 'nao' else 'sim' end) as linha
  from auth.users
),
storage_obj as (
  select 90 as ord,
         format('STORAGE bucket=%s  prefixo=%s  n=%s',
                bucket_id, split_part(name, '/', 1), count(*)) as linha
  from storage.objects
  group by bucket_id, split_part(name, '/', 1)
),
cabecalho as (
  select ord, linha from (values
    (1, '================ INTROSPECÇÃO TREINO DUO ================'),
    (2, format('gerado em %s', now()::timestamp(0)))
  ) v(ord, linha)
)
select linha
from (
  select ord, linha from cabecalho
  union all select ord, linha from tabelas
  union all select ord, linha from views
  union all select ord, linha from rls
  union all select ord, linha from politicas
  union all select ord, linha from indices
  union all select ord, linha from constraints
  union all select ord, linha from contagens
  union all select ord, linha from usuarios
  union all select ord, linha from storage_obj
) tudo
order by ord, linha;
