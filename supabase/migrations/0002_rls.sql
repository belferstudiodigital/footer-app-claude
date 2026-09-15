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
