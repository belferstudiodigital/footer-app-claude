import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Shuffle, History } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Spinner, EmptyState, ErrorBanner } from '../../components/ui/Feedback'
import { formatDataPorExtenso, formatDataHoraCurta } from '../../lib/formatters'
import { cn } from '../../lib/utils'
import type { Confirmacao, Sorteio as SorteioType } from '../../types/database'

interface TimeGerado {
  nome: string
  jogadores: string[]
  goleiro: string | null
}

export default function Sorteio() {
  const { clube } = useAuth()
  const queryClient = useQueryClient()
  const [timeId, setTimeId] = useState<string | null>(null)
  const [jogoId, setJogoId] = useState<string | null>(null)
  const [qtdPorTime, setQtdPorTime] = useState(5)
  const [removidos, setRemovidos] = useState<Set<string>>(new Set())
  const [resultado, setResultado] = useState<TimeGerado[] | null>(null)
  const [erro, setErro] = useState('')

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
    queryKey: ['jogos-time-sorteio', timeId],
    enabled: Boolean(timeId),
    queryFn: async () => {
      const { data } = await supabase
        .from('jogos')
        .select('*')
        .eq('time_id', timeId)
        .neq('situacao', 'cancelado')
        .order('data_jogo', { ascending: false })
        .limit(10)
      if (data && data.length > 0 && !jogoId) setJogoId(data[0].id)
      return data ?? []
    },
  })

  const { data: confirmados, isLoading } = useQuery({
    queryKey: ['confirmados-sorteio', jogoId],
    enabled: Boolean(jogoId),
    queryFn: async () => {
      const { data } = await supabase
        .from('confirmacoes')
        .select('*')
        .eq('jogo_id', jogoId)
        .eq('vaga_principal', true)
        .in('status', ['confirmado', 'pendente_mensalista'])
      return (data ?? []) as Confirmacao[]
    },
  })

  const { data: historico } = useQuery({
    queryKey: ['sorteios-jogo', jogoId],
    enabled: Boolean(jogoId),
    queryFn: async () => {
      const { data } = await supabase.from('sorteios').select('*').eq('jogo_id', jogoId).order('created_at', { ascending: false }).limit(5)
      return (data ?? []) as SorteioType[]
    },
  })

  const jogadoresLinha = useMemo(() => (confirmados ?? []).filter((c) => c.posicao === 'linha' && !removidos.has(c.id)), [confirmados, removidos])
  const goleiros = useMemo(() => (confirmados ?? []).filter((c) => c.posicao === 'goleiro' && !removidos.has(c.id)), [confirmados, removidos])

  const numTimes = Math.max(2, Math.ceil(jogadoresLinha.length / Math.max(1, qtdPorTime)))

  function embaralhar<T>(arr: T[]): T[] {
    const copia = [...arr]
    for (let i = copia.length - 1; i > 0; i--) {
      const j = randomInt(i + 1)
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
    }
    return copia
  }

  function randomInt(max: number): number {
    if (window.crypto?.getRandomValues) {
      const arr = new Uint32Array(1)
      window.crypto.getRandomValues(arr)
      return arr[0] % max
    }
    return Math.floor(Math.random() * max)
  }

  async function sortear() {
    setErro('')
    if (jogadoresLinha.length === 0) return setErro('Não há jogadores de linha confirmados para sortear.')

    const linhaEmbaralhada = embaralhar(jogadoresLinha)
    const goleirosEmbaralhados = embaralhar(goleiros)

    const times_: TimeGerado[] = Array.from({ length: numTimes }, (_, i) => ({
      nome: `Time ${String.fromCharCode(65 + i)}`,
      jogadores: [],
      goleiro: null,
    }))

    linhaEmbaralhada.forEach((jogador, idx) => {
      times_[idx % numTimes].jogadores.push(jogador.nome)
    })
    goleirosEmbaralhados.forEach((g, idx) => {
      times_[idx % numTimes].goleiro = g.nome
    })

    setResultado(times_)

    const { error } = await supabase.from('sorteios').insert({
      jogo_id: jogoId,
      clube_id: clube!.id,
      configuracao: { qtd_por_time: qtdPorTime, removidos: [...removidos] },
      resultado: { times: times_ },
    })
    if (error) setErro('Sorteio gerado, mas não foi possível salvar o histórico.')
    else queryClient.invalidateQueries({ queryKey: ['sorteios-jogo', jogoId] })
  }

  function reabrirSorteio(s: SorteioType) {
    const dados = s.resultado as { times: TimeGerado[] }
    setResultado(dados.times)
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">Sorteio de times</h1>

      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        {times?.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTimeId(t.id)
              setJogoId(null)
              setResultado(null)
              setRemovidos(new Set())
            }}
            className={cn('shrink-0 rounded-full px-4 py-2 text-sm font-medium', timeId === t.id ? 'bg-lime text-black' : 'bg-surface-2 text-text-muted border border-border')}
          >
            {t.nome}
          </button>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        {jogos?.map((j) => (
          <button
            key={j.id}
            onClick={() => {
              setJogoId(j.id)
              setResultado(null)
              setRemovidos(new Set())
            }}
            className={cn('shrink-0 rounded-xl px-3 py-2 text-xs font-medium capitalize whitespace-nowrap', jogoId === j.id ? 'bg-lime/15 text-lime border border-lime/40' : 'bg-surface-2 text-text-muted border border-border')}
          >
            {j.data_jogo && formatDataPorExtenso(j.data_jogo).split(',')[1]}
          </button>
        ))}
      </div>

      {erro && <ErrorBanner message={erro} />}

      {isLoading ? (
        <Spinner />
      ) : !confirmados || confirmados.length === 0 ? (
        <EmptyState title="Sem confirmados neste jogo" subtitle="Escolha outro jogo ou aguarde confirmações." />
      ) : (
        <>
          <Card className="space-y-3">
            <div className="flex items-center gap-3">
              <Input
                label="Jogadores de linha por time"
                type="number"
                min={1}
                value={qtdPorTime}
                onChange={(e) => setQtdPorTime(Math.max(1, Number(e.target.value)))}
                className="w-32"
              />
              <p className="text-sm text-text-muted normal-case pt-6">
                {jogadoresLinha.length} jogadores → {numTimes} times
              </p>
            </div>
            <Button onClick={sortear}>
              <Shuffle size={16} /> Sortear
            </Button>
          </Card>

          <details className="text-sm">
            <summary className="cursor-pointer text-text-muted">Ajustar participantes ({jogadoresLinha.length + goleiros.length} de {confirmados.length})</summary>
            <Card className="mt-2 divide-y divide-border -my-1">
              {confirmados.map((c) => (
                <label key={c.id} className="flex items-center justify-between py-2 gap-2">
                  <span className={removidos.has(c.id) ? 'text-text-muted line-through' : ''}>
                    {c.nome} <Badge tone="muted" className="ml-1">{c.posicao}</Badge>
                  </span>
                  <input
                    type="checkbox"
                    checked={!removidos.has(c.id)}
                    onChange={(e) => {
                      setRemovidos((prev) => {
                        const novo = new Set(prev)
                        if (e.target.checked) novo.delete(c.id)
                        else novo.add(c.id)
                        return novo
                      })
                    }}
                    className="h-4 w-4 accent-[#caff3b]"
                  />
                </label>
              ))}
            </Card>
          </details>

          {resultado && (
            <div className="grid sm:grid-cols-2 gap-3">
              {resultado.map((t) => (
                <Card key={t.nome}>
                  <p className="font-display text-lg mb-2">{t.nome}</p>
                  {t.goleiro && (
                    <p className="text-sm mb-1">
                      <Badge tone="lime">Goleiro</Badge> {t.goleiro}
                    </p>
                  )}
                  <ul className="text-sm text-text-muted normal-case space-y-0.5">
                    {t.jogadores.map((j) => (
                      <li key={j} className="text-text">
                        {j}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          )}

          {historico && historico.length > 0 && (
            <div>
              <h2 className="flex items-center gap-1.5 font-display text-sm text-text-muted mb-2">
                <History size={14} /> Sorteios anteriores
              </h2>
              <div className="space-y-2">
                {historico.map((s) => (
                  <button key={s.id} onClick={() => reabrirSorteio(s)} className="w-full text-left">
                    <Card className="hover:border-lime/30 transition-colors py-2.5">
                      <p className="text-sm text-text-muted normal-case">{formatDataHoraCurta(s.created_at)}</p>
                    </Card>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
