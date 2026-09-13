-- ============================================================
--  007_backfill.sql — person → profile_id (BACKFILL)
--
--  PRÉ-REQUISITOS, nesta ordem:
--    1. 006_multitenant_expand.sql já rodou.       ✅ 13/09
--    2. A Bela já criou a conta dela.              ✅ 13/09
--    3. Backup feito (Database → Backups).         ← FALTA ESTE
--
--  ATENÇÃO ao mapeamento, que é o INVERSO do que a spec supunha:
--  a única conta que existe hoje (luca.luz3@hotmail.com) é do Luca, então
--  ela vira o perfil DELE. A Bela entra como conta nova.
--
--  Idempotente: só preenche o que está nulo. Rodar de novo é no-op.
--  Reversível: a coluna `person` continua intacta até a 009.
--
--  Se qualquer linha ficar órfã, a migração dá RAISE EXCEPTION e a
--  transação inteira desfaz — meia migração é pior que nenhuma.
-- ============================================================

do $$
declare
  ---------------------------------------------------------------
  --  >>> ÚNICO TRECHO PARA EDITAR <<<
  ---------------------------------------------------------------
  --  Confira os dois UUIDs em Authentication → Users antes de rodar.

  --  Ficam como texto e são validados abaixo: assim, esquecer de
  --  preencher dá uma mensagem que explica o que fazer, em vez do
  --  "invalid input syntax for type uuid" do cast.

  --  Já preenchidos a partir do 006_verify.sql rodado em 13/09.
  --  Confira em Authentication → Users antes de rodar, mesmo assim.

  txt_luca text := '14f6dfe3-45ad-4aff-8af2-84326ec631dd';  -- luca.luz3@hotmail.com
  txt_isa  text := '70b40be1-7797-4322-958c-63fa080eaa80';  -- simoes.s.isabela@gmail.com

  ---------------------------------------------------------------
  uid_isa     uuid;
  uid_luca    uuid;
  duo_id_novo uuid;
  n           int;
  restantes   int;
  detalhe     text;
begin
  ---------------------------------------------------------------
  -- 1) Sanidade dos parâmetros
  ---------------------------------------------------------------
  if txt_isa !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception
      'Falta o UUID da Bela. Abra Authentication -> Users, copie o id de %, e substitua o texto % no topo desta migracao.',
      'simoes.s.isabela@gmail.com', quote_literal(txt_isa);
  end if;
  if txt_luca !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'UUID do Luca invalido: %', quote_literal(txt_luca);
  end if;

  uid_isa  := txt_isa::uuid;
  uid_luca := txt_luca::uuid;

  if uid_isa = uid_luca then
    raise exception 'Os dois UUIDs sao iguais. Confira em Authentication -> Users.';
  end if;
  if not exists (select 1 from auth.users where id = uid_isa) then
    raise exception 'Nao existe usuario com id % (Bela). Crie a conta antes de rodar.', uid_isa;
  end if;
  if not exists (select 1 from auth.users where id = uid_luca) then
    raise exception 'Nao existe usuario com id % (Luca).', uid_luca;
  end if;

  ---------------------------------------------------------------
  -- 2) Perfis
  --    A conta da Bela é nova, então o trigger da 006 já criou a linha —
  --    com display_name derivado do e-mail ("simoes.s.isabela"). Esta
  --    migração nomeia as duas explicitamente, então SOBRESCREVE o nome:
  --    é o único lugar onde "Bela" e "Luca" estão declarados de verdade.
  --    A do Luca é de 26/05, anterior ao trigger — por isso o insert.
  --
  --    Altura vem de src/data/plans.js. Sexo e nascimento ficam nulos
  --    de propósito: entram pela tela de conta, e só são necessários
  --    na F1 (equação de Ten-Haaf).
  ---------------------------------------------------------------
  insert into public.profiles (id, display_name, height_cm)
  values (uid_isa,  'Bela', 163),
         (uid_luca, 'Luca', 180)
  on conflict (id) do update
    set display_name = excluded.display_name,
        height_cm    = coalesce(public.profiles.height_cm, excluded.height_cm),
        updated_at   = now();

  ---------------------------------------------------------------
  -- 3) Backfill das seis tabelas
  --    Só toca linha com profile_id nulo → re-rodar é seguro.
  ---------------------------------------------------------------
  update public.workout_logs    set profile_id = case person when 'isa' then uid_isa else uid_luca end where profile_id is null;
  get diagnostics n = row_count; raise notice 'workout_logs:    % linha(s)', n;

  update public.body_weights    set profile_id = case person when 'isa' then uid_isa else uid_luca end where profile_id is null;
  get diagnostics n = row_count; raise notice 'body_weights:    % linha(s)', n;

  update public.measurements    set profile_id = case person when 'isa' then uid_isa else uid_luca end where profile_id is null;
  get diagnostics n = row_count; raise notice 'measurements:    % linha(s)', n;

  update public.progress_photos set profile_id = case person when 'isa' then uid_isa else uid_luca end where profile_id is null;
  get diagnostics n = row_count; raise notice 'progress_photos: % linha(s)', n;

  update public.plan_exercises  set profile_id = case person when 'isa' then uid_isa else uid_luca end where profile_id is null;
  get diagnostics n = row_count; raise notice 'plan_exercises:  % linha(s)', n;

  update public.volume_targets  set profile_id = case person when 'isa' then uid_isa else uid_luca end where profile_id is null;
  get diagnostics n = row_count; raise notice 'volume_targets:  % linha(s)', n;

  ---------------------------------------------------------------
  -- 4) A dupla de vocês
  ---------------------------------------------------------------
  if not exists (select 1 from public.duo_members where profile_id in (uid_isa, uid_luca)) then
    insert into public.duos default values returning id into duo_id_novo;
    insert into public.duo_members (duo_id, profile_id, share_enabled)
    values (duo_id_novo, uid_isa, true),
           (duo_id_novo, uid_luca, true);
    raise notice 'Dupla criada: %', duo_id_novo;
  else
    raise notice 'Dupla ja existia — nada a fazer.';
  end if;

  ---------------------------------------------------------------
  -- 5) Verificação que aborta
  --    Nenhuma linha das seis tabelas pode sobrar sem dono.
  ---------------------------------------------------------------
  select coalesce(sum(c), 0), string_agg(format('%s=%s', t, c), ', ') filter (where c > 0)
    into restantes, detalhe
    from (
      select 'workout_logs'    as t, count(*) as c from public.workout_logs    where profile_id is null
      union all select 'body_weights',    count(*) from public.body_weights    where profile_id is null
      union all select 'measurements',    count(*) from public.measurements    where profile_id is null
      union all select 'progress_photos', count(*) from public.progress_photos where profile_id is null
      union all select 'plan_exercises',  count(*) from public.plan_exercises  where profile_id is null
      union all select 'volume_targets',  count(*) from public.volume_targets  where profile_id is null
    ) q;

  if restantes > 0 then
    raise exception 'Backfill incompleto: % linha(s) sem profile_id (%). Transacao desfeita.', restantes, detalhe;
  end if;

  raise notice '007 OK. Nenhuma linha sem dono.';
end $$;

-- 6) UNICIDADE POR PERFIL --------------------------------------
-- Fora do bloco porque índice não pode nascer dentro de um DO que
-- ainda vai ser validado. Agora que profile_id está preenchido, estes
-- índices passam a fazer sentido — e o upsert de volume_targets do
-- db.js vai precisar do primeiro (onConflict: "profile_id,muscle_slug").

create unique index if not exists uq_volume_targets_profile
  on public.volume_targets (profile_id, muscle_slug);

create unique index if not exists uq_plan_ex_active_profile
  on public.plan_exercises (profile_id, day_id, exercise_id) where active;

create index if not exists idx_logs_profile_exid
  on public.workout_logs (profile_id, exercise_id);

-- 7) CONFERÊNCIA VISÍVEL --------------------------------------
-- O SQL Editor do Supabase não mostra RAISE NOTICE, então todas as
-- contagens acima passariam despercebidas. Esta query devolve o
-- resultado em tabela: é a última coisa que a migração faz, e é o que
-- vai aparecer na tela.

select * from (
  select 1 as ord, 'perfil' as tipo,
         display_name as item,
         id::text || '  ·  ' || coalesce(height_cm::text || 'cm', 'sem altura') as detalhe
    from public.profiles

  union all
  select 2, 'dupla', 'membros',
         string_agg(p.display_name || case when dm.share_enabled then ' (compartilha)' else ' (privado)' end, ' + ')
    from public.duo_members dm join public.profiles p on p.id = dm.profile_id

  union all
  select 3, 'linhas por dono', t,
         coalesce(bela, '0') || ' Bela  ·  ' || coalesce(luca, '0') || ' Luca'
    from (
      select 'workout_logs' as t,
             count(*) filter (where profile_id = '70b40be1-7797-4322-958c-63fa080eaa80')::text as bela,
             count(*) filter (where profile_id = '14f6dfe3-45ad-4aff-8af2-84326ec631dd')::text as luca
        from public.workout_logs
      union all select 'body_weights',
             count(*) filter (where profile_id = '70b40be1-7797-4322-958c-63fa080eaa80')::text,
             count(*) filter (where profile_id = '14f6dfe3-45ad-4aff-8af2-84326ec631dd')::text
        from public.body_weights
      union all select 'measurements',
             count(*) filter (where profile_id = '70b40be1-7797-4322-958c-63fa080eaa80')::text,
             count(*) filter (where profile_id = '14f6dfe3-45ad-4aff-8af2-84326ec631dd')::text
        from public.measurements
      union all select 'progress_photos',
             count(*) filter (where profile_id = '70b40be1-7797-4322-958c-63fa080eaa80')::text,
             count(*) filter (where profile_id = '14f6dfe3-45ad-4aff-8af2-84326ec631dd')::text
        from public.progress_photos
      union all select 'plan_exercises',
             count(*) filter (where profile_id = '70b40be1-7797-4322-958c-63fa080eaa80')::text,
             count(*) filter (where profile_id = '14f6dfe3-45ad-4aff-8af2-84326ec631dd')::text
        from public.plan_exercises
      union all select 'volume_targets',
             count(*) filter (where profile_id = '70b40be1-7797-4322-958c-63fa080eaa80')::text,
             count(*) filter (where profile_id = '14f6dfe3-45ad-4aff-8af2-84326ec631dd')::text
        from public.volume_targets
    ) c

  union all
  -- Tem que dar zero. Se não der, a migração já teria abortado antes —
  -- mas conferir de novo é barato.
  select 4, 'sem dono', 'total',
         ((select count(*) from public.workout_logs    where profile_id is null)
        + (select count(*) from public.body_weights    where profile_id is null)
        + (select count(*) from public.measurements    where profile_id is null)
        + (select count(*) from public.progress_photos where profile_id is null)
        + (select count(*) from public.plan_exercises  where profile_id is null)
        + (select count(*) from public.volume_targets  where profile_id is null))::text
        || ' linha(s)  ← tem que ser 0'
) v
order by ord, tipo, item;

-- 8) O QUE ESTA MIGRAÇÃO DE PROPÓSITO NÃO FAZ ------------------
--
--  * Não mexe nos caminhos do Storage. As 4 fotos continuam em `isa/…`.
--    A política corrigida da 008 resolve o dono por JOIN com
--    progress_photos, não por prefixo — então mover arquivo seria
--    trabalho jogado fora.
--
--  * Não mexe em `person`. Ela morre na 009, depois de dias de app novo
--    rodando em paz.
--
--  * Não toca nas políticas de RLS. Enquanto a 008 não rodar, todo
--    autenticado continua enxergando tudo — que é exatamente como o
--    app antigo espera funcionar.
