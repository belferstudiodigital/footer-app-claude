import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Spinner, EmptyState } from '../../components/ui/Feedback'
import { calcularRanking, MEDALHAS, type MedalhaId } from '../../lib/ranking'
import { cn } from '../../lib/utils'

const NIVEL_LABEL: Record<string, string> = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', lendario: 'Lendário' }

export default function Ranking() {
  const { clube } = useAuth()
  const [timeId, setTimeId] = useState<string | null>(null)

  const { data: times } = useQuery({
    queryKey: ['times', clube?.id],
    enabled: Boolean(clube),
    queryFn: async () => {
      const { data } = await supabase.from('times').select('*').eq('clube_id', clube!.id).order('nome')
      if (data && data.length > 0 && !timeId) setTimeId(data[0].id)
      return data ?? []
    },
  })

  const { data: jogos, isLoading: carregandoJogos } = useQuery({
    queryKey: ['jogos-time-ranking-admin', timeId],
    enabled: Boolean(timeId),
    queryFn: async () => {
      const { data } = await supabase.from('jogos').select('id, data_jogo, horario_limite').eq('time_id', timeId).order('data_jogo', { ascending: true })
      return data ?? []
    },
  })

  const { data: confirmacoes, isLoading: carregandoConf } = useQuery({
    queryKey: ['confirmacoes-time-ranking-admin', timeId, jogos?.length],
    enabled: Boolean(jogos && jogos.length > 0),
    queryFn: async () => {
      const ids = (jogos ?? []).map((j) => j.id)
      const { data } = await supabase.from('confirmacoes').select('*').in('jogo_id', ids)
      return data ?? []
    },
  })

  const ranking = useMemo(() => {
    if (!jogos || !confirmacoes) return []
    return calcularRanking(jogos, confirmacoes)
  }, [jogos, confirmacoes])

  const top5PorMedalha = useMemo(() => {
    const resultado: Partial<Record<MedalhaId, typeof ranking>> = {}
    for (const id of Object.keys(MEDALHAS) as MedalhaId[]) {
      resultado[id] = [...ranking]
        .filter((j) => j.medalhas[id])
        .sort((a, b) => {
          const ordem = { bronze: 0, prata: 1, ouro: 2, lendario: 3 }
          return (ordem[b.medalhas[id] as keyof typeof ordem] ?? -1) - (ordem[a.medalhas[id] as keyof typeof ordem] ?? -1)
        })
        .slice(0, 5)
    }
    return resultado
  }, [ranking])

  const carregando = carregandoJogos || carregandoConf

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">Ranking Boleiragem</h1>
        {timeId && (
          <Link to={`/ranking/${timeId}`} target="_blank" className="text-sm text-lime flex items-center gap-1 hover:underline">
            ver página pública <ExternalLink size={13} />
          </Link>
        )}
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

      {carregando ? (
        <Spinner />
      ) : ranking.length === 0 ? (
        <EmptyState title="Ainda sem histórico" subtitle="O ranking aparece assim que houver jogos com confirmações." />
      ) : (
        <>
          <div>
            <h2 className="font-display text-lg mb-2">Top 5 por medalha</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {(Object.keys(MEDALHAS) as MedalhaId[]).map((id) => (
                <Card key={id}>
                  <p className="font-display text-base mb-1">{MEDALHAS[id].nome}</p>
                  <p className="text-xs text-text-muted normal-case mb-2">{MEDALHAS[id].descricao}</p>
                  {top5PorMedalha[id]?.length ? (
                    <ol className="text-sm space-y-1">
                      {top5PorMedalha[id]!.map((j, i) => (
                        <li key={j.nome} className="flex justify-between">
                          <span>
                            {i + 1}. {j.nome}
                          </span>
                          <Badge tone="lime">{NIVEL_LABEL[j.medalhas[id] as string]}</Badge>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-text-muted">Ninguém ainda.</p>
                  )}
                </Card>
              ))}
            </div>
          </div>

          <div>
            <h2 className="font-display text-lg mb-2">Todos os jogadores</h2>
            <Card>
              <div className="divide-y divide-border -my-1">
                {ranking.map((j) => (
                  <div key={j.nome} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-[15px]">{j.nome}</p>
                      <p className="text-xs text-text-muted normal-case">
                        {j.totalConfirmacoes} jogos · sequência {j.sequenciaAtual}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end max-w-[55%]">
                      {Object.entries(j.medalhas)
                        .filter(([, n]) => n)
                        .map(([id]) => (
                          <Badge key={id} tone="muted">
                            {MEDALHAS[id as MedalhaId].nome.split(' ')[0]}
                          </Badge>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
