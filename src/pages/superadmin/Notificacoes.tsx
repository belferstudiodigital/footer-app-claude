import { useQuery } from '@tanstack/react-query'
import { BellRing, CheckCircle2, XCircle, HelpCircle, Smartphone } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Spinner, EmptyState } from '../../components/ui/Feedback'
import { formatDataHoraCurta } from '../../lib/formatters'
import type { Notificacao, SituacaoNotificacao } from '../../types/database'

const TIPO_LABEL: Record<string, string> = {
  abertura_lista: 'Abertura da lista',
  lembrete_semanal: 'Lembrete semanal',
  minimo_atingido: 'Mínimo atingido',
  maximo_atingido: 'Máximo atingido',
  sem_minimo: 'Cancelado sem mínimo',
  vaga_liberada: 'Vaga liberada',
  aviso_semanal_mensalistas_risco: 'Aviso semanal (mensalistas em risco)',
}

export default function SuperNotificacoes() {
  // Histórico geral (últimos envios de todos os clubes) — nenhum dado sensível de pagamento aqui.
  const { data: historico, isLoading } = useQuery({
    queryKey: ['superadmin-notificacoes'],
    queryFn: async () => {
      const { data } = await supabase
        .from('notificacoes')
        .select('*, clubes(nome_clube)')
        .order('created_at', { ascending: false })
        .limit(80)
      return (data ?? []) as (Notificacao & { clubes: { nome_clube: string } | null })[]
    },
  })

  // Cobertura de push por clube — apenas contagem de dispositivos, nunca endpoints/tokens.
  const { data: cobertura, isLoading: carregandoCobertura } = useQuery({
    queryKey: ['superadmin-push-cobertura'],
    queryFn: async () => {
      const { data: clubes } = await supabase.from('clubes').select('id, nome_clube').order('nome_clube')
      const { data: tokens } = await supabase.from('push_tokens').select('clube_id')
      const contagem = new Map<string, number>()
      for (const t of tokens ?? []) {
        contagem.set(t.clube_id, (contagem.get(t.clube_id) ?? 0) + 1)
      }
      return (clubes ?? []).map((c) => ({ id: c.id, nome: c.nome_clube, dispositivos: contagem.get(c.id) ?? 0 }))
    },
  })

  const totalSucesso = historico?.filter((n) => n.situacao === 'sucesso').length ?? 0
  const totalFalha = historico?.filter((n) => n.situacao === 'falha').length ?? 0
  const totalSemDispositivo = historico?.filter((n) => n.situacao === 'sem_dispositivo').length ?? 0

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">Notificações</h1>

      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center">
          <p className="font-display text-2xl text-success">{totalSucesso}</p>
          <p className="text-xs text-text-muted normal-case">enviadas</p>
        </Card>
        <Card className="text-center">
          <p className="font-display text-2xl text-danger">{totalFalha}</p>
          <p className="text-xs text-text-muted normal-case">com falha</p>
        </Card>
        <Card className="text-center">
          <p className="font-display text-2xl text-text-muted">{totalSemDispositivo}</p>
          <p className="text-xs text-text-muted normal-case">sem dispositivo</p>
        </Card>
      </div>

      <div>
        <h2 className="font-display text-lg mb-2 flex items-center gap-2">
          <Smartphone size={18} className="text-lime" /> Cobertura de push por clube
        </h2>
        {carregandoCobertura ? (
          <Spinner />
        ) : !cobertura || cobertura.length === 0 ? (
          <EmptyState title="Nenhum clube cadastrado" />
        ) : (
          <div className="space-y-2">
            {cobertura.map((c) => (
              <Card key={c.id} className="flex items-center justify-between py-2.5">
                <p className="text-sm">{c.nome}</p>
                <Badge tone={c.dispositivos > 0 ? 'success' : 'muted'}>
                  <BellRing size={12} className="mr-1" />
                  {c.dispositivos} dispositivo{c.dispositivos === 1 ? '' : 's'}
                </Badge>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="font-display text-lg mb-2">Histórico geral</h2>
        {isLoading ? (
          <Spinner />
        ) : !historico || historico.length === 0 ? (
          <EmptyState title="Nenhum envio ainda" />
        ) : (
          <div className="space-y-2">
            {historico.map((n) => (
              <Card key={n.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{n.clubes?.nome_clube ?? '—'}</p>
                    <p className="text-xs text-text-muted normal-case">{TIPO_LABEL[n.tipo] ?? n.tipo} · {formatDataHoraCurta(n.created_at)}</p>
                  </div>
                  <StatusIcone situacao={n.situacao} />
                </div>
                {n.erro && <p className="mt-1 text-xs text-danger normal-case">{n.erro}</p>}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusIcone({ situacao }: { situacao: SituacaoNotificacao }) {
  if (situacao === 'sucesso') return <Badge tone="success"><CheckCircle2 size={12} className="mr-1" />Enviado</Badge>
  if (situacao === 'falha') return <Badge tone="danger"><XCircle size={12} className="mr-1" />Falha</Badge>
  return <Badge tone="muted"><HelpCircle size={12} className="mr-1" />Sem dispositivo</Badge>
}
