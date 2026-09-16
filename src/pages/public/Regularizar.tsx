import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../../components/ui/Button'
import { waLink } from '../../lib/utils'

const WHATSAPP_SUPORTE = '+5511999999999'

const MENSAGENS: Record<string, string> = {
  suspenso: 'Seu acesso está suspenso.',
  cancelado: 'Sua assinatura foi cancelada.',
  inadimplente: 'Identificamos uma pendência no pagamento do seu plano.',
}

export default function Regularizar() {
  const { clube, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const mensagem = clube ? MENSAGENS[clube.situacao] ?? 'Seu acesso precisa de regularização.' : ''

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center safe-top safe-bottom">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-danger/15 text-danger">
          <AlertTriangle size={28} />
        </div>
        <h1 className="font-display text-2xl mb-2">Acesso bloqueado</h1>
        <p className="text-sm text-text-muted mb-8">{mensagem} Regularize para voltar a usar o FOOTER.</p>
        <div className="flex flex-col gap-3">
          <a
            href={waLink(WHATSAPP_SUPORTE, `Olá! Preciso regularizar o acesso do clube ${clube?.nome_clube ?? ''} no FOOTER.`)}
            target="_blank"
            rel="noreferrer"
          >
            <Button className="w-full">Falar com o suporte</Button>
          </a>
          <Button variant="ghost" className="w-full" onClick={handleSignOut}>
            Sair
          </Button>
        </div>
      </div>
    </div>
  )
}
