import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Check, X, Trash2, Pencil, AlertTriangle, Share2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import { Spinner, EmptyState, ErrorBanner } from '../../components/ui/Feedback'
import { formatDataPorExtenso, formatHora } from '../../lib/formatters'
import { cn } from '../../lib/utils'
import { gerarCardImagem, compartilharOuBaixarImagem } from '../../lib/shareCard'
import type { Confirmacao, Mensalista, PosicaoJogador } from '../../types/database'

export default function Presenca() {
  const { clube } = useAuth()
  const queryClient = useQueryClient()
  const [timeId, setTimeId] = useState<string | null>(null)
  const [jogoId, setJogoId] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [adicionando, setAdicionando] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novaPosicao, setNovaPosicao] = useState<PosicaoJogador>('linha')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nomeEditado, setNomeEditado] = useState('')

  const { data: times } = useQuery({
    queryKey: ['times', clube?.id],
    enabled: Boolean(clube),
    queryFn: async () => {
      const { data } = await supabase.from('times').select('*').eq('clube_id', clube!.id).order('nome')
      if (data && data.length > 0 && !timeId) setTimeId(data[0].id)
      return data ?? []
    },
  })

  const { data: jogos } = useQuery({
    queryKey: ['jogos-time', timeId],
    enabled: Boolean(timeId),
    queryFn: async () => {
      const { data } = await supabase
        .from('jogos')
        .select('*')
        .eq('time_id', timeId)
        .order('data_jogo', { ascending: false })
        .limit(12)
      if (data && data.length > 0 && !jogoId) setJogoId(data[0].id)
      return data ?? []
    },
  })

  const jogoAtual = jogos?.find((j) => j.id === jogoId)

  const { data: confirmacoes, isLoading } = useQuery({
    queryKey: ['confirmacoes-admin', jogoId],
    enabled: Boolean(jogoId),
    queryFn: async () => {
      const { data } = await supabase.from('confirmacoes').select('*').eq('jogo_id', jogoId).order('ordem_entrada')
      return (data ?? []) as Confirmacao[]
    },
  })

  const { data: mensalistas } = useQuery({
    queryKey: ['mensalistas-time', timeId],
    enabled: Boolean(timeId),
    queryFn: async () => {
      const { data } = await supabase.from('mensalistas').select('*').eq('time_id', timeId)
      return (data ?? []) as Mensalista[]
    },
  })

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['confirmacoes-admin', jogoId] })
  }

  const grupos = useMemo(() => {
    const confirmados = (confirmacoes ?? []).filter((c) => c.vaga_principal && (c.status === 'confirmado' || c.status === 'pendente_mensalista'))
    const espera = (confirmacoes ?? []).filter((c) => !c.vaga_principal && (c.status === 'espera' || c.status === 'pendente_mensalista'))
    const naoVao = (confirmacoes ?? []).filter((c) => c.status === 'nao_vai')
    const furos = (confirmacoes ?? []).filter((c) => c.status === 'furo')
    const pendentesMensalista = (confirmacoes ?? []).filter((c) => c.status === 'pendente_mensalista')
    return { confirmados, espera, naoVao, furos, pendentesMensalista }
  }, [confirmacoes])

  async function adicionarJogador() {
    if (!jogoId || !novoNome.trim()) return
    setErro('')
    try {
      const { error } = await supabase.rpc('admin_adicionar_jogador', {
        p_jogo_id: jogoId,
        p_nome: novoNome,
        p_posicao: novaPosicao,
      })
      if (error) throw error
      setNovoNome('')
      setAdicionando(false)
      invalidar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível adicionar.')
    }
  }

  async function confirmarPresenca(c: Confirmacao) {
    const { error } = await supabase.rpc('admin_definir_status_confirmacao', {
      p_confirmacao_id: c.id,
      p_status: 'confirmado',
      p_vaga_principal: true,
    })
    if (error) setErro(error.message)
    else invalidar()
  }

  async function marcarAusencia(c: Confirmacao) {
    const { error } = await supabase.rpc('admin_definir_status_confirmacao', {
      p_confirmacao_id: c.id,
      p_status: 'nao_vai',
      p_vaga_principal: false,
    })
    if (error) setErro(error.message)
    else invalidar()
  }

  async function remover(c: Confirmacao) {
    if (!confirm(`Remover ${c.nome} desta lista?`)) return
    const { error } = await supabase.rpc('admin_remover_confirmacao', { p_confirmacao_id: c.id })
    if (error) setErro(error.message)
    else invalidar()
  }

  async function salvarNome(c: Confirmacao) {
    if (!nomeEditado.trim()) return
    const { error } = await supabase.rpc('admin_editar_nome_confirmacao', { p_confirmacao_id: c.id, p_novo_nome: nomeEditado })
    if (error) setErro('Não foi possível renomear (talvez já exista alguém com esse nome nesta lista).')
    else {
      setEditandoId(null)
      invalidar()
      queryClient.invalidateQueries({ queryKey: ['mensalistas-time', timeId] })
    }
  }

  async function alternarFuroManual(mensalistaId: string, jogoIdAtual: string, marcar: boolean) {
    const { error } = await supabase.rpc('marcar_furo_manual', { p_mensalista_id: mensalistaId, p_jogo_id: jogoIdAtual, p_marcar: marcar })
    if (error) setErro(error.message)
    else {
      invalidar()
      queryClient.invalidateQueries({ queryKey: ['mensalistas-time', timeId] })
    }
  }

  function mensalistaDe(c: Confirmacao) {
    return mensalistas?.find((m) => m.id === c.mensalista_id)
  }

  const [gerandoResumo, setGerandoResumoState] = useState(false)

  async function gerarResumoPosJogo() {
    if (!jogoId || !jogoAtual) return
    setGerandoResumoState(true)
    setErro('')
    try {
      const nomesFuros = grupos.furos.map((c) => c.nome)

      const referenciaMes = `${jogoAtual.data_jogo.slice(0, 7)}-01`
      const { data: pagAvulso } = await supabase.from('pagamentos').select('nome, status').eq('jogo_id', jogoId).eq('tipo', 'avulso')
      const { data: pagMensal } = await supabase
        .from('pagamentos')
        .select('nome, status')
        .eq('time_id', timeId)
        .eq('tipo', 'mensal')
        .eq('referencia_mes', referenciaMes)

      const pendencias = [...(pagAvulso ?? []), ...(pagMensal ?? [])]
        .filter((p) => p.status !== 'pago')
        .map((p) => p.nome)

      const timeAtual = times?.find((t) => t.id === timeId)

      const blob = await gerarCardImagem({
        tipo: 'resumo-pos-jogo',
        nomeTime: timeAtual?.nome ?? '',
        dataJogo: formatDataPorExtenso(jogoAtual.data_jogo),
        furos: nomesFuros,
        pendencias: [...new Set(pendencias)],
        chavePix: timeAtual?.chave_pix ?? null,
      })
      await compartilharOuBaixarImagem(blob, `footer-resumo-${jogoAtual.data_jogo}.png`)
    } catch {
      setErro('Não foi possível gerar o resumo agora.')
    } finally {
      setGerandoResumoState(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">Controle de presença</h1>

      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        {times?.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTimeId(t.id)
              setJogoId(null)
            }}
            className={cn(
              'shrink-0 rounded-full px-4 py-2 text-sm font-medium tap-shrink',
              timeId === t.id ? 'bg-lime text-black' : 'bg-surface-2 text-text-muted border border-border'
            )}
          >
            {t.nome}
          </button>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        {jogos?.map((j) => (
          <button
            key={j.id}
            onClick={() => setJogoId(j.id)}
            className={cn(
              'shrink-0 rounded-xl px-3 py-2 text-xs font-medium tap-shrink capitalize whitespace-nowrap',
              jogoId === j.id ? 'bg-lime/15 text-lime border border-lime/40' : 'bg-surface-2 text-text-muted border border-border'
            )}
          >
            {formatDataPorExtenso(j.data_jogo).split(',')[1]}
          </button>
        ))}
      </div>

      {erro && <ErrorBanner message={erro} />}

      {jogoAtual && (
        <p className="text-sm text-text-muted normal-case capitalize">
          {formatDataPorExtenso(jogoAtual.data_jogo)} · {formatHora(jogoAtual.horario_inicio)} · {jogoAtual.local}
        </p>
      )}

      {isLoading ? (
        <Spinner />
      ) : !jogoId ? (
        <EmptyState title="Selecione um time e um jogo" />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 text-center">
            <Contador label="Confirmados" valor={grupos.confirmados.length} />
            <Contador label="Espera" valor={grupos.espera.length} />
            <Contador label="Não vão" valor={grupos.naoVao.length} />
            <Contador label="Furos" valor={grupos.furos.length} tone={grupos.furos.length > 0 ? 'warning' : undefined} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAdicionando((v) => !v)}>
              <Plus size={16} /> Adicionar jogador
            </Button>
            <Button variant="outline" size="sm" onClick={gerarResumoPosJogo} loading={gerandoResumo}>
              <Share2 size={16} /> Gerar resumo pós-jogo
            </Button>
          </div>

          {adicionando && (
            <Card className="flex flex-col sm:flex-row gap-2">
              <Input className="flex-1" placeholder="Nome" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
              <Select className="sm:w-32" value={novaPosicao} onChange={(e) => setNovaPosicao(e.target.value as PosicaoJogador)}>
                <option value="linha">Linha</option>
                <option value="goleiro">Goleiro</option>
              </Select>
              <Button onClick={adicionarJogador}>Adicionar</Button>
            </Card>
          )}

          <Secao titulo={`Confirmados (${grupos.confirmados.length})`}>
            {grupos.confirmados.map((c) => (
              <LinhaAdmin
                key={c.id}
                c={c}
                mensalista={mensalistaDe(c)}
                editando={editandoId === c.id}
                nomeEditado={nomeEditado}
                onEditar={() => {
                  setEditandoId(c.id)
                  setNomeEditado(c.nome)
                }}
                onSalvarNome={() => salvarNome(c)}
                onNomeChange={setNomeEditado}
                onCancelarEdicao={() => setEditandoId(null)}
                onAusencia={() => marcarAusencia(c)}
                onRemover={() => remover(c)}
                onConfirmarMensalista={c.status === 'pendente_mensalista' ? () => confirmarPresenca(c) : undefined}
                onToggleFuro={
                  c.mensalista_id ? (marcar) => alternarFuroManual(c.mensalista_id!, jogoId!, marcar) : undefined
                }
              />
            ))}
          </Secao>

          <Secao titulo={`Mensalistas aguardando (${grupos.pendentesMensalista.length})`}>
            {grupos.pendentesMensalista.length === 0 && <p className="text-sm text-text-muted py-2">Nenhum.</p>}
            {grupos.pendentesMensalista.map((c) => (
              <LinhaAdmin
                key={c.id}
                c={c}
                mensalista={mensalistaDe(c)}
                editando={editandoId === c.id}
                nomeEditado={nomeEditado}
                onEditar={() => {
                  setEditandoId(c.id)
                  setNomeEditado(c.nome)
                }}
                onSalvarNome={() => salvarNome(c)}
                onNomeChange={setNomeEditado}
                onCancelarEdicao={() => setEditandoId(null)}
                onAusencia={() => marcarAusencia(c)}
                onRemover={() => remover(c)}
                onConfirmarMensalista={() => confirmarPresenca(c)}
                onToggleFuro={c.mensalista_id ? (marcar) => alternarFuroManual(c.mensalista_id!, jogoId!, marcar) : undefined}
              />
            ))}
          </Secao>

          <Secao titulo={`Lista de espera (${grupos.espera.length})`}>
            {grupos.espera.length === 0 && <p className="text-sm text-text-muted py-2">Ninguém na espera.</p>}
            {grupos.espera.map((c) => (
              <LinhaAdmin
                key={c.id}
                c={c}
                mensalista={mensalistaDe(c)}
                editando={editandoId === c.id}
                nomeEditado={nomeEditado}
                onEditar={() => {
                  setEditandoId(c.id)
                  setNomeEditado(c.nome)
                }}
                onSalvarNome={() => salvarNome(c)}
                onNomeChange={setNomeEditado}
                onCancelarEdicao={() => setEditandoId(null)}
                onAusencia={() => marcarAusencia(c)}
                onRemover={() => remover(c)}
              />
            ))}
          </Secao>

          {grupos.furos.length > 0 && (
            <Secao titulo={`Furos (${grupos.furos.length})`}>
              {grupos.furos.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="text-warning" />
                    <span className="text-[15px]">{c.nome}</span>
                  </div>
                  {c.mensalista_id && (
                    <button onClick={() => alternarFuroManual(c.mensalista_id!, jogoId!, false)} className="text-xs text-text-muted underline">
                      desmarcar furo
                    </button>
                  )}
                </div>
              ))}
            </Secao>
          )}

          <Secao titulo={`Não vão (${grupos.naoVao.length})`} discreta>
            {grupos.naoVao.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-text-muted">{c.nome}</span>
                <button onClick={() => remover(c)} className="p-1 text-text-muted tap-shrink">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </Secao>
        </>
      )}
    </div>
  )
}

function Contador({ label, valor, tone }: { label: string; valor: number; tone?: 'warning' }) {
  return (
    <div className="rounded-xl bg-surface-2 border border-border py-2.5">
      <p className={cn('font-display text-xl', tone === 'warning' && valor > 0 ? 'text-warning' : 'text-text')}>{valor}</p>
      <p className="text-[11px] text-text-muted normal-case">{label}</p>
    </div>
  )
}

function Secao({ titulo, children, discreta }: { titulo: string; children: React.ReactNode; discreta?: boolean }) {
  return (
    <div>
      <h2 className={cn('font-display text-sm tracking-wide mb-2', discreta ? 'text-text-muted/60' : 'text-text-muted')}>{titulo}</h2>
      <Card className={discreta ? 'opacity-60' : undefined}>
        <div className="divide-y divide-border -my-1">{children}</div>
      </Card>
    </div>
  )
}

function LinhaAdmin({
  c,
  mensalista,
  editando,
  nomeEditado,
  onEditar,
  onSalvarNome,
  onNomeChange,
  onCancelarEdicao,
  onAusencia,
  onRemover,
  onConfirmarMensalista,
  onToggleFuro,
}: {
  c: Confirmacao
  mensalista: Mensalista | undefined
  editando: boolean
  nomeEditado: string
  onEditar: () => void
  onSalvarNome: () => void
  onNomeChange: (v: string) => void
  onCancelarEdicao: () => void
  onAusencia: () => void
  onRemover: () => void
  onConfirmarMensalista?: () => void
  onToggleFuro?: (marcar: boolean) => void
}) {
  if (editando) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Input className="flex-1 h-9" value={nomeEditado} onChange={(e) => onNomeChange(e.target.value)} autoFocus />
        <button onClick={onSalvarNome} className="p-1.5 text-lime tap-shrink">
          <Check size={16} />
        </button>
        <button onClick={onCancelarEdicao} className="p-1.5 text-text-muted tap-shrink">
          <X size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px]">{c.nome}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {c.mensalista_id && <Badge tone="lime">Mensalista</Badge>}
          <Badge tone="muted">{c.posicao === 'goleiro' ? 'Goleiro' : 'Linha'}</Badge>
          {c.origem_liberacao === 'furo_auto_liberado' && <Badge tone="warning">vaga liberada por furo</Badge>}
          {mensalista && mensalista.contador_furos_recentes > 0 && (
            <Badge tone="warning">⚠️ {mensalista.contador_furos_recentes} furo(s)</Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onConfirmarMensalista && (
          <button onClick={onConfirmarMensalista} className="p-1.5 text-lime tap-shrink" aria-label="Confirmar">
            <Check size={16} />
          </button>
        )}
        {onToggleFuro && (
          <button
            onClick={() => onToggleFuro(true)}
            className="p-1.5 text-warning tap-shrink"
            aria-label="Marcar furo manual"
            title="Marcar furo manual"
          >
            <AlertTriangle size={15} />
          </button>
        )}
        <button onClick={onEditar} className="p-1.5 text-text-muted tap-shrink" aria-label="Editar nome">
          <Pencil size={15} />
        </button>
        <button onClick={onAusencia} className="p-1.5 text-text-muted tap-shrink" aria-label="Marcar ausência">
          <X size={16} />
        </button>
        <button onClick={onRemover} className="p-1.5 text-danger tap-shrink" aria-label="Remover">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}
