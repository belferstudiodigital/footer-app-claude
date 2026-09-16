import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../../components/ui/Button'
import { waLink } from '../../lib/utils'

const WHATSAPP_SUPORTE = '+5511999999999'

export default function AguardandoAtivacao() {
  const { clube, refresh, signOut } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (clube && clube.situacao !== 'pendente') navigate('/admin')
  }, [clube, navigate])

  async function handleAtualizar() {
    await refresh()
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center safe-top safe-bottom">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-warning/15 text-warning">
          <Clock size={28} />
        </div>
        <h1 className="font-display text-2xl mb-2">Aguardando ativação</h1>
        <p className="text-sm text-text-muted mb-8">
          Seu cadastro em <strong className="text-text">{clube?.nome_clube}</strong> foi recebido. Assim que o
          pagamento do plano for confirmado, seu painel é liberado automaticamente.
        </p>
        <div className="flex flex-col gap-3">
          <Button onClick={handleAtualizar} className="w-full">
            Já paguei, verificar novamente
          </Button>
          <a href={waLink(WHATSAPP_SUPORTE, 'Olá! Acabei de assinar o FOOTER e gostaria de confirmar a ativação do meu clube.')} target="_blank" rel="noreferrer">
            <Button variant="secondary" className="w-full">
              Falar com o suporte
            </Button>
          </a>
          <Button variant="ghost" className="w-full" onClick={handleSignOut}>
            Sair
          </Button>
        </div>
      </div>
    </div>
  )
}
