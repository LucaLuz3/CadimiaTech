-- ============================================================
--  007b_person_nullable.sql — solta o `person` (PRÉ-DEPLOY)
--
--  Migração que não estava no plano. Apareceu num teste de escrita
--  contra réplica: o app novo parou de enviar `person`, mas a coluna
--  continua NOT NULL até a 009. Sem isto, TODO INSERT falha entre o
--  deploy e a 009 — em todas as seis tabelas.
--
--      insert into workout_logs (exercise_name, date, sets) ...
--      ERROR: null value in column "person" violates not-null constraint
--
--  Em volume_targets é pior: `person` faz parte da PRIMARY KEY, então
--  nem nullable resolve — a chave precisa passar para profile_id.
--
--  ORDEM: rode esta ANTES do deploy do app novo.
--
--      006 ✅ → 007 ✅ → [ 007b ] → deploy → 008 → 009
--
--  Idempotente. Não quebra o app antigo: ele continua mandando `person`
--  em todo insert, e coluna nullable aceita valor normalmente.
--
--  ⚠️  JANELA DE RISCO — leia antes de rodar
--  Entre esta migração e o deploy, o app ANTIGO ainda grava. E ele roda
--  na conta compartilhada, então o `default auth.uid()` carimbaria o
--  dono errado: um treino registrado como 'isa' sairia com o profile_id
--  do Luca. Rode esta migração e faça o deploy na mesma sentada, e não
--  registre treino no meio. A 008 detecta e reporta qualquer divergência.
-- ============================================================

-- 1) volume_targets: a chave primária precisa mudar de dono -----
-- O índice único (profile_id, muscle_slug) já existe desde a 007, então
-- a troca é barata. Feita primeiro porque é a única destrutiva.

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.volume_targets'::regclass
       and contype = 'p'
       and pg_get_constraintdef(oid) like '%person%'
  ) then
    alter table public.volume_targets drop constraint volume_targets_pkey;
    alter table public.volume_targets add constraint volume_targets_pkey
      primary key (profile_id, muscle_slug);
    raise notice 'volume_targets: PK trocada de (person, muscle_slug) para (profile_id, muscle_slug).';
  else
    raise notice 'volume_targets: PK ja estava em profile_id.';
  end if;
end $$;

-- 2) person deixa de ser obrigatória nas seis tabelas -----------

do $$
declare t text;
begin
  foreach t in array array[
    'workout_logs','body_weights','measurements',
    'progress_photos','plan_exercises','volume_targets'
  ] loop
    execute format('alter table public.%I alter column person drop not null', t);
  end loop;
  raise notice 'person agora aceita nulo nas 6 tabelas.';
end $$;

-- O check `person in ('isa','luca')` pode ficar: em Postgres, CHECK
-- sobre valor nulo resulta em NULL, que NÃO reprova a linha. Some na 009
-- junto com a coluna.

-- 3) CONFERÊNCIA VISÍVEL ---------------------------------------

select * from (
  select 1 as ord, 'coluna person' as tipo, table_name as item,
         case when is_nullable = 'YES' then '✅ aceita nulo' else '❌ ainda NOT NULL' end as status
    from information_schema.columns c
   where table_schema = 'public' and column_name = 'person'
     -- só tabelas: views também têm a coluna e poluiriam a conferência
     and exists (select 1 from pg_class k join pg_namespace n on n.oid=k.relnamespace
                  where n.nspname='public' and k.relname=c.table_name and k.relkind='r')

  union all
  select 2, 'chave primaria', 'volume_targets',
         case when pg_get_constraintdef(oid) like '%profile_id%'
              then '✅ ' || pg_get_constraintdef(oid)
              else '❌ ' || pg_get_constraintdef(oid) end
    from pg_constraint
   where conrelid = 'public.volume_targets'::regclass and contype = 'p'

  union all
  select 3, 'pronto para', 'deploy do app novo',
         case when not exists (
                select 1 from information_schema.columns c
                 where table_schema='public' and column_name='person' and is_nullable='NO'
                   and exists (select 1 from pg_class k join pg_namespace n on n.oid=k.relnamespace
                                where n.nspname='public' and k.relname=c.table_name and k.relkind='r'))
              then '✅ pode subir o app'
              else '❌ ainda nao' end
) v order by ord, item;
