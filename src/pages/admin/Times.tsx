import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, MapPin, Clock } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Spinner, EmptyState } from '../../components/ui/Feedback'
import { diaSemanaLabel, formatHora } from '../../lib/formatters'
import { PLANOS, limiteAtingido } from '../../lib/planos'

export default function Times() {
  const { clube } = useAuth()

  const { data: times, isLoading } = useQuery({
    queryKey: ['times', clube?.id],
    enabled: Boolean(clube),
    queryFn: async () => {
      const { data } = await supabase.from('times').select('*').eq('clube_id', clube!.id).order('nome')
      return data ?? []
    },
  })

  const timesAtivos = times?.filter((t) => t.ativo).length ?? 0
  const bloqueadoPorPlano = limiteAtingido(clube?.plano ?? null, timesAtivos)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">Times</h1>
        {bloqueadoPorPlano ? (
          <Link to="/admin/plano">
            <Button size="sm" variant="outline">
              Fazer upgrade
            </Button>
          </Link>
        ) : (
          <Link to="/admin/times/novo">
            <Button size="sm">
              <Plus size={16} /> Novo time
            </Button>
          </Link>
        )}
      </div>

      {bloqueadoPorPlano && clube?.plano && (
        <Card className="border-warning/30">
          <p className="text-sm text-text normal-case">
            Seu plano <strong>{PLANOS[clube.plano].nome}</strong> permite {PLANOS[clube.plano].descricao}. Faça
            upgrade para cadastrar mais times.
          </p>
        </Card>
      )}

      {isLoading ? (
        <Spinner />
      ) : !times || times.length === 0 ? (
        <EmptyState title="Nenhum time cadastrado" subtitle="Crie seu primeiro time para começar a gerar listas." />
      ) : (
        <div className="space-y-2">
          {times.map((time) => (
            <Link key={time.id} to={`/admin/times/${time.id}`}>
              <Card className="hover:border-lime/30 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display text-lg">{time.nome}</p>
                    <p className="text-sm text-text-muted normal-case capitalize flex items-center gap-1.5">
                      <Clock size={13} /> {diaSemanaLabel(time.dia_semana)}, {formatHora(time.horario_inicio)}
                    </p>
                    <p className="text-sm text-text-muted normal-case flex items-center gap-1.5">
                      <MapPin size={13} /> {time.local}
                    </p>
                  </div>
                  <Badge tone={time.ativo ? 'success' : 'muted'}>{time.ativo ? 'Ativo' : 'Inativo'}</Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
