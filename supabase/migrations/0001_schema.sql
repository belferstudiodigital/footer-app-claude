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
