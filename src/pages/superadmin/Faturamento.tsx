import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Spinner, EmptyState } from '../../components/ui/Feedback'
import { formatBRL } from '../../lib/utils'
import { formatDataHoraCurta } from '../../lib/formatters'
import { PLANOS } from '../../lib/planos'
import type { Fatura } from '../../types/database'

const STATUS_TONE = { pago: 'success', pendente: 'warning', atrasado: 'danger' } as const

export default function Faturamento() {
  const queryClient = useQueryClient()

  const { data: faturas, isLoading } = useQuery({
    queryKey: ['superadmin-faturas'],
    queryFn: async () => {
      const { data } = await supabase.from('faturas').select('*, clubes(nome_clube)').order('created_at', { ascending: false }).limit(100)
      return (data ?? []) as (Fatura & { clubes: { nome_clube: string } | null })[]
    },
  })

  async function confirmarPagamento(faturaId: string) {
    const { error } = await supabase.rpc('confirmar_pagamento_fatura', { p_fatura_id: faturaId })
    if (!error) queryClient.invalidateQueries({ queryKey: ['superadmin-faturas'] })
  }

  const totalPago = faturas?.filter((f) => f.status === 'pago').reduce((acc, f) => acc + f.valor_centavos, 0) ?? 0

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">Faturamento</h1>
      <Card>
        <p className="font-display text-3xl text-lime">{formatBRL(totalPago)}</p>
        <p className="text-sm text-text-muted normal-case">total recebido (faturas pagas)</p>
      </Card>

      {isLoading ? (
        <Spinner />
      ) : !faturas || faturas.length === 0 ? (
        <EmptyState title="Nenhuma fatura ainda" />
      ) : (
        <div className="space-y-2">
          {faturas.map((f) => (
            <Card key={f.id} className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm">{f.clubes?.nome_clube} · {PLANOS[f.plano].nome}</p>
                <p className="text-xs text-text-muted normal-case">{formatBRL(f.valor_centavos)} · {formatDataHoraCurta(f.created_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[f.status]}>{f.status}</Badge>
                {f.status === 'pendente' && (
                  <Button size="sm" onClick={() => confirmarPagamento(f.id)}>
                    Confirmar
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
