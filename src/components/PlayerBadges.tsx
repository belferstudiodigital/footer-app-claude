import { Badge } from './ui/Badge'
import type { Mensalista, PagamentoStatusPublico } from '../types/database'

export function BadgeMensalista() {
  return <Badge tone="lime">Mensalista</Badge>
}

export function BadgePagamento({ pagamento }: { pagamento: PagamentoStatusPublico | undefined }) {
  if (!pagamento) return null
  if (pagamento.status === 'pendente') return <Badge tone="warning">💰 pendente</Badge>
  if (pagamento.status === 'declarado') return <Badge tone="warning">⏳ pago</Badge>
  return null
}

export function BadgeConfiabilidade({ mensalista }: { mensalista: Mensalista | undefined }) {
  if (!mensalista || mensalista.contador_furos_recentes <= 0) return null
  return (
    <Badge tone="warning">
      ⚠️ {mensalista.contador_furos_recentes} furo{mensalista.contador_furos_recentes > 1 ? 's' : ''} recente
      {mensalista.contador_furos_recentes > 1 ? 's' : ''}
    </Badge>
  )
}
