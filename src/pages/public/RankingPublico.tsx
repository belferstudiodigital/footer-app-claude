import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Share2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { calcularRanking, MEDALHAS, type MedalhaId } from '../../lib/ranking'
import { gerarCardImagem, compartilharOuBaixarImagem } from '../../lib/shareCard'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Spinner, EmptyState } from '../../components/ui/Feedback'
import { normalizeName } from '../../lib/utils'

const NIVEL_LABEL: Record<string, string> = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', lendario: 'Lendário' }
const NIVEL_TONE: Record<string, 'warning' | 'muted' | 'lime' | 'success'> = {
  bronze: 'warning',
  prata: 'muted',
  ouro: 'lime',
  lendario: 'success',
}

export default function RankingPublico() {
  const { timeId } = useParams<{ timeId: string }>()
  const [meuNome, setMeuNome] = useState(() => localStorage.getItem('footer:ultimo-nome') ?? '')
  const [gerando, setGerando] = useState(false)

  const { data: time } = useQuery({
    queryKey: ['time-nome', timeId],
    enabled: Boolean(timeId),
    queryFn: async () => {
      const { data } = await supabase.from('times').select('nome').eq('id', timeId).single()
      return data
    },
  })

  const { data: jogosDoTime, isLoading } = useQuery({
    queryKey: ['jogos-time-ranking', timeId],
    enabled: Boolean(timeId),
    queryFn: async () => {
      const { data } = await supabase
        .from('jogos')
        .select('id, data_jogo, horario_limite')
        .eq('time_id', timeId)
        .order('data_jogo', { ascending: true })
      return data ?? []
    },
  })

  const { data: confirmacoesDoTime } = useQuery({
    queryKey: ['confirmacoes-time', timeId, jogosDoTime?.length],
    enabled: Boolean(jogosDoTime && jogosDoTime.length > 0),
    queryFn: async () => {
      const ids = (jogosDoTime ?? []).map((j) => j.id)
      const { data } = await supabase.from('confirmacoes').select('*').in('jogo_id', ids)
      return data ?? []
    },
  })

  const rankingCalculado = useMemo(() => {
    if (!jogosDoTime || !confirmacoesDoTime) return []
    return calcularRanking(jogosDoTime, confirmacoesDoTime).filter((j) =>
      Object.values(j.medalhas).some((n) => n !== null && n !== undefined)
    )
  }, [jogosDoTime, confirmacoesDoTime])

  const meuRanking = rankingCalculado.find((j) => normalizeName(j.nome) === normalizeName(meuNome))

  async function compartilhar() {
    if (!meuRanking || !time) return
    setGerando(true)
    try {
      const medalhas = Object.entries(meuRanking.medalhas)
        .filter(([, nivel]) => nivel)
        .map(([id, nivel]) => ({ nome: MEDALHAS[id as MedalhaId].nome, nivel: nivel as string }))
      const blob = await gerarCardImagem({
        tipo: 'ranking',
        nomeJogador: meuRanking.nome,
        nomeTime: time.nome,
        medalhas,
        sequenciaAtual: meuRanking.sequenciaAtual,
        totalConfirmacoes: meuRanking.totalConfirmacoes,
      })
      await compartilharOuBaixarImagem(blob, `footer-${normalizeName(meuRanking.nome)}.png`)
    } finally {
      setGerando(false)
    }
  }

  if (isLoading) return <Spinner className="min-h-dvh" />

  return (
    <div className="min-h-dvh safe-top safe-bottom pb-10 px-4 pt-6 max-w-lg mx-auto">
      <p className="font-display text-2xl text-lime tracking-wide text-center mb-1">FOOTER</p>
      <h1 className="font-display text-xl text-center text-text-muted mb-6">Ranking Boleiragem — {time?.nome}</h1>

      {meuRanking && (
        <Card className="mb-4 text-center">
          <p className="text-sm text-text-muted normal-case">Seu desempenho</p>
          <p className="font-display text-2xl">{meuRanking.nome}</p>
          <Button className="mt-3 w-full" onClick={compartilhar} loading={gerando}>
            <Share2 size={16} /> Compartilhar meu card
          </Button>
        </Card>
      )}

      {rankingCalculado.length === 0 ? (
        <EmptyState title="Ainda sem craques no ranking" subtitle="Confirme presença em alguns jogos para aparecer aqui." />
      ) : (
        <div className="space-y-3">
          {rankingCalculado.map((j) => (
            <Card key={j.nome}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-display text-lg">{j.nome}</p>
                <Badge tone="muted">{j.totalConfirmacoes} jogos</Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(j.medalhas)
                  .filter(([, nivel]) => nivel)
                  .map(([id, nivel]) => (
                    <Badge key={id} tone={NIVEL_TONE[nivel as string]}>
                      {MEDALHAS[id as MedalhaId].nome} · {NIVEL_LABEL[nivel as string]}
                    </Badge>
                  ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <input
        className="mt-8 w-full h-10 rounded-xl bg-surface-2 border border-border px-3 text-sm text-center text-text-muted"
        placeholder="Digite seu nome para ver seu card"
        value={meuNome}
        onChange={(e) => setMeuNome(e.target.value)}
      />
    </div>
  )
}
