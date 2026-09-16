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
