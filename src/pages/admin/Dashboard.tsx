import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Wallet, ShieldCheck, CalendarClock } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { Card, CardTitle, CardSubtitle } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Spinner, EmptyState } from '../../components/ui/Feedback'
import { formatDataPorExtenso, formatHora } from '../../lib/formatters'
import type { Jogo, SituacaoJogo } from '../../types/database'

type JogoComTime = Jogo & { times: { nome: string } | null }

const SITUACAO_TONE: Record<SituacaoJogo, 'neutral' | 'success' | 'danger' | 'muted'> = {
  aguardando: 'neutral',
  confirmado: 'success',
  cancelado: 'danger',
  auto_cancelado: 'danger',
  encerrado: 'muted',
}
const SITUACAO_LABEL: Record<SituacaoJogo, string> = {
  aguardando: 'Aguardando',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
  auto_cancelado: 'Auto-cancelado',
  encerrado: 'Encerrado',
}

export default function Dashboard() {
  const { clube } = useAuth()
  const queryClient = useQueryClient()

  const { data: times } = useQuery({
    queryKey: ['times', clube?.id],
    enabled: Boolean(clube),
    queryFn: async () => {
      const { data } = await supabase.from('times').select('*').eq('clube_id', clube!.id).order('nome')
      return data ?? []
    },
  })

  // Garante jogos futuros e processa prazos/furos toda vez que o dashboard abre.
  useEffect(() => {
    if (!clube || !times) return
    ;(async () => {
      await supabase.rpc('processar_prazos_e_furos', { p_clube_id: clube.id })
      for (const time of times.filter((t) => t.ativo)) {
        await supabase.rpc('gerar_proximo_jogo', { p_time_id: time.id })
      }
      queryClient.invalidateQueries({ queryKey: ['proximos-jogos', clube.id] })
      queryClient.invalidateQueries({ queryKey: ['furos-semana', clube.id] })
      queryClient.invalidateQueries({ queryKey: ['pendencias-clube', clube.id] })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clube?.id, times?.length])

  const { data: proximosJogos, isLoading } = useQuery({
    queryKey: ['proximos-jogos', clube?.id],
    enabled: Boolean(clube),
    queryFn: async () => {
      const { data } = await supabase
        .from('jogos')
        .select('*, times(nome)')
        .eq('clube_id', clube!.id)
        .gte('data_jogo', new Date(Date.now() - 86400000).toISOString().slice(0, 10))
        .order('data_jogo', { ascending: true })
        .limit(8)
      return (data ?? []) as JogoComTime[]
    },
  })

  const { data: furosSemana } = useQuery({
    queryKey: ['furos-semana', clube?.id],
    enabled: Boolean(clube),
    queryFn: async () => {
      const seteDiasAtras = new Date(Date.now() - 7 * 86400000).toISOString()
      const { count } = await supabase
        .from('furos_mensalista')
        .select('id', { count: 'exact', head: true })
        .eq('clube_id', clube!.id)
        .gte('created_at', seteDiasAtras)
      return count ?? 0
    },
  })

  const { data: pendenciasClube } = useQuery({
    queryKey: ['pendencias-clube', clube?.id],
    enabled: Boolean(clube),
    queryFn: async () => {
      const { count } = await supabase
        .from('pagamentos')
        .select('id', { count: 'exact', head: true })
        .eq('clube_id', clube!.id)
        .in('status', ['pendente', 'declarado'])
      return count ?? 0
    },
  })

  const timesAtivos = times?.filter((t) => t.ativo).length ?? 0
  const jogosSemana = proximosJogos?.filter((j) => {
    const diff = (new Date(j.data_jogo).getTime() - Date.now()) / 86400000
    return diff >= -1 && diff <= 7
  }).length ?? 0
  const jogosConfirmados = proximosJogos?.filter((j) => j.situacao === 'confirmado').length ?? 0
  const jogosAguardando = proximosJogos?.filter((j) => j.situacao === 'aguardando').length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Olá, {clube?.nome_responsavel?.split(' ')[0]}!</h1>
        <p className="text-sm text-text-muted normal-case">{clube?.nome_clube}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ResumoCard label="Times ativos" valor={timesAtivos} />
        <ResumoCard label="Jogos na semana" valor={jogosSemana} />
        <ResumoCard label="Confirmados" valor={jogosConfirmados} tone="success" />
        <ResumoCard label="Aguardando" valor={jogosAguardando} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Link to="/admin/presenca">
          <Card className="hover:border-warning/40 transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/15 text-warning">
                <AlertTriangle size={18} />
              </div>
              <div>
                <p className="font-display text-xl leading-none">{furosSemana ?? 0}</p>
                <p className="text-sm text-text-muted normal-case">Furos da semana</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link to="/admin/pagamentos">
          <Card className="hover:border-warning/40 transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/15 text-warning">
                <Wallet size={18} />
              </div>
              <div>
                <p className="font-display text-xl leading-none">{pendenciasClube ?? 0}</p>
                <p className="text-sm text-text-muted normal-case">Pendências de pagamento</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-lg">Próximos jogos</h2>
          <Link to="/admin/times" className="text-sm text-lime hover:underline">
            Gerenciar times
          </Link>
        </div>

        {isLoading ? (
          <Spinner />
        ) : !proximosJogos || proximosJogos.length === 0 ? (
          <EmptyState
            title="Nenhum jogo por aqui ainda"
            subtitle="Cadastre um time para começar a gerar listas automaticamente."
          />
        ) : (
          <div className="space-y-2">
            {proximosJogos.map((jogo) => (
              <Link key={jogo.id} to={`/jogo/${jogo.id}`} target="_blank">
                <Card className="flex items-center justify-between gap-3 hover:border-lime/30 transition-colors">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{jogo.times?.nome}</p>
                    <p className="text-sm text-text-muted normal-case capitalize truncate">
                      {formatDataPorExtenso(jogo.data_jogo)} · {formatHora(jogo.horario_inicio)}
                    </p>
                  </div>
                  <Badge tone={SITUACAO_TONE[jogo.situacao as SituacaoJogo]}>{SITUACAO_LABEL[jogo.situacao as SituacaoJogo]}</Badge>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {(!times || times.length === 0) && (
        <Link to="/admin/times/novo">
          <Card className="border-dashed border-lime/30 text-center">
            <ShieldCheck className="mx-auto mb-2 text-lime" size={28} />
            <CardTitle>Crie seu primeiro time</CardTitle>
            <CardSubtitle>Defina dia, horário, local e limites — o FOOTER cuida do resto.</CardSubtitle>
          </Card>
        </Link>
      )}

      <p className="flex items-center gap-1.5 text-xs text-text-muted">
        <CalendarClock size={13} /> As listas dos próximos jogos são geradas automaticamente sempre que você abre o painel.
      </p>
    </div>
  )
}

function ResumoCard({ label, valor, tone }: { label: string; valor: number; tone?: 'success' }) {
  return (
    <Card>
      <p className={`font-display text-3xl ${tone === 'success' ? 'text-success' : 'text-lime'}`}>{valor}</p>
      <p className="text-sm text-text-muted normal-case">{label}</p>
    </Card>
  )
}
