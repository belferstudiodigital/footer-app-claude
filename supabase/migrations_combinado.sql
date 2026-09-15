-- FOOTER: schema completo combinado (0001 a 0004), pronto para colar no SQL Editor do Supabase de uma vez.
-- Este arquivo começa apagando e recriando o schema 'public' do zero, para não dar conflito
-- com tentativas anteriores que tenham parado no meio. Seguro de rodar quantas vezes precisar
-- (só não rode isso se já tiver dado real de clubes/jogos que você queira manter).

-- ============================================================
-- RESET do schema public
-- ============================================================
drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to postgres, service_role;
alter default privileges in schema public grant all on sequences to postgres, service_role;
alter default privileges in schema public grant all on functions to postgres, service_role;

-- Grants de base para anon/authenticated (o que todo projeto novo do Supabase já
-- vem com de fábrica, e que se perde ao recriar o schema public do zero como acima).
-- A segurança de verdade continua nas políticas de RLS definidas mais abaixo —
-- isso aqui só libera o acesso "de base" que o Postgres exige antes de avaliar RLS.
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated;

-- ============================================================
-- 0001_schema.sql
-- ============================================================
-- =========================================================================
-- FOOTER — schema principal
-- Convenção: todo dado multi-tenant carrega clube_id para permitir RLS
-- simples e direta. Papéis ficam em tabela separada de auth.users (nunca
-- misturados com o perfil), conforme exigência de segurança do produto.
-- =========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type situacao_clube as enum ('pendente', 'ativo', 'suspenso', 'cancelado', 'inadimplente');
create type plano_clube as enum ('standard', 'pro', 'ultra');
create type papel_usuario as enum ('admin_clube', 'superadmin');
create type situacao_jogo as enum ('aguardando', 'confirmado', 'cancelado', 'auto_cancelado', 'encerrado');
create type posicao_jogador as enum ('linha', 'goleiro');
create type status_confirmacao as enum ('confirmado', 'espera', 'nao_vai', 'pendente_mensalista', 'furo');
create type origem_liberacao_vaga as enum ('voluntaria', 'furo_auto_liberado');
create type tipo_pagamento as enum ('mensal', 'avulso');
create type status_pagamento as enum ('pendente', 'declarado', 'pago');
create type tipo_furo as enum ('automatico', 'manual');
create type tipo_notificacao as enum (
  'abertura_lista', 'lembrete_semanal', 'minimo_atingido', 'maximo_atingido',
  'sem_minimo', 'vaga_liberada', 'aviso_semanal_mensalistas_risco'
);
create type situacao_notificacao as enum ('sucesso', 'falha', 'sem_dispositivo');
create type situacao_fatura as enum ('pago', 'pendente', 'atrasado');

-- ---------------------------------------------------------------------
-- CLUBES
-- ---------------------------------------------------------------------
create table clubes (
  id uuid primary key default gen_random_uuid(),
  nome_responsavel text not null,
  email text not null unique,
  cpf text not null,
  whatsapp text not null, -- E.164, ex: +5511999999999
  nome_clube text not null,
  situacao situacao_clube not null default 'pendente',
  plano plano_clube,
  provider_customer_id text,
  subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- PAPÉIS DE USUÁRIO (nunca misturar com perfil/clube)
-- ---------------------------------------------------------------------
create table papeis_usuario (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clube_id uuid references clubes(id) on delete cascade,
  papel papel_usuario not null,
  created_at timestamptz not null default now(),
  constraint papel_clube_coerente check (
    (papel = 'admin_clube' and clube_id is not null) or
    (papel = 'superadmin' and clube_id is null)
  ),
  unique (user_id, papel, clube_id)
);
create index idx_papeis_usuario_user on papeis_usuario(user_id);

-- ---------------------------------------------------------------------
-- TIMES / GRUPOS RECORRENTES
-- ---------------------------------------------------------------------
create table times (
  id uuid primary key default gen_random_uuid(),
  clube_id uuid not null references clubes(id) on delete cascade,
  nome text not null,
  dia_semana smallint not null check (dia_semana between 0 and 6), -- 0=domingo
  horario_inicio time not null,
  horario_fim time not null,
  local text not null,
  minimo_jogadores smallint not null check (minimo_jogadores > 0),
  maximo_jogadores smallint not null,
  maximo_goleiros smallint not null default 2,
  maximo_espera smallint not null default 10,
  -- prazo geral: horas antes do início em que a lista fecha
  horas_limite_confirmacao numeric not null default 2,
  -- prazo do mensalista: horas antes do início (deve ser >= horas_limite_confirmacao,
  -- ou seja, ocorre ANTES do prazo geral no tempo)
  horas_prazo_confirmacao_mensalista numeric not null default 24,
  janela_furos_semanas smallint not null default 4,
  dia_aviso_semanal smallint check (dia_aviso_semanal between 0 and 6),
  horario_aviso_semanal time,
  whatsapp_admin text not null,
  valor_avulso_centavos integer,
  chave_pix text,
  recados text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint minimo_menor_maximo check (minimo_jogadores <= maximo_jogadores),
  constraint goleiros_menor_maximo check (maximo_goleiros <= maximo_jogadores),
  constraint prazo_mensalista_antes_do_geral check (horas_prazo_confirmacao_mensalista >= horas_limite_confirmacao)
);
create index idx_times_clube on times(clube_id);

-- ---------------------------------------------------------------------
-- JOGOS (instâncias semanais geradas a partir de um time)
-- ---------------------------------------------------------------------
create table jogos (
  id uuid primary key default gen_random_uuid(),
  time_id uuid not null references times(id) on delete cascade,
  clube_id uuid not null references clubes(id) on delete cascade,
  data_jogo date not null,
  horario_inicio time not null,
  horario_fim time not null,
  local text not null,
  situacao situacao_jogo not null default 'aguardando',
  horario_limite timestamptz not null,
  prazo_confirmacao_mensalista timestamptz not null,
  recados text,
  furos_processados boolean not null default false,
  auto_cancelamento_avaliado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (time_id, data_jogo)
);
create index idx_jogos_time on jogos(time_id);
create index idx_jogos_clube on jogos(clube_id);
create index idx_jogos_data on jogos(data_jogo);
create index idx_jogos_prazo_mensalista on jogos(prazo_confirmacao_mensalista) where furos_processados = false;
create index idx_jogos_horario_limite on jogos(horario_limite) where auto_cancelamento_avaliado = false;

-- ---------------------------------------------------------------------
-- MENSALISTAS
-- ---------------------------------------------------------------------
create table mensalistas (
  id uuid primary key default gen_random_uuid(),
  clube_id uuid not null references clubes(id) on delete cascade,
  time_id uuid not null references times(id) on delete cascade,
  nome text not null,
  nome_normalizado text not null,
  posicao_padrao posicao_jogador not null default 'linha',
  ativo boolean not null default true,
  contador_furos_recentes smallint not null default 0,
  sequencia_confirmacoes smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (time_id, nome_normalizado)
);
create index idx_mensalistas_time on mensalistas(time_id);
create index idx_mensalistas_clube on mensalistas(clube_id);

-- ---------------------------------------------------------------------
-- CONFIRMAÇÕES (presenças por jogo)
-- ---------------------------------------------------------------------
create table confirmacoes (
  id uuid primary key default gen_random_uuid(),
  jogo_id uuid not null references jogos(id) on delete cascade,
  clube_id uuid not null references clubes(id) on delete cascade,
  mensalista_id uuid references mensalistas(id) on delete set null,
  nome text not null,
  nome_normalizado text not null,
  posicao posicao_jogador not null default 'linha',
  status status_confirmacao not null default 'confirmado',
  -- true = ocupa vaga principal (conta em maximo_jogadores/maximo_goleiros)
  -- false = ocupa vaga na lista de espera (conta em maximo_espera)
  -- válido para status 'confirmado' | 'espera' | 'pendente_mensalista'
  vaga_principal boolean not null default true,
  origem_liberacao origem_liberacao_vaga,
  ordem_entrada bigserial,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (jogo_id, nome_normalizado)
);
create index idx_confirmacoes_jogo on confirmacoes(jogo_id);
create index idx_confirmacoes_clube on confirmacoes(clube_id);
create index idx_confirmacoes_mensalista on confirmacoes(mensalista_id);
create index idx_confirmacoes_status on confirmacoes(jogo_id, status, posicao, ordem_entrada);

-- ---------------------------------------------------------------------
-- HISTÓRICO DE FUROS (vinculado ao mensalista, sobrevive a renomeações)
-- ---------------------------------------------------------------------
create table furos_mensalista (
  id uuid primary key default gen_random_uuid(),
  mensalista_id uuid not null references mensalistas(id) on delete cascade,
  jogo_id uuid references jogos(id) on delete set null,
  clube_id uuid not null references clubes(id) on delete cascade,
  tipo tipo_furo not null default 'automatico',
  created_at timestamptz not null default now(),
  unique (mensalista_id, jogo_id)
);
create index idx_furos_mensalista on furos_mensalista(mensalista_id);

-- ---------------------------------------------------------------------
-- PAGAMENTOS
-- ---------------------------------------------------------------------
create table pagamentos (
  id uuid primary key default gen_random_uuid(),
  clube_id uuid not null references clubes(id) on delete cascade,
  time_id uuid not null references times(id) on delete cascade,
  tipo tipo_pagamento not null,
  mensalista_id uuid references mensalistas(id) on delete set null,
  jogo_id uuid references jogos(id) on delete set null,
  referencia_mes date, -- primeiro dia do mês, para tipo = mensal
  nome text not null,
  nome_normalizado text not null,
  valor_centavos integer,
  status status_pagamento not null default 'pendente',
  declarado_em timestamptz,
  pago_em timestamptz,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index uq_pagamento_mensal on pagamentos(time_id, nome_normalizado, referencia_mes) where tipo = 'mensal';
create unique index uq_pagamento_avulso on pagamentos(jogo_id, nome_normalizado) where tipo = 'avulso';
create index idx_pagamentos_clube on pagamentos(clube_id);
create index idx_pagamentos_time on pagamentos(time_id);
create index idx_pagamentos_status on pagamentos(clube_id, status);

-- ---------------------------------------------------------------------
-- SORTEIOS
-- ---------------------------------------------------------------------
create table sorteios (
  id uuid primary key default gen_random_uuid(),
  jogo_id uuid not null references jogos(id) on delete cascade,
  clube_id uuid not null references clubes(id) on delete cascade,
  configuracao jsonb not null,
  resultado jsonb not null,
  created_at timestamptz not null default now()
);
create index idx_sorteios_jogo on sorteios(jogo_id);

-- ---------------------------------------------------------------------
-- NOTIFICAÇÕES (histórico)
-- ---------------------------------------------------------------------
create table notificacoes (
  id uuid primary key default gen_random_uuid(),
  clube_id uuid not null references clubes(id) on delete cascade,
  time_id uuid references times(id) on delete cascade,
  jogo_id uuid references jogos(id) on delete cascade,
  tipo tipo_notificacao not null,
  ciclo text not null, -- chave de deduplicação (ex.: jogo_id:tipo:versao)
  situacao situacao_notificacao not null,
  erro text,
  destinatarios jsonb not null default '[]'::jsonb,
  mensagem text not null,
  created_at timestamptz not null default now()
);
create unique index uq_notificacao_ciclo on notificacoes(clube_id, ciclo);
create index idx_notificacoes_clube on notificacoes(clube_id, created_at desc);

-- ---------------------------------------------------------------------
-- TOKENS DE PUSH
-- ---------------------------------------------------------------------
create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clube_id uuid not null references clubes(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index idx_push_tokens_clube on push_tokens(clube_id);

-- ---------------------------------------------------------------------
-- FATURAS (histórico de cobrança — modo sandbox/manual neste teste)
-- ---------------------------------------------------------------------
create table faturas (
  id uuid primary key default gen_random_uuid(),
  clube_id uuid not null references clubes(id) on delete cascade,
  plano plano_clube not null,
  valor_centavos integer not null,
  status situacao_fatura not null default 'pendente',
  referencia_mes date not null,
  pago_em timestamptz,
  created_at timestamptz not null default now()
);
create index idx_faturas_clube on faturas(clube_id, referencia_mes desc);

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_clubes_updated_at before update on clubes for each row execute function set_updated_at();
create trigger trg_times_updated_at before update on times for each row execute function set_updated_at();
create trigger trg_jogos_updated_at before update on jogos for each row execute function set_updated_at();
create trigger trg_mensalistas_updated_at before update on mensalistas for each row execute function set_updated_at();
create trigger trg_confirmacoes_updated_at before update on confirmacoes for each row execute function set_updated_at();
create trigger trg_pagamentos_updated_at before update on pagamentos for each row execute function set_updated_at();

-- ============================================================
-- 0002_rls.sql
-- ============================================================
-- =========================================================================
-- FOOTER — funções auxiliares de autorização + RLS
-- =========================================================================

-- ---------------------------------------------------------------------
-- Funções auxiliares (security definer para evitar recursão de RLS
-- ao consultar a própria tabela de papéis)
-- ---------------------------------------------------------------------
create or replace function is_superadmin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from papeis_usuario
    where user_id = auth.uid() and papel = 'superadmin'
  );
$$;

create or replace function meu_clube_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select clube_id from papeis_usuario
  where user_id = auth.uid() and papel = 'admin_clube'
  limit 1;
$$;

create or replace function e_admin_do_clube(p_clube_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from papeis_usuario
    where user_id = auth.uid() and papel = 'admin_clube' and clube_id = p_clube_id
  );
$$;

-- ---------------------------------------------------------------------
-- Ativa RLS em todas as tabelas
-- ---------------------------------------------------------------------
alter table clubes enable row level security;
alter table papeis_usuario enable row level security;
alter table times enable row level security;
alter table jogos enable row level security;
alter table mensalistas enable row level security;
alter table confirmacoes enable row level security;
alter table furos_mensalista enable row level security;
alter table pagamentos enable row level security;
alter table sorteios enable row level security;
alter table notificacoes enable row level security;
alter table push_tokens enable row level security;
alter table faturas enable row level security;

-- ---------------------------------------------------------------------
-- CLUBES
-- ---------------------------------------------------------------------
create policy clubes_select_proprio on clubes for select
  using (id = meu_clube_id() or is_superadmin());

create policy clubes_update_proprio on clubes for update
  using (id = meu_clube_id() or is_superadmin());

create policy clubes_insert_signup on clubes for insert
  with check (true); -- criação ocorre via função de cadastro (auth ainda não vinculado)

create policy clubes_superadmin_all on clubes for delete
  using (is_superadmin());

-- ---------------------------------------------------------------------
-- PAPÉIS DE USUÁRIO
-- ---------------------------------------------------------------------
create policy papeis_select_proprio on papeis_usuario for select
  using (user_id = auth.uid() or is_superadmin());

create policy papeis_superadmin_gerencia on papeis_usuario for all
  using (is_superadmin())
  with check (is_superadmin());

-- ---------------------------------------------------------------------
-- TIMES — admin do clube tem CRUD; público (anon) só lê
-- ---------------------------------------------------------------------
create policy times_select_publico on times for select
  using (true);

create policy times_admin_insert on times for insert
  with check (e_admin_do_clube(clube_id) or is_superadmin());

create policy times_admin_update on times for update
  using (e_admin_do_clube(clube_id) or is_superadmin());

create policy times_admin_delete on times for delete
  using (e_admin_do_clube(clube_id) or is_superadmin());

-- ---------------------------------------------------------------------
-- JOGOS — leitura pública; escrita só via função (jobs) ou admin
-- ---------------------------------------------------------------------
create policy jogos_select_publico on jogos for select
  using (true);

create policy jogos_admin_update on jogos for update
  using (e_admin_do_clube(clube_id) or is_superadmin());

create policy jogos_admin_insert on jogos for insert
  with check (e_admin_do_clube(clube_id) or is_superadmin());

create policy jogos_admin_delete on jogos for delete
  using (e_admin_do_clube(clube_id) or is_superadmin());

-- ---------------------------------------------------------------------
-- MENSALISTAS — leitura pública limitada (nome/ativo/contador), CRUD admin
-- ---------------------------------------------------------------------
create policy mensalistas_select_publico on mensalistas for select
  using (true);

create policy mensalistas_admin_insert on mensalistas for insert
  with check (e_admin_do_clube(clube_id) or is_superadmin());

create policy mensalistas_admin_update on mensalistas for update
  using (e_admin_do_clube(clube_id) or is_superadmin());

create policy mensalistas_admin_delete on mensalistas for delete
  using (e_admin_do_clube(clube_id) or is_superadmin());

-- ---------------------------------------------------------------------
-- CONFIRMAÇÕES — leitura pública; escrita do público SOMENTE via RPC
-- (confirmar_presenca / cancelar_presenca, security definer). Direto na
-- tabela, só admin do clube pode escrever (Controle de presença).
-- ---------------------------------------------------------------------
create policy confirmacoes_select_publico on confirmacoes for select
  using (true);

create policy confirmacoes_admin_insert on confirmacoes for insert
  with check (e_admin_do_clube(clube_id) or is_superadmin());

create policy confirmacoes_admin_update on confirmacoes for update
  using (e_admin_do_clube(clube_id) or is_superadmin());

create policy confirmacoes_admin_delete on confirmacoes for delete
  using (e_admin_do_clube(clube_id) or is_superadmin());

-- ---------------------------------------------------------------------
-- FUROS — leitura pública (para badge), escrita só via função/admin
-- ---------------------------------------------------------------------
create policy furos_select_publico on furos_mensalista for select
  using (true);

create policy furos_admin_insert on furos_mensalista for insert
  with check (e_admin_do_clube(clube_id) or is_superadmin());

create policy furos_admin_delete on furos_mensalista for delete
  using (e_admin_do_clube(clube_id) or is_superadmin());

-- ---------------------------------------------------------------------
-- PAGAMENTOS — leitura pública passa por VIEW sem valores (abaixo);
-- a tabela crua só é legível pelo admin do próprio clube. Escrita pública
-- (declarar "já paguei") só via RPC declarar_pagamento.
-- ---------------------------------------------------------------------
create policy pagamentos_select_admin on pagamentos for select
  using (e_admin_do_clube(clube_id) or is_superadmin());

create policy pagamentos_admin_insert on pagamentos for insert
  with check (e_admin_do_clube(clube_id) or is_superadmin());

create policy pagamentos_admin_update on pagamentos for update
  using (e_admin_do_clube(clube_id) or is_superadmin());

create policy pagamentos_admin_delete on pagamentos for delete
  using (e_admin_do_clube(clube_id) or is_superadmin());

-- ---------------------------------------------------------------------
-- SORTEIOS
-- ---------------------------------------------------------------------
create policy sorteios_admin_all on sorteios for all
  using (e_admin_do_clube(clube_id) or is_superadmin())
  with check (e_admin_do_clube(clube_id) or is_superadmin());

-- ---------------------------------------------------------------------
-- NOTIFICAÇÕES
-- ---------------------------------------------------------------------
create policy notificacoes_admin_select on notificacoes for select
  using (e_admin_do_clube(clube_id) or is_superadmin());

create policy notificacoes_admin_insert on notificacoes for insert
  with check (e_admin_do_clube(clube_id) or is_superadmin());

-- ---------------------------------------------------------------------
-- PUSH TOKENS
-- ---------------------------------------------------------------------
create policy push_tokens_proprio on push_tokens for all
  using (user_id = auth.uid() or is_superadmin())
  with check (user_id = auth.uid() or is_superadmin());

-- ---------------------------------------------------------------------
-- FATURAS
-- ---------------------------------------------------------------------
create policy faturas_admin_select on faturas for select
  using (e_admin_do_clube(clube_id) or is_superadmin());

create policy faturas_superadmin_gerencia on faturas for all
  using (is_superadmin())
  with check (is_superadmin());

-- ---------------------------------------------------------------------
-- VIEW pública de pagamentos — nunca expõe valor, data ou observação.
-- Usada pela lista pública para badges de status (seção 18 do PRD).
--
-- IMPORTANTE: esta view é criada SEM security_invoker (padrão = roda com
-- os privilégios do dono da view, que é dono das tabelas e portanto não
-- está sujeito à RLS de `pagamentos`). Isso permite expor só as colunas
-- selecionadas para todas as linhas, enquanto a tabela `pagamentos` em si
-- continua com RLS restrita a admin do clube (policy pagamentos_select_admin
-- acima, nunca removida). Nenhuma tela pública deve consultar a tabela
-- `pagamentos` diretamente — sempre via esta view.
-- ---------------------------------------------------------------------
create view pagamentos_status_publico as
select
  id,
  clube_id,
  time_id,
  tipo,
  mensalista_id,
  jogo_id,
  referencia_mes,
  nome,
  nome_normalizado,
  status
from pagamentos;

grant select on pagamentos_status_publico to anon, authenticated;

-- ============================================================
-- 0003_functions.sql
-- ============================================================
-- =========================================================================
-- FOOTER — funções transacionais (regras de negócio)
-- Todas security definer: fazem sua própria checagem de autorização,
-- pois RLS é contornada pelo dono da função (papel de migração).
-- =========================================================================

-- ---------------------------------------------------------------------
-- Normalização de nome (usada em toda comparação/dedup)
-- ---------------------------------------------------------------------
create or replace function normalizar_nome(p_nome text) returns text
language sql immutable as $$
  select lower(regexp_replace(trim(translate(coalesce(p_nome, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
  )), '\s+', ' ', 'g'));
$$;

create or replace function preencher_nome_normalizado() returns trigger
language plpgsql as $$
begin
  new.nome_normalizado := normalizar_nome(new.nome);
  return new;
end;
$$;

create trigger trg_mensalistas_nome_norm before insert or update of nome on mensalistas
  for each row execute function preencher_nome_normalizado();
create trigger trg_confirmacoes_nome_norm before insert or update of nome on confirmacoes
  for each row execute function preencher_nome_normalizado();
create trigger trg_pagamentos_nome_norm before insert or update of nome on pagamentos
  for each row execute function preencher_nome_normalizado();

-- ---------------------------------------------------------------------
-- Permissão combinada: admin do próprio clube, superadmin, ou o serviço
-- (edge function / cron rodando com a chave de serviço).
-- ---------------------------------------------------------------------
create or replace function pode_gerenciar_clube(p_clube_id uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select auth.role() = 'service_role' or is_superadmin() or e_admin_do_clube(p_clube_id);
$$;

-- =========================================================================
-- CADASTRO
-- =========================================================================
create or replace function criar_clube(
  p_nome_responsavel text,
  p_email text,
  p_cpf text,
  p_whatsapp text,
  p_nome_clube text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_clube_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_obrigatoria';
  end if;
  if exists (select 1 from papeis_usuario where user_id = auth.uid()) then
    raise exception 'usuario_ja_possui_papel';
  end if;

  insert into clubes (nome_responsavel, email, cpf, whatsapp, nome_clube, situacao)
  values (p_nome_responsavel, p_email, p_cpf, p_whatsapp, p_nome_clube, 'pendente')
  returning id into v_clube_id;

  insert into papeis_usuario (user_id, clube_id, papel)
  values (auth.uid(), v_clube_id, 'admin_clube');

  return v_clube_id;
end;
$$;
grant execute on function criar_clube to authenticated;

-- =========================================================================
-- PLANOS / FATURAMENTO (modo sandbox/manual neste build de teste)
-- =========================================================================
create or replace function escolher_plano(p_clube_id uuid, p_plano plano_clube) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_fatura_id uuid;
  v_valor int;
begin
  if not e_admin_do_clube(p_clube_id) then raise exception 'sem_permissao'; end if;

  v_valor := case p_plano
    when 'standard' then 1990
    when 'pro' then 3990
    when 'ultra' then 5990
  end;

  update clubes set plano = p_plano where id = p_clube_id;

  insert into faturas (clube_id, plano, valor_centavos, status, referencia_mes)
  values (p_clube_id, p_plano, v_valor, 'pendente', date_trunc('month', now())::date)
  returning id into v_fatura_id;

  return v_fatura_id;
end;
$$;
grant execute on function escolher_plano to authenticated;

create or replace function confirmar_pagamento_fatura(p_fatura_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_fatura faturas%rowtype;
begin
  if not is_superadmin() then raise exception 'sem_permissao'; end if;
  select * into v_fatura from faturas where id = p_fatura_id;
  if v_fatura.id is null then raise exception 'fatura_nao_encontrada'; end if;

  update faturas set status = 'pago', pago_em = now() where id = p_fatura_id;
  update clubes set situacao = 'ativo' where id = v_fatura.clube_id;
end;
$$;
grant execute on function confirmar_pagamento_fatura to authenticated;

-- =========================================================================
-- GERAÇÃO DE JOGOS
-- =========================================================================
create or replace function gerar_proximo_jogo(p_time_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_time times%rowtype;
  v_ultima_data date;
  v_proxima_data date;
  v_jogo_id uuid;
  v_inicio_ts timestamptz;
  v_horario_limite timestamptz;
  v_prazo_mensalista timestamptz;
  r_mensalista mensalistas%rowtype;
  v_confirmados_linha int := 0;
  v_confirmados_goleiro int := 0;
  v_espera_count int := 0;
  v_vaga_principal boolean;
  v_vagas_linha int;
begin
  select * into v_time from times where id = p_time_id;
  if not found then raise exception 'time_nao_encontrado'; end if;
  if not pode_gerenciar_clube(v_time.clube_id) then raise exception 'sem_permissao'; end if;
  if not v_time.ativo then return null; end if;

  select max(data_jogo) into v_ultima_data from jogos where time_id = p_time_id;

  if v_ultima_data is null then
    v_proxima_data := current_date + ((v_time.dia_semana - extract(dow from current_date)::int + 7) % 7);
  else
    v_proxima_data := v_ultima_data + 7;
  end if;

  select id into v_jogo_id from jogos where time_id = p_time_id and data_jogo = v_proxima_data;
  if found then
    return v_jogo_id;
  end if;

  v_inicio_ts := (v_proxima_data + v_time.horario_inicio) at time zone 'America/Sao_Paulo';
  v_horario_limite := v_inicio_ts - (v_time.horas_limite_confirmacao * interval '1 hour');
  v_prazo_mensalista := v_inicio_ts - (v_time.horas_prazo_confirmacao_mensalista * interval '1 hour');
  v_vagas_linha := v_time.maximo_jogadores - v_time.maximo_goleiros;

  insert into jogos (time_id, clube_id, data_jogo, horario_inicio, horario_fim, local, horario_limite, prazo_confirmacao_mensalista, recados)
  values (p_time_id, v_time.clube_id, v_proxima_data, v_time.horario_inicio, v_time.horario_fim, v_time.local, v_horario_limite, v_prazo_mensalista, v_time.recados)
  returning id into v_jogo_id;

  for r_mensalista in
    select * from mensalistas where time_id = p_time_id and ativo = true order by nome_normalizado
  loop
    if r_mensalista.posicao_padrao = 'goleiro' then
      v_vaga_principal := v_confirmados_goleiro < v_time.maximo_goleiros;
    else
      v_vaga_principal := v_confirmados_linha < v_vagas_linha;
    end if;

    if not v_vaga_principal and v_espera_count >= v_time.maximo_espera then
      continue;
    end if;

    insert into confirmacoes (jogo_id, clube_id, mensalista_id, nome, posicao, status, vaga_principal)
    values (v_jogo_id, v_time.clube_id, r_mensalista.id, r_mensalista.nome, r_mensalista.posicao_padrao, 'pendente_mensalista', v_vaga_principal)
    on conflict (jogo_id, nome_normalizado) do nothing;

    if v_vaga_principal then
      if r_mensalista.posicao_padrao = 'goleiro' then
        v_confirmados_goleiro := v_confirmados_goleiro + 1;
      else
        v_confirmados_linha := v_confirmados_linha + 1;
      end if;
    else
      v_espera_count := v_espera_count + 1;
    end if;
  end loop;

  return v_jogo_id;
end;
$$;
grant execute on function gerar_proximo_jogo to authenticated, service_role;

-- =========================================================================
-- SITUAÇÃO DO JOGO E PROMOÇÃO DA ESPERA
-- =========================================================================
create or replace function atualizar_situacao_jogo(p_jogo_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_time times%rowtype;
  v_jogo jogos%rowtype;
  v_confirmados int;
begin
  select * into v_jogo from jogos where id = p_jogo_id;
  if v_jogo.id is null or v_jogo.situacao in ('cancelado','auto_cancelado','encerrado') then return; end if;

  select * into v_time from times where id = v_jogo.time_id;
  select count(*) into v_confirmados from confirmacoes
    where jogo_id = p_jogo_id and vaga_principal and status in ('confirmado','pendente_mensalista');

  if v_confirmados >= v_time.minimo_jogadores then
    update jogos set situacao = 'confirmado' where id = p_jogo_id and situacao <> 'confirmado';
  else
    update jogos set situacao = 'aguardando' where id = p_jogo_id and situacao <> 'aguardando';
  end if;
end;
$$;

create or replace function promover_espera(p_jogo_id uuid, p_posicao posicao_jogador, p_origem origem_liberacao_vaga) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_proximo confirmacoes%rowtype;
begin
  select * into v_proximo from confirmacoes
    where jogo_id = p_jogo_id and posicao = p_posicao and vaga_principal = false
      and status in ('espera', 'pendente_mensalista')
    order by ordem_entrada asc
    limit 1;

  if v_proximo.id is null then return; end if;

  update confirmacoes set
    vaga_principal = true,
    status = case when status = 'espera' then 'confirmado' else status end,
    origem_liberacao = p_origem
  where id = v_proximo.id;

  perform atualizar_situacao_jogo(p_jogo_id);
end;
$$;

-- =========================================================================
-- CONFIRMAÇÃO PÚBLICA (Vou / Não vou)
-- =========================================================================
create or replace function confirmar_presenca(p_jogo_id uuid, p_nome text, p_posicao posicao_jogador) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_jogo jogos%rowtype;
  v_time times%rowtype;
  v_nome_norm text;
  v_existente confirmacoes%rowtype;
  v_conf_linha int;
  v_conf_goleiro int;
  v_espera int;
  v_vaga_principal boolean;
  v_max_pool int;
  v_conf_id uuid;
  v_status status_confirmacao;
  v_id_exclusao uuid;
begin
  select * into v_jogo from jogos where id = p_jogo_id;
  if not found then raise exception 'jogo_nao_encontrado'; end if;
  if v_jogo.situacao in ('cancelado','auto_cancelado') then raise exception 'jogo_cancelado'; end if;
  if now() > v_jogo.horario_limite then raise exception 'prazo_encerrado'; end if;

  select * into v_time from times where id = v_jogo.time_id;
  v_nome_norm := normalizar_nome(p_nome);
  if v_nome_norm = '' then raise exception 'nome_obrigatorio'; end if;

  select * into v_existente from confirmacoes where jogo_id = p_jogo_id and nome_normalizado = v_nome_norm;
  v_id_exclusao := coalesce(v_existente.id, '00000000-0000-0000-0000-000000000000'::uuid);

  select
    count(*) filter (where posicao = 'linha' and vaga_principal and status in ('confirmado','pendente_mensalista') and id <> v_id_exclusao),
    count(*) filter (where posicao = 'goleiro' and vaga_principal and status in ('confirmado','pendente_mensalista') and id <> v_id_exclusao),
    count(*) filter (where not vaga_principal and status in ('espera','pendente_mensalista') and id <> v_id_exclusao)
  into v_conf_linha, v_conf_goleiro, v_espera
  from confirmacoes where jogo_id = p_jogo_id;

  if p_posicao = 'goleiro' then
    v_max_pool := v_time.maximo_goleiros;
    v_vaga_principal := v_conf_goleiro < v_max_pool;
  else
    v_max_pool := v_time.maximo_jogadores - v_time.maximo_goleiros;
    v_vaga_principal := v_conf_linha < v_max_pool;
  end if;

  if not v_vaga_principal and v_espera >= v_time.maximo_espera then
    raise exception 'lotado';
  end if;

  v_status := case when v_vaga_principal then 'confirmado' else 'espera' end;

  if v_existente.id is not null then
    update confirmacoes set
      nome = p_nome,
      posicao = p_posicao,
      status = v_status,
      vaga_principal = v_vaga_principal,
      origem_liberacao = 'voluntaria'
    where id = v_existente.id
    returning id into v_conf_id;
  else
    insert into confirmacoes (jogo_id, clube_id, nome, posicao, status, vaga_principal, origem_liberacao)
    values (p_jogo_id, v_jogo.clube_id, p_nome, p_posicao, v_status, v_vaga_principal, 'voluntaria')
    returning id into v_conf_id;
  end if;

  perform atualizar_situacao_jogo(p_jogo_id);
  return jsonb_build_object('id', v_conf_id, 'status', v_status);
end;
$$;
grant execute on function confirmar_presenca to anon, authenticated;

create or replace function cancelar_presenca(p_jogo_id uuid, p_nome text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_jogo jogos%rowtype;
  v_nome_norm text;
  v_existente confirmacoes%rowtype;
begin
  select * into v_jogo from jogos where id = p_jogo_id;
  if not found then raise exception 'jogo_nao_encontrado'; end if;
  if v_jogo.situacao in ('cancelado','auto_cancelado') then raise exception 'jogo_cancelado'; end if;

  v_nome_norm := normalizar_nome(p_nome);
  select * into v_existente from confirmacoes where jogo_id = p_jogo_id and nome_normalizado = v_nome_norm;
  if v_existente.id is null then raise exception 'nao_encontrado'; end if;

  update confirmacoes set status = 'nao_vai', vaga_principal = false, origem_liberacao = null where id = v_existente.id;

  if v_existente.vaga_principal then
    perform promover_espera(p_jogo_id, v_existente.posicao, 'voluntaria');
  end if;

  perform atualizar_situacao_jogo(p_jogo_id);
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function cancelar_presenca to anon, authenticated;

-- Check ao lado do nome do mensalista na lista pública
create or replace function confirmar_mensalista(p_jogo_id uuid, p_mensalista_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_conf confirmacoes%rowtype;
  v_jogo jogos%rowtype;
begin
  select * into v_jogo from jogos where id = p_jogo_id;
  if not found then raise exception 'jogo_nao_encontrado'; end if;
  if v_jogo.situacao in ('cancelado','auto_cancelado') then raise exception 'jogo_cancelado'; end if;

  select * into v_conf from confirmacoes where jogo_id = p_jogo_id and mensalista_id = p_mensalista_id;
  if v_conf.id is null then raise exception 'reserva_nao_encontrada'; end if;
  if v_conf.status <> 'pendente_mensalista' then
    return jsonb_build_object('status', v_conf.status);
  end if;

  update confirmacoes set status = case when vaga_principal then 'confirmado' else 'espera' end
  where id = v_conf.id;

  perform atualizar_situacao_jogo(p_jogo_id);
  return jsonb_build_object('status', (select status from confirmacoes where id = v_conf.id));
end;
$$;
grant execute on function confirmar_mensalista to anon, authenticated;

-- =========================================================================
-- MELHORIA 1+2 — prazo do mensalista, auto-liberação, furos + auto-cancelamento
-- Idempotente: cada jogo só é processado uma vez por flag.
-- =========================================================================
create or replace function recalcular_contador_furos(p_mensalista_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_janela smallint;
  v_count int;
begin
  select t.janela_furos_semanas into v_janela
  from mensalistas m join times t on t.id = m.time_id
  where m.id = p_mensalista_id;

  select count(*) into v_count from furos_mensalista
  where mensalista_id = p_mensalista_id
    and created_at >= now() - (coalesce(v_janela, 4) * interval '1 week');

  update mensalistas set contador_furos_recentes = v_count where id = p_mensalista_id;
end;
$$;

create or replace function processar_prazos_e_furos(p_clube_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  r_jogo jogos%rowtype;
  r_conf confirmacoes%rowtype;
  v_time times%rowtype;
  v_confirmados int;
begin
  if p_clube_id is not null and not pode_gerenciar_clube(p_clube_id) then
    raise exception 'sem_permissao';
  end if;

  -- 1) Furo de mensalista: prazo diferenciado vencido sem confirmação
  for r_jogo in
    select * from jogos
    where furos_processados = false
      and prazo_confirmacao_mensalista <= now()
      and situacao not in ('cancelado', 'auto_cancelado')
      and (p_clube_id is null or clube_id = p_clube_id)
  loop
    for r_conf in
      select * from confirmacoes where jogo_id = r_jogo.id and status = 'pendente_mensalista'
    loop
      update confirmacoes set status = 'furo', vaga_principal = false where id = r_conf.id;

      if r_conf.mensalista_id is not null then
        insert into furos_mensalista (mensalista_id, jogo_id, clube_id, tipo)
        values (r_conf.mensalista_id, r_jogo.id, r_jogo.clube_id, 'automatico')
        on conflict (mensalista_id, jogo_id) do nothing;
        perform recalcular_contador_furos(r_conf.mensalista_id);
      end if;

      if r_conf.vaga_principal then
        perform promover_espera(r_jogo.id, r_conf.posicao, 'furo_auto_liberado');
      end if;
    end loop;

    update jogos set furos_processados = true where id = r_jogo.id;
    perform atualizar_situacao_jogo(r_jogo.id);
  end loop;

  -- 2) Auto-cancelamento: prazo geral vencido sem mínimo
  for r_jogo in
    select * from jogos
    where auto_cancelamento_avaliado = false
      and horario_limite <= now()
      and situacao not in ('cancelado', 'auto_cancelado')
      and (p_clube_id is null or clube_id = p_clube_id)
  loop
    select * into v_time from times where id = r_jogo.time_id;
    select count(*) into v_confirmados from confirmacoes
      where jogo_id = r_jogo.id and vaga_principal and status in ('confirmado', 'pendente_mensalista');

    if v_confirmados < v_time.minimo_jogadores then
      update jogos set situacao = 'auto_cancelado', auto_cancelamento_avaliado = true where id = r_jogo.id;
    else
      update jogos set situacao = 'confirmado', auto_cancelamento_avaliado = true where id = r_jogo.id;
    end if;
  end loop;
end;
$$;
grant execute on function processar_prazos_e_furos to authenticated, service_role;

create or replace function marcar_furo_manual(p_mensalista_id uuid, p_jogo_id uuid, p_marcar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mensalista mensalistas%rowtype;
begin
  select * into v_mensalista from mensalistas where id = p_mensalista_id;
  if v_mensalista.id is null then raise exception 'mensalista_nao_encontrado'; end if;
  if not pode_gerenciar_clube(v_mensalista.clube_id) then raise exception 'sem_permissao'; end if;

  if p_marcar then
    insert into furos_mensalista (mensalista_id, jogo_id, clube_id, tipo)
    values (p_mensalista_id, p_jogo_id, v_mensalista.clube_id, 'manual')
    on conflict (mensalista_id, jogo_id) do nothing;
    update confirmacoes set status = 'furo', vaga_principal = false
      where jogo_id = p_jogo_id and mensalista_id = p_mensalista_id and status = 'pendente_mensalista';
  else
    delete from furos_mensalista where mensalista_id = p_mensalista_id and jogo_id = p_jogo_id;
  end if;

  perform recalcular_contador_furos(p_mensalista_id);
end;
$$;
grant execute on function marcar_furo_manual to authenticated;

-- =========================================================================
-- RENOMEAÇÃO SINCRONIZADA (mensalista <-> presença <-> pagamento)
-- =========================================================================
create or replace function renomear_mensalista(p_mensalista_id uuid, p_novo_nome text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mensalista mensalistas%rowtype;
begin
  select * into v_mensalista from mensalistas where id = p_mensalista_id;
  if v_mensalista.id is null then raise exception 'mensalista_nao_encontrado'; end if;
  if not pode_gerenciar_clube(v_mensalista.clube_id) then raise exception 'sem_permissao'; end if;

  update mensalistas set nome = p_novo_nome where id = p_mensalista_id;
  update confirmacoes set nome = p_novo_nome where mensalista_id = p_mensalista_id;
  update pagamentos set nome = p_novo_nome where mensalista_id = p_mensalista_id;
end;
$$;
grant execute on function renomear_mensalista to authenticated;

-- =========================================================================
-- MELHORIA 3+4 — pagamentos: declarar (público) e confirmar (admin, 1 toque)
-- =========================================================================
create or replace function declarar_pagamento(p_pagamento_id uuid, p_nome text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pag pagamentos%rowtype;
begin
  select * into v_pag from pagamentos where id = p_pagamento_id;
  if v_pag.id is null then raise exception 'pagamento_nao_encontrado'; end if;
  if normalizar_nome(v_pag.nome) <> normalizar_nome(p_nome) then raise exception 'nome_nao_confere'; end if;
  if v_pag.status = 'pago' then return jsonb_build_object('status', 'pago'); end if;

  update pagamentos set status = 'declarado', declarado_em = now() where id = p_pagamento_id;
  return jsonb_build_object('status', 'declarado');
end;
$$;
grant execute on function declarar_pagamento to anon, authenticated;

create or replace function confirmar_pagamento_admin(p_pagamento_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pag pagamentos%rowtype;
begin
  select * into v_pag from pagamentos where id = p_pagamento_id;
  if v_pag.id is null then raise exception 'pagamento_nao_encontrado'; end if;
  if not pode_gerenciar_clube(v_pag.clube_id) then raise exception 'sem_permissao'; end if;

  update pagamentos set status = 'pago', pago_em = now() where id = p_pagamento_id;
  return jsonb_build_object('status', 'pago');
end;
$$;
grant execute on function confirmar_pagamento_admin to authenticated;

-- ============================================================
-- 0004_admin_functions.sql
-- ============================================================
-- =========================================================================
-- FOOTER — funções de apoio ao Controle de Presença (admin)
-- =========================================================================

create or replace function admin_adicionar_jogador(p_jogo_id uuid, p_nome text, p_posicao posicao_jogador) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_jogo jogos%rowtype;
  v_time times%rowtype;
  v_conf_linha int;
  v_conf_goleiro int;
  v_espera int;
  v_vaga_principal boolean;
  v_status status_confirmacao;
  v_conf_id uuid;
begin
  select * into v_jogo from jogos where id = p_jogo_id;
  if v_jogo.id is null then raise exception 'jogo_nao_encontrado'; end if;
  if not pode_gerenciar_clube(v_jogo.clube_id) then raise exception 'sem_permissao'; end if;

  select * into v_time from times where id = v_jogo.time_id;

  select
    count(*) filter (where posicao = 'linha' and vaga_principal and status in ('confirmado','pendente_mensalista')),
    count(*) filter (where posicao = 'goleiro' and vaga_principal and status in ('confirmado','pendente_mensalista')),
    count(*) filter (where not vaga_principal and status in ('espera','pendente_mensalista'))
  into v_conf_linha, v_conf_goleiro, v_espera
  from confirmacoes where jogo_id = p_jogo_id;

  if p_posicao = 'goleiro' then
    v_vaga_principal := v_conf_goleiro < v_time.maximo_goleiros;
  else
    v_vaga_principal := v_conf_linha < (v_time.maximo_jogadores - v_time.maximo_goleiros);
  end if;

  if not v_vaga_principal and v_espera >= v_time.maximo_espera then
    raise exception 'lotado';
  end if;

  v_status := case when v_vaga_principal then 'confirmado' else 'espera' end;

  insert into confirmacoes (jogo_id, clube_id, nome, posicao, status, vaga_principal, origem_liberacao)
  values (p_jogo_id, v_jogo.clube_id, p_nome, p_posicao, v_status, v_vaga_principal, 'voluntaria')
  returning id into v_conf_id;

  perform atualizar_situacao_jogo(p_jogo_id);
  return jsonb_build_object('id', v_conf_id, 'status', v_status);
end;
$$;
grant execute on function admin_adicionar_jogador to authenticated;

create or replace function admin_definir_status_confirmacao(
  p_confirmacao_id uuid,
  p_status status_confirmacao,
  p_vaga_principal boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_conf confirmacoes%rowtype;
  v_era_principal boolean;
begin
  select * into v_conf from confirmacoes where id = p_confirmacao_id;
  if v_conf.id is null then raise exception 'confirmacao_nao_encontrada'; end if;
  if not pode_gerenciar_clube(v_conf.clube_id) then raise exception 'sem_permissao'; end if;

  v_era_principal := v_conf.vaga_principal;

  update confirmacoes set
    status = p_status,
    vaga_principal = p_vaga_principal,
    origem_liberacao = case when p_status = 'confirmado' and origem_liberacao is null then 'voluntaria' else origem_liberacao end
  where id = p_confirmacao_id;

  perform atualizar_situacao_jogo(v_conf.jogo_id);

  -- se a vaga principal foi liberada (estava ocupando e deixou de ocupar), promove a espera
  if v_era_principal and not p_vaga_principal then
    perform promover_espera(v_conf.jogo_id, v_conf.posicao, 'voluntaria');
  end if;
end;
$$;
grant execute on function admin_definir_status_confirmacao to authenticated;

create or replace function admin_remover_confirmacao(p_confirmacao_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_conf confirmacoes%rowtype;
begin
  select * into v_conf from confirmacoes where id = p_confirmacao_id;
  if v_conf.id is null then raise exception 'confirmacao_nao_encontrada'; end if;
  if not pode_gerenciar_clube(v_conf.clube_id) then raise exception 'sem_permissao'; end if;

  delete from confirmacoes where id = p_confirmacao_id;

  perform atualizar_situacao_jogo(v_conf.jogo_id);

  if v_conf.vaga_principal and v_conf.status in ('confirmado', 'pendente_mensalista') then
    perform promover_espera(v_conf.jogo_id, v_conf.posicao, 'voluntaria');
  end if;
end;
$$;
grant execute on function admin_remover_confirmacao to authenticated;

create or replace function admin_editar_nome_confirmacao(p_confirmacao_id uuid, p_novo_nome text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_conf confirmacoes%rowtype;
begin
  select * into v_conf from confirmacoes where id = p_confirmacao_id;
  if v_conf.id is null then raise exception 'confirmacao_nao_encontrada'; end if;
  if not pode_gerenciar_clube(v_conf.clube_id) then raise exception 'sem_permissao'; end if;

  if v_conf.mensalista_id is not null then
    perform renomear_mensalista(v_conf.mensalista_id, p_novo_nome);
  else
    update confirmacoes set nome = p_novo_nome where id = p_confirmacao_id;
  end if;
end;
$$;
grant execute on function admin_editar_nome_confirmacao to authenticated;

