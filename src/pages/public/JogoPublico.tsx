import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MapPin, Clock, Users } from 'lucide-react'
import { useJogoPublico } from '../../hooks/useJogoPublico'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Spinner, ErrorBanner } from '../../components/ui/Feedback'
import { BadgeMensalista, BadgePagamento, BadgeConfiabilidade } from '../../components/PlayerBadges'
import { formatDataPorExtenso, formatHora, tempoRestante } from '../../lib/formatters'
import { normalizeName, capitalizeName } from '../../lib/utils'
import type { Confirmacao, Mensalista, PagamentoStatusPublico, PosicaoJogador, SituacaoJogo } from '../../types/database'

const NOME_STORAGE_KEY = 'footer:ultimo-nome'

const SITUACAO_LABEL: Record<SituacaoJogo, { label: string; tone: 'neutral' | 'success' | 'danger' | 'muted' }> = {
  aguardando: { label: 'Aguardando confirmações', tone: 'neutral' },
  confirmado: { label: 'Confirmado', tone: 'success' },
  cancelado: { label: 'Cancelado', tone: 'danger' },
  auto_cancelado: { label: 'Cancelado (sem mínimo)', tone: 'danger' },
  encerrado: { label: 'Encerrado', tone: 'muted' },
}

export default function JogoPublico() {
  const { jogoId } = useParams<{ jogoId: string }>()
  const { data, isLoading, isError, refetch } = useJogoPublico(jogoId)
  const [nome, setNome] = useState(() => localStorage.getItem(NOME_STORAGE_KEY) ?? '')
  const [posicao, setPosicao] = useState<PosicaoJogador>('linha')
  const [enviando, setEnviando] = useState<'vou' | 'nao-vou' | null>(null)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')

  const meuNomeNormalizado = useMemo(() => normalizeName(nome), [nome])

  const sugestoes = useMemo(() => {
    if (!data || nome.trim().length < 2) return []
    const alvo = normalizeName(nome)
    const contagem = new Map<string, { nome: string; freq: number }>()
    for (const c of data.confirmacoes) {
      const atual = contagem.get(c.nome_normalizado)
      contagem.set(c.nome_normalizado, { nome: c.nome, freq: (atual?.freq ?? 0) + 1 })
    }
    for (const m of data.mensalistas) {
      if (!contagem.has(m.nome_normalizado)) contagem.set(m.nome_normalizado, { nome: m.nome, freq: 5 })
    }
    return [...contagem.values()]
      .filter((c) => c.nome.toLowerCase().includes(alvo) || normalizeName(c.nome).includes(alvo))
      .sort((a, b) => b.freq - a.freq)
      .slice(0, 5)
  }, [data, nome])

  if (isLoading) return <Spinner className="min-h-dvh" />
  if (isError || !data) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-6">
        <ErrorBanner message="Não foi possível carregar esta lista. Verifique o link e tente novamente." />
      </div>
    )
  }

  const { jogo, time, confirmacoes, mensalistas, pagamentos } = data
  const situacaoInfo = SITUACAO_LABEL[jogo.situacao]
  const bloqueado = jogo.situacao === 'cancelado' || jogo.situacao === 'auto_cancelado' || jogo.situacao === 'encerrado'
  const prazoExpirado = new Date(jogo.horario_limite).getTime() <= Date.now()
  const restante = tempoRestante(jogo.horario_limite)

  const confirmadosLinha = confirmacoes.filter((c) => c.posicao === 'linha' && c.vaga_principal && (c.status === 'confirmado' || c.status === 'pendente_mensalista'))
  const confirmadosGoleiro = confirmacoes.filter((c) => c.posicao === 'goleiro' && c.vaga_principal && (c.status === 'confirmado' || c.status === 'pendente_mensalista'))
  const espera = confirmacoes.filter((c) => !c.vaga_principal && (c.status === 'espera' || c.status === 'pendente_mensalista')).sort((a, b) => a.ordem_entrada - b.ordem_entrada)
  const mensalistasPendentes = confirmacoes.filter((c) => c.status === 'pendente_mensalista' && c.mensalista_id)
  const naoVao = confirmacoes.filter((c) => c.status === 'nao_vai')

  const vagasLinha = time.maximo_jogadores - time.maximo_goleiros
  const pendenciasCount = pagamentos.filter((p) => p.status === 'pendente').length

  function pagamentoDe(c: Confirmacao) {
    return pagamentos.find((p) => p.nome_normalizado === c.nome_normalizado)
  }
  function mensalistaDe(c: Confirmacao) {
    return mensalistas.find((m) => m.id === c.mensalista_id)
  }

  async function confirmar(vou: boolean) {
    setErro('')
    setMensagem('')
    if (!nome.trim()) return setErro('Informe seu nome para continuar.')

    setEnviando(vou ? 'vou' : 'nao-vou')
    try {
      if (vou) {
        const { error } = await supabase.rpc('confirmar_presenca', {
          p_jogo_id: jogo.id,
          p_nome: capitalizeName(nome),
          p_posicao: posicao,
        })
        if (error) throw error
        setMensagem('Você está na lista! ⚽')
      } else {
        const { error } = await supabase.rpc('cancelar_presenca', { p_jogo_id: jogo.id, p_nome: nome })
        if (error) throw error
        setMensagem('Sua ausência foi registrada.')
      }
      localStorage.setItem(NOME_STORAGE_KEY, nome)
      await refetch()
    } catch (err) {
      setErro(traduzirErro(err instanceof Error ? err.message : ''))
    } finally {
      setEnviando(null)
    }
  }

  async function confirmarMensalista(mensalistaId: string) {
    try {
      const { error } = await supabase.rpc('confirmar_mensalista', { p_jogo_id: jogo.id, p_mensalista_id: mensalistaId })
      if (error) throw error
      await refetch()
    } catch {
      setErro('Não foi possível confirmar agora. Tente de novo.')
    }
  }

  async function declararPago(pagamentoId: string, nomePagamento: string) {
    try {
      const { error } = await supabase.rpc('declarar_pagamento', { p_pagamento_id: pagamentoId, p_nome: nomePagamento })
      if (error) throw error
      await refetch()
    } catch {
      setErro('Não foi possível registrar. Tente de novo.')
    }
  }

  return (
    <div className="min-h-dvh safe-top safe-bottom pb-10">
      <div className="max-w-lg mx-auto px-4 pt-6">
        <p className="font-display text-2xl text-lime tracking-wide text-center mb-4">FOOTER</p>

        <Card className="mb-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <p className="text-sm text-text-muted normal-case">E aí, craques!</p>
              <h1 className="font-display text-2xl leading-tight">{time.nome}</h1>
            </div>
            <Badge tone={situacaoInfo.tone}>{situacaoInfo.label}</Badge>
          </div>

          <div className="space-y-1.5 text-sm text-text-muted normal-case tracking-normal">
            <p className="capitalize text-text">{formatDataPorExtenso(jogo.data_jogo)}</p>
            <p className="flex items-center gap-1.5">
              <Clock size={14} /> {formatHora(jogo.horario_inicio)} às {formatHora(jogo.horario_fim)}
            </p>
            <p className="flex items-center gap-1.5">
              <MapPin size={14} /> {jogo.local}
            </p>
            {!bloqueado && (
              <p className="flex items-center gap-1.5">
                <Clock size={14} />
                {prazoExpirado ? 'Prazo de confirmação encerrado' : `Confirme em até ${restante}`}
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Badge tone="muted">
              <Users size={12} className="mr-1" />
              {confirmadosLinha.length}/{vagasLinha} linha
            </Badge>
            <Badge tone="muted">{confirmadosGoleiro.length}/{time.maximo_goleiros} goleiros</Badge>
            <Badge tone="muted">{espera.length}/{time.maximo_espera} na espera</Badge>
            {pendenciasCount > 0 && <Badge tone="warning">{pendenciasCount} pendente{pendenciasCount > 1 ? 's' : ''} de pagamento</Badge>}
          </div>

          {jogo.recados && (
            <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-text normal-case tracking-normal whitespace-pre-line">
              {jogo.recados}
            </p>
          )}

          {(time.valor_avulso_centavos || time.chave_pix) && (
            <div className="mt-3 text-sm text-text-muted normal-case tracking-normal">
              {time.valor_avulso_centavos != null && (
                <p>
                  Avulso: <span className="text-text">{(time.valor_avulso_centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </p>
              )}
              {time.chave_pix && (
                <p>
                  Pix: <span className="text-text">{time.chave_pix}</span>
                </p>
              )}
            </div>
          )}
        </Card>

        {!bloqueado && !prazoExpirado && (
          <Card className="mb-4">
            {erro && <div className="mb-3"><ErrorBanner message={erro} /></div>}
            {mensagem && (
              <div className="mb-3 rounded-xl border border-lime/30 bg-lime/10 px-3.5 py-2.5 text-sm text-lime">
                {mensagem}
              </div>
            )}
            <div className="space-y-3">
              <div className="relative">
                <Input
                  label="Qual é o seu nome?"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  list="sugestoes-nomes"
                  placeholder="Nome e sobrenome"
                  autoComplete="off"
                />
                <datalist id="sugestoes-nomes">
                  {sugestoes.map((s) => (
                    <option key={s.nome} value={s.nome} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPosicao('linha')}
                  className={`h-11 rounded-xl text-sm font-medium tap-shrink transition-colors ${
                    posicao === 'linha' ? 'bg-lime text-black' : 'bg-surface-2 text-text-muted border border-border'
                  }`}
                >
                  Linha
                </button>
                <button
                  type="button"
                  onClick={() => setPosicao('goleiro')}
                  className={`h-11 rounded-xl text-sm font-medium tap-shrink transition-colors ${
                    posicao === 'goleiro' ? 'bg-lime text-black' : 'bg-surface-2 text-text-muted border border-border'
                  }`}
                >
                  Goleiro
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => confirmar(true)} loading={enviando === 'vou'} disabled={enviando !== null}>
                  Vou
                </Button>
                <Button variant="secondary" onClick={() => confirmar(false)} loading={enviando === 'nao-vou'} disabled={enviando !== null}>
                  Não vou
                </Button>
              </div>
            </div>
          </Card>
        )}

        {mensalistasPendentes.length > 0 && (
          <Secao titulo="Mensalistas aguardando">
            {mensalistasPendentes.map((c) => (
              <LinhaJogador
                key={c.id}
                confirmacao={c}
                pagamento={pagamentoDe(c)}
                mensalista={mensalistaDe(c)}
                acaoDireita={
                  <button
                    onClick={() => confirmarMensalista(c.mensalista_id!)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-lime/40 text-lime tap-shrink"
                    aria-label={`Confirmar presença de ${c.nome}`}
                  >
                    ✓
                  </button>
                }
                extra={!c.vaga_principal ? <Badge tone="muted">Espera</Badge> : undefined}
              />
            ))}
          </Secao>
        )}

        <Secao titulo={`Confirmados — linha (${confirmadosLinha.length}/${vagasLinha})`}>
          {confirmadosLinha
            .filter((c) => c.status === 'confirmado')
            .map((c) => (
              <LinhaJogador
                key={c.id}
                confirmacao={c}
                pagamento={pagamentoDe(c)}
                mensalista={mensalistaDe(c)}
                acaoDireita={
                  c.nome_normalizado === meuNomeNormalizado && pagamentoDe(c)?.status === 'pendente' ? (
                    <button
                      onClick={() => declararPago(pagamentoDe(c)!.id, c.nome)}
                      className="text-xs text-lime underline whitespace-nowrap"
                    >
                      Já paguei
                    </button>
                  ) : undefined
                }
              />
            ))}
          {confirmadosLinha.filter((c) => c.status === 'confirmado').length === 0 && (
            <p className="text-sm text-text-muted py-2">Ninguém confirmado ainda.</p>
          )}
        </Secao>

        <Secao titulo={`Goleiros (${confirmadosGoleiro.filter((c) => c.status === 'confirmado').length}/${time.maximo_goleiros})`}>
          {confirmadosGoleiro
            .filter((c) => c.status === 'confirmado')
            .map((c) => (
              <LinhaJogador key={c.id} confirmacao={c} pagamento={pagamentoDe(c)} mensalista={mensalistaDe(c)} />
            ))}
          {confirmadosGoleiro.filter((c) => c.status === 'confirmado').length === 0 && (
            <p className="text-sm text-text-muted py-2">Nenhum goleiro confirmado.</p>
          )}
        </Secao>

        {espera.length > 0 && (
          <Secao titulo={`Lista de espera (${espera.length})`}>
            {espera
              .filter((c) => c.status === 'espera')
              .map((c) => (
                <LinhaJogador key={c.id} confirmacao={c} pagamento={pagamentoDe(c)} mensalista={mensalistaDe(c)} />
              ))}
          </Secao>
        )}

        {naoVao.length > 0 && (
          <Secao titulo={`Não vão (${naoVao.length})`} discreta>
            {naoVao.map((c) => (
              <LinhaJogador key={c.id} confirmacao={c} pagamento={undefined} mensalista={undefined} />
            ))}
          </Secao>
        )}
      </div>
    </div>
  )
}

function Secao({ titulo, children, discreta }: { titulo: string; children: React.ReactNode; discreta?: boolean }) {
  return (
    <div className="mb-4">
      <h2 className={`font-display text-sm tracking-wide mb-2 ${discreta ? 'text-text-muted/60' : 'text-text-muted'}`}>{titulo}</h2>
      <Card className={discreta ? 'opacity-60' : undefined}>
        <div className="divide-y divide-border -my-1">{children}</div>
      </Card>
    </div>
  )
}

function LinhaJogador({
  confirmacao,
  pagamento,
  mensalista,
  acaoDireita,
  extra,
}: {
  confirmacao: Confirmacao
  pagamento: PagamentoStatusPublico | undefined
  mensalista: Mensalista | undefined
  acaoDireita?: React.ReactNode
  extra?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] text-text">{confirmacao.nome}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {confirmacao.mensalista_id && <BadgeMensalista />}
          {extra}
          <BadgePagamento pagamento={pagamento} />
          <BadgeConfiabilidade mensalista={mensalista} />
        </div>
      </div>
      {acaoDireita && <div className="shrink-0">{acaoDireita}</div>}
    </div>
  )
}

function traduzirErro(msg: string) {
  if (msg.includes('lotado')) return 'Vagas e lista de espera lotadas! Não foi possível confirmar.'
  if (msg.includes('prazo_encerrado')) return 'O prazo de confirmação já encerrou.'
  if (msg.includes('jogo_cancelado')) return 'Este jogo foi cancelado.'
  if (msg.includes('nome_obrigatorio')) return 'Informe seu nome para continuar.'
  if (msg.includes('nao_encontrado')) return 'Não encontramos sua confirmação com esse nome.'
  return 'Não foi possível concluir. Tente novamente em instantes.'
}
