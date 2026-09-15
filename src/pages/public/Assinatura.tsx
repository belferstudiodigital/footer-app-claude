import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ErrorBanner } from '../../components/ui/Feedback'
import { PLANOS } from '../../lib/planos'
import { formatBRL, cn } from '../../lib/utils'
import type { PlanoClube } from '../../types/database'

export default function Assinatura() {
  const { clube, refresh } = useAuth()
  const navigate = useNavigate()
  const [selecionado, setSelecionado] = useState<PlanoClube | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  async function confirmar() {
    if (!clube || !selecionado) return
    setErro('')
    setCarregando(true)
    try {
      const { error } = await supabase.rpc('escolher_plano', { p_clube_id: clube.id, p_plano: selecionado })
      if (error) throw error
      await refresh()
      navigate('/aguardando-ativacao')
    } catch {
      setErro('Não foi possível registrar seu plano. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-10 safe-top safe-bottom">
      <div className="w-full max-w-sm animate-fade-in">
        <p className="font-display text-3xl text-lime tracking-wide text-center mb-2">FOOTER</p>
        <h1 className="font-display text-xl mb-1 text-center">Escolha seu plano</h1>
        <p className="text-sm text-text-muted text-center mb-8">
          Você pode trocar de plano quando quiser.
        </p>

        {erro && <div className="mb-4"><ErrorBanner message={erro} /></div>}

        <div className="space-y-3 mb-6">
          {(Object.entries(PLANOS) as [PlanoClube, (typeof PLANOS)[PlanoClube]][]).map(([id, plano]) => (
            <Card
              key={id}
              onClick={() => setSelecionado(id)}
              className={cn(
                'cursor-pointer transition-all',
                selecionado === id ? 'border-lime ring-2 ring-lime/30' : 'border-border'
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-display text-lg">{plano.nome}</p>
                  <p className="text-sm text-text-muted normal-case">{plano.descricao}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-lg text-lime">{formatBRL(plano.precoCentavos)}</p>
                  <p className="text-xs text-text-muted">/mês</p>
                </div>
              </div>
              {selecionado === id && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-lime">
                  <Check size={14} /> Selecionado
                </div>
              )}
            </Card>
          ))}
        </div>

        <Button className="w-full" size="lg" disabled={!selecionado} loading={carregando} onClick={confirmar}>
          Continuar
        </Button>

        <p className="mt-4 text-center text-xs text-text-muted">
          Pagamento via Pix ou cartão. Nesta versão de teste, a ativação é confirmada manualmente.
        </p>
      </div>
    </div>
  )
}
