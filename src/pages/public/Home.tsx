import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import logoFooter from '../../assets/logo-footer.png'
import stickerCorrida from '../../assets/sticker-corrida.png'

export default function Home() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 safe-top safe-bottom text-center relative overflow-hidden">
      <img
        src={stickerCorrida}
        alt=""
        aria-hidden="true"
        className="pointer-events-none select-none absolute -right-10 top-16 w-40 opacity-[0.08] rotate-6"
      />
      <div className="w-full max-w-sm animate-fade-in relative">
        <img src={logoFooter} alt="FOOTER" className="mx-auto w-48 sm:w-56 drop-shadow-[0_0_24px_rgba(202,255,59,0.25)]" />
        <p className="text-sm text-text-muted -mt-2 mb-1">O sistema da sua arena</p>
        <h1 className="font-display text-2xl text-text mt-8 mb-10 leading-tight">
          Organize sua pelada.
          <br />
          Sem bagunça.
        </h1>

        <div className="flex flex-col gap-3">
          <Link to="/login" className="w-full">
            <Button className="w-full" size="lg">
              Acessar minhas listas
            </Button>
          </Link>
          <Link to="/cadastro" className="w-full">
            <Button className="w-full" size="lg" variant="secondary">
              Novo usuário? Cadastre-se
            </Button>
          </Link>
        </div>

        <Link
          to="/login?super=1"
          className="mt-10 inline-block text-xs text-text-muted/50 hover:text-text-muted transition-colors"
        >
          acesso administrativo
        </Link>
      </div>
    </div>
  )
}
