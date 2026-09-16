import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Spinner, EmptyState } from '../../components/ui/Feedback'
import { PLANOS } from '../../lib/planos'
import { formatBRL } from '../../lib/utils'
import { formatDataHoraCurta } from '../../lib/formatters'
import type { Fatura } from '../../types/database'

const STATUS_TONE = { pago: 'success', pendente: 'warning', atrasado: 'danger' } as const
const STATUS_LABEL = { pago: 'Pago', pendente: 'Pendente', atrasado: 'Atrasado' } as const

export default function Plano() {
  const { clube } = useAuth()

  const { data: faturas, isLoading } = useQuery({
    queryKey: ['faturas', clube?.id],
    enabled: Boolean(clube),
    queryFn: async () => {
      const { data } = await supabase.from('faturas').select('*').eq('clube_id', clube!.id).order('created_at', { ascending: false })
      return (data ?? []) as Fatura[]
    },
  })

  const { data: timesAtivos } = useQuery({
    queryKey: ['times-ativos-count', clube?.id],
    enabled: Boolean(clube),
    queryFn: async () => {
      const { count } = await supabase.from('times').select('id', { count: 'exact', head: true }).eq('clube_id', clube!.id).eq('ativo', true)
      return count ?? 0
    },
  })

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">Meu plano</h1>

      {clube?.plano && (
        <Card>
          <p className="font-display text-xl text-lime">{PLANOS[clube.plano].nome}</p>
          <p className="text-sm text-text-muted normal-case mb-1">{PLANOS[clube.plano].descricao}</p>
          <p className="text-sm text-text-muted normal-case">
            {timesAtivos ?? 0} time(s) ativo(s) · {formatBRL(PLANOS[clube.plano].precoCentavos)}/mês
          </p>
          <Badge tone={clube.situacao === 'ativo' ? 'success' : 'warning'} className="mt-2">
            {clube.situacao === 'ativo' ? 'Assinatura ativa' : clube.situacao}
          </Badge>
        </Card>
      )}

      <div>
        <h2 className="font-display text-lg mb-2">Faturas</h2>
        {isLoading ? (
          <Spinner />
        ) : !faturas || faturas.length === 0 ? (
          <EmptyState title="Nenhuma fatura ainda" />
        ) : (
          <div className="space-y-2">
            {faturas.map((f) => (
              <Card key={f.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm">{formatBRL(f.valor_centavos)} · {PLANOS[f.plano].nome}</p>
                  <p className="text-xs text-text-muted normal-case">{formatDataHoraCurta(f.created_at)}</p>
                </div>
                <Badge tone={STATUS_TONE[f.status]}>{STATUS_LABEL[f.status]}</Badge>
              </Card>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-text-muted">
        Nesta versão de teste, pagamentos via Pix/cartão e a ativação automática ainda operam em modo manual/sandbox.
      </p>
    </div>
  )
}
