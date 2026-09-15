import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Plus, ArrowUpDown, Users, X } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import { Spinner, EmptyState, ErrorBanner } from '../../components/ui/Feedback'
import { formatBRL, cn } from '../../lib/utils'
import { formatDataPorExtenso } from '../../lib/formatters'
import type { Mensalista, Pagamento, PosicaoJogador, StatusPagamento } from '../../types/database'

type Aba = 'mensalistas' | 'avulsos'

const STATUS_TONE: Record<StatusPagamento, 'warning' | 'muted' | 'success'> = {
  pendente: 'warning',
  declarado: 'warning',
  pago: 'success',
}
const STATUS_LABEL: Record<StatusPagamento, string> = {
  pendente: 'Pendente',
  declarado: 'Declarado',
  pago: 'Pago',
}

function mesAtualISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function Pagamentos() {
  const { clube } = useAuth()
  const queryClient = useQueryClient()
  const [aba, setAba] = useState<Aba>('mensalistas')
  const [timeId, setTimeId] = useState<string | null>(null)
  const [mesReferencia, setMesReferencia] = useState(mesAtualISO())
  const [jogoId, setJogoId] = useState<string | null>(null)
  const [ordemPendentesPrimeiro, setOrdemPendentesPrimeiro] = useState(true)
  const [erro, setErro] = useState('')
  const [nomeExtra, setNomeExtra] = useState('')
  const [gerenciarAberto, setGerenciarAberto] = useState(false)
  const [novoMensalista, setNovoMensalista] = useState('')
  const [novaPosicaoMensalista, setNovaPosicaoMensalista] = useState<PosicaoJogador>('linha')

  const { data: times } = useQuery({
    queryKey: ['times', clube?.id],
    enabled: Boolean(clube),
    queryFn: async () => {
      const { data } = await supabase.from('times').select('*').eq('clube_id', clube!.id).order('nome')
      if (data && data.length > 0 && !timeId) setTimeId(data[0].id)
      return data ?? []
    },
  })

  const timeAtual = times?.find((t) => t.id === timeId)

  const { data: jogos } = useQuery({
    queryKey: ['jogos-time-pag', timeId],
    enabled: Boolean(timeId) && aba === 'avulsos',
    queryFn: async () => {
      const { data } = await supabase.from('jogos').select('*').eq('time_id', timeId).order('data_jogo', { ascending: false }).limit(12)
      if (data && data.length > 0 && !jogoId) setJogoId(data[0].id)
      return data ?? []
    },
  })

  // Garante que exista um pagamento "pendente" para cada mensalista ativo no mês selecionado.
  // (insert manual das linhas faltantes — os índices únicos são parciais por tipo,
  // então evitamos upsert/ON CONFLICT e checamos o que já existe primeiro.)
  useEffect(() => {
    if (aba !== 'mensalistas' || !timeId || !clube) return
    ;(async () => {
      const { data: mensalistas } = await supabase.from('mensalistas').select('*').eq('time_id', timeId).eq('ativo', true)
      if (!mensalistas || mensalistas.length === 0) return
      const { data: existentes } = await supabase
        .from('pagamentos')
        .select('nome_normalizado')
        .eq('time_id', timeId)
        .eq('tipo', 'mensal')
        .eq('referencia_mes', mesReferencia)
      const jaExistem = new Set((existentes ?? []).map((p) => p.nome_normalizado))
      const faltantes = mensalistas.filter((m) => !jaExistem.has(m.nome_normalizado))
      if (faltantes.length === 0) return
      await supabase.from('pagamentos').insert(
        faltantes.map((m) => ({
          clube_id: clube.id,
          time_id: timeId,
          tipo: 'mensal' as const,
          mensalista_id: m.id,
          referencia_mes: mesReferencia,
          nome: m.nome,
          status: 'pendente' as const,
        }))
      )
      queryClient.invalidateQueries({ queryKey: ['pagamentos-mensal', timeId, mesReferencia] })
    })()
  }, [aba, timeId, mesReferencia, clube, queryClient])

  // Garante pagamento "avulso" pendente para cada confirmado do jogo selecionado.
  useEffect(() => {
    if (aba !== 'avulsos' || !jogoId || !timeId || !clube) return
    ;(async () => {
      const { data: confirmados } = await supabase
        .from('confirmacoes')
        .select('*')
        .eq('jogo_id', jogoId)
        .eq('vaga_principal', true)
        .in('status', ['confirmado', 'pendente_mensalista'])
      if (!confirmados || confirmados.length === 0) return
      const { data: existentes } = await supabase.from('pagamentos').select('nome_normalizado').eq('jogo_id', jogoId).eq('tipo', 'avulso')
      const jaExistem = new Set((existentes ?? []).map((p) => p.nome_normalizado))
      const faltantes = confirmados.filter((c) => !jaExistem.has(c.nome_normalizado))
      if (faltantes.length === 0) return
      await supabase.from('pagamentos').insert(
        faltantes.map((c) => ({
          clube_id: clube.id,
          time_id: timeId,
          tipo: 'avulso' as const,
          mensalista_id: c.mensalista_id,
          jogo_id: jogoId,
          nome: c.nome,
          status: 'pendente' as const,
        }))
      )
      queryClient.invalidateQueries({ queryKey: ['pagamentos-avulso', jogoId] })
    })()
  }, [aba, jogoId, timeId, clube, queryClient])

  const { data: mensalistas, refetch: refetchMensalistas } = useQuery({
    queryKey: ['mensalistas-gerenciar', timeId],
    enabled: Boolean(timeId) && aba === 'mensalistas',
    queryFn: async () => {
      const { data } = await supabase.from('mensalistas').select('*').eq('time_id', timeId).order('nome')
      return (data ?? []) as Mensalista[]
    },
  })

  async function adicionarMensalista() {
    if (!novoMensalista.trim() || !timeId || !clube) return
    const { error } = await supabase.from('mensalistas').insert({
      clube_id: clube.id,
      time_id: timeId,
      nome: novoMensalista,
      posicao_padrao: novaPosicaoMensalista,
    })
    if (error) setErro('Não foi possível adicionar (nome já cadastrado neste time?).')
    else {
      setNovoMensalista('')
      refetchMensalistas()
    }
  }

  async function alternarAtivoMensalista(m: Mensalista) {
    const { error } = await supabase.from('mensalistas').update({ ativo: !m.ativo }).eq('id', m.id)
    if (error) setErro('Não foi possível atualizar.')
    else refetchMensalistas()
  }

  const { data: pagamentosMensal, isLoading: carregandoMensal } = useQuery({
    queryKey: ['pagamentos-mensal', timeId, mesReferencia],
    enabled: Boolean(timeId) && aba === 'mensalistas',
    queryFn: async () => {
      const { data } = await supabase
        .from('pagamentos')
        .select('*, mensalistas(contador_furos_recentes)')
        .eq('time_id', timeId)
        .eq('tipo', 'mensal')
        .eq('referencia_mes', mesReferencia)
      return (data ?? []) as (Pagamento & { mensalistas: { contador_furos_recentes: number } | null })[]
    },
  })

  const { data: pagamentosAvulso, isLoading: carregandoAvulso } = useQuery({
    queryKey: ['pagamentos-avulso', jogoId],
    enabled: Boolean(jogoId) && aba === 'avulsos',
    queryFn: async () => {
      const { data } = await supabase.from('pagamentos').select('*').eq('jogo_id', jogoId).eq('tipo', 'avulso')
      return (data ?? []) as Pagamento[]
    },
  })

  const listaOrdenada = useMemo(() => {
    const lista = aba === 'mensalistas' ? pagamentosMensal ?? [] : pagamentosAvulso ?? []
    return [...lista].sort((a, b) => {
      if (ordemPendentesPrimeiro) {
        const peso = (s: StatusPagamento) => (s === 'pendente' ? 0 : s === 'declarado' ? 1 : 2)
        if (peso(a.status) !== peso(b.status)) return peso(a.status) - peso(b.status)
      }
      return a.nome.localeCompare(b.nome, 'pt-BR')
    })
  }, [aba, pagamentosMensal, pagamentosAvulso, ordemPendentesPrimeiro])

  async function confirmarPagamento(p: Pagamento) {
    setErro('')
    const { error } = await supabase.rpc('confirmar_pagamento_admin', { p_pagamento_id: p.id })
    if (error) return setErro('Não foi possível confirmar.')
    invalidarAtual()
  }

  async function marcarComoPago(p: Pagamento) {
    setErro('')
    const { error } = await supabase.from('pagamentos').update({ status: 'pago', pago_em: new Date().toISOString() }).eq('id', p.id)
    if (error) return setErro('Não foi possível atualizar.')
    invalidarAtual()
  }

  async function desmarcarPago(p: Pagamento) {
    setErro('')
    const { error } = await supabase.from('pagamentos').update({ status: 'pendente', pago_em: null, declarado_em: null }).eq('id', p.id)
    if (error) return setErro('Não foi possível atualizar.')
    invalidarAtual()
  }

  function invalidarAtual() {
    if (aba === 'mensalistas') queryClient.invalidateQueries({ queryKey: ['pagamentos-mensal', timeId, mesReferencia] })
    else queryClient.invalidateQueries({ queryKey: ['pagamentos-avulso', jogoId] })
  }

  async function adicionarAvulsoExtra() {
    if (!nomeExtra.trim() || !jogoId || !timeId || !clube) return
    const { error } = await supabase.from('pagamentos').insert({
      clube_id: clube.id,
      time_id: timeId,
      tipo: 'avulso',
      jogo_id: jogoId,
      nome: nomeExtra,
      status: 'pendente',
    })
    if (error) setErro('Não foi possível adicionar (nome já existe nesta lista?).')
    else {
      setNomeExtra('')
      invalidarAtual()
    }
  }

  const carregando = aba === 'mensalistas' ? carregandoMensal : carregandoAvulso

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">Controle de pagamentos</h1>

      <div className="flex gap-2">
        <button
          onClick={() => setAba('mensalistas')}
          className={cn('flex-1 h-10 rounded-xl text-sm font-medium', aba === 'mensalistas' ? 'bg-lime text-black' : 'bg-surface-2 text-text-muted border border-border')}
        >
          Mensalistas
        </button>
        <button
          onClick={() => setAba('avulsos')}
          className={cn('flex-1 h-10 rounded-xl text-sm font-medium', aba === 'avulsos' ? 'bg-lime text-black' : 'bg-surface-2 text-text-muted border border-border')}
        >
          Avulsos
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        {times?.map((t) => (
          <button
            key={t.id}
            onClick={() => setTimeId(t.id)}
            className={cn('shrink-0 rounded-full px-4 py-2 text-sm font-medium', timeId === t.id ? 'bg-lime text-black' : 'bg-surface-2 text-text-muted border border-border')}
          >
            {t.nome}
          </button>
        ))}
      </div>

      {aba === 'mensalistas' ? (
        <>
          <div className="flex items-center gap-3">
            <Input type="month" value={mesReferencia.slice(0, 7)} onChange={(e) => setMesReferencia(`${e.target.value}-01`)} className="w-44" />
            <button onClick={() => setGerenciarAberto((v) => !v)} className="flex items-center gap-1.5 text-sm text-lime">
              <Users size={15} /> Gerenciar mensalistas
            </button>
          </div>

          {gerenciarAberto && (
            <Card className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <Input placeholder="Nome do mensalista" value={novoMensalista} onChange={(e) => setNovoMensalista(e.target.value)} className="flex-1" />
                <Select value={novaPosicaoMensalista} onChange={(e) => setNovaPosicaoMensalista(e.target.value as PosicaoJogador)} className="sm:w-32">
                  <option value="linha">Linha</option>
                  <option value="goleiro">Goleiro</option>
                </Select>
                <Button onClick={adicionarMensalista}>
                  <Plus size={16} />
                </Button>
              </div>
              <div className="divide-y divide-border -my-1">
                {mensalistas?.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className={cn('text-sm', !m.ativo && 'text-text-muted line-through')}>{m.nome}</p>
                      <p className="text-xs text-text-muted normal-case">{m.posicao_padrao === 'goleiro' ? 'Goleiro' : 'Linha'}</p>
                    </div>
                    <button onClick={() => alternarAtivoMensalista(m)} className="text-xs text-text-muted underline">
                      {m.ativo ? 'inativar' : 'reativar'}
                    </button>
                  </div>
                ))}
                {(!mensalistas || mensalistas.length === 0) && <p className="text-sm text-text-muted py-2">Nenhum mensalista cadastrado.</p>}
              </div>
            </Card>
          )}
        </>
      ) : (
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
          {jogos?.map((j) => (
            <button
              key={j.id}
              onClick={() => setJogoId(j.id)}
              className={cn('shrink-0 rounded-xl px-3 py-2 text-xs font-medium capitalize whitespace-nowrap', jogoId === j.id ? 'bg-lime/15 text-lime border border-lime/40' : 'bg-surface-2 text-text-muted border border-border')}
            >
              {formatDataPorExtenso(j.data_jogo).split(',')[1]}
            </button>
          ))}
        </div>
      )}

      {erro && <ErrorBanner message={erro} />}

      <button onClick={() => setOrdemPendentesPrimeiro((v) => !v)} className="flex items-center gap-1.5 text-xs text-text-muted">
        <ArrowUpDown size={12} /> {ordemPendentesPrimeiro ? 'Pendentes primeiro' : 'Ordem alfabética'}
      </button>

      {aba === 'avulsos' && jogoId && (
        <Card className="flex gap-2">
          <Input placeholder="Nome extra (avulso)" value={nomeExtra} onChange={(e) => setNomeExtra(e.target.value)} className="flex-1" />
          <Button onClick={adicionarAvulsoExtra}>
            <Plus size={16} />
          </Button>
        </Card>
      )}

      {carregando ? (
        <Spinner />
      ) : listaOrdenada.length === 0 ? (
        <EmptyState title="Nenhum pagamento por aqui" subtitle={aba === 'mensalistas' ? 'Cadastre mensalistas no time selecionado.' : 'Selecione um jogo com jogadores confirmados.'} />
      ) : (
        <Card>
          <div className="divide-y divide-border -my-1">
            {listaOrdenada.map((p) => {
              const furos = (p as Pagamento & { mensalistas?: { contador_furos_recentes: number } | null }).mensalistas?.contador_furos_recentes
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px]">{p.nome}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                      {typeof furos === 'number' && furos > 0 && <Badge tone="warning">⚠️ {furos} furo(s)</Badge>}
                      {timeAtual?.valor_avulso_centavos != null && p.tipo === 'avulso' && (
                        <span className="text-xs text-text-muted">{formatBRL(timeAtual.valor_avulso_centavos)}</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {p.status === 'declarado' ? (
                      <Button size="sm" onClick={() => confirmarPagamento(p)}>
                        <Check size={14} /> Confirmar
                      </Button>
                    ) : p.status === 'pendente' ? (
                      <Button size="sm" variant="secondary" onClick={() => marcarComoPago(p)}>
                        Marcar pago
                      </Button>
                    ) : (
                      <button onClick={() => desmarcarPago(p)} className="text-xs text-text-muted underline">
                        desmarcar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
