import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, CheckCircle2, Server, KeyRound } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { SuccessBanner, ErrorBanner } from '../../components/ui/Feedback'
import { PLANOS } from '../../lib/planos'
import { formatBRL } from '../../lib/utils'
import type { SituacaoClube } from '../../types/database'

const SITUACOES: SituacaoClube[] = ['pendente', 'ativo', 'suspenso', 'cancelado', 'inadimplente']

export default function SuperConfiguracoes() {
  const [processando, setProcessando] = useState(false)
  const [resultado, setResultado] = useState<'ok' | 'erro' | null>(null)

  const { data: porSituacao } = useQuery({
    queryKey: ['superadmin-config-situacoes'],
    queryFn: async () => {
      const resultados = await Promise.all(
        SITUACOES.map(async (s) => {
          const { count } = await supabase.from('clubes').select('id', { count: 'exact', head: true }).eq('situacao', s)
          return [s, count ?? 0] as const
        })
      )
      return Object.fromEntries(resultados) as Record<SituacaoClube, number>
    },
  })

  const vapidConfigurado = Boolean(import.meta.env.VITE_VAPID_PUBLIC_KEY)
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
  const supabaseHost = supabaseUrl ? supabaseUrl.replace(/^https?:\/\//, '').split('.')[0] : '—'

  async function processarPrazosEFuros() {
    setProcessando(true)
    setResultado(null)
    const { error } = await supabase.rpc('processar_prazos_e_furos', { p_clube_id: null })
    setResultado(error ? 'erro' : 'ok')
    setProcessando(false)
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">Configurações</h1>

      <div>
        <h2 className="font-display text-lg mb-2 flex items-center gap-2">
          <Server size={18} className="text-lime" /> Ambiente
        </h2>
        <Card className="space-y-2.5">
          <LinhaConfig label="Conexão Supabase" valor={isSupabaseConfigured ? supabaseHost : 'não configurada'} ok={isSupabaseConfigured} />
          <LinhaConfig label="Push (VAPID)" valor={vapidConfigurado ? 'configurada' : 'não configurada'} ok={vapidConfigurado} />
          <LinhaConfig label="Ambiente" valor={import.meta.env.MODE} ok />
        </Card>
      </div>

      <div>
        <h2 className="font-display text-lg mb-2 flex items-center gap-2">
          <KeyRound size={18} className="text-lime" /> Clubes por situação
        </h2>
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
          {SITUACOES.map((s) => (
            <Card key={s} className="text-center py-3">
              <p className="font-display text-xl text-lime">{porSituacao?.[s] ?? 0}</p>
              <p className="text-[11px] text-text-muted normal-case capitalize">{s}</p>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-display text-lg mb-2">Planos (referência)</h2>
        <div className="space-y-2">
          {Object.entries(PLANOS).map(([chave, p]) => (
            <Card key={chave} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-medium">{p.nome}</p>
                <p className="text-xs text-text-muted normal-case">{p.descricao}</p>
              </div>
              <Badge tone="muted">{formatBRL(p.precoCentavos)}/mês</Badge>
            </Card>
          ))}
        </div>
        <p className="mt-2 text-xs text-text-muted normal-case">
          Preços e limites são fixos no código deste build de teste — sem edição dinâmica.
        </p>
      </div>

      <div>
        <h2 className="font-display text-lg mb-2">Manutenção</h2>
        <Card className="space-y-3">
          <div>
            <p className="text-sm font-medium">Processar prazos e furos agora</p>
            <p className="text-xs text-text-muted normal-case">
              Executa manualmente a rotina que fecha prazos de mensalistas, registra furos e avalia auto-cancelamento por falta de mínimo, para todos os clubes. Em produção isso roda automaticamente; aqui serve para forçar a checagem sem esperar alguém abrir o app.
            </p>
          </div>
          {resultado === 'ok' && <SuccessBanner message="Rotina executada com sucesso." />}
          {resultado === 'erro' && <ErrorBanner message="Não foi possível executar a rotina." />}
          <Button onClick={processarPrazosEFuros} loading={processando} variant="secondary">
            <RefreshCw size={16} /> Executar agora
          </Button>
        </Card>
      </div>
    </div>
  )
}

function LinhaConfig({ label, valor, ok }: { label: string; valor: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-text-muted normal-case">{label}</p>
      <span className={ok ? 'flex items-center gap-1.5 text-sm text-success' : 'flex items-center gap-1.5 text-sm text-danger'}>
        {ok && <CheckCircle2 size={14} />}
        {valor}
      </span>
    </div>
  )
}
