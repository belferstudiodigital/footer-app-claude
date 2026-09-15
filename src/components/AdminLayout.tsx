import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ShieldCheck, ClipboardList, Shuffle, Wallet, Bell, Trophy, LogOut, Menu, X, CreditCard,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { cn } from '../lib/utils'

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/times', label: 'Times', icon: ShieldCheck },
  { to: '/admin/presenca', label: 'Presença', icon: ClipboardList },
  { to: '/admin/sorteio', label: 'Sorteio', icon: Shuffle },
  { to: '/admin/pagamentos', label: 'Pagamentos', icon: Wallet },
  { to: '/admin/notificacoes', label: 'Notificações', icon: Bell },
  { to: '/admin/ranking', label: 'Ranking', icon: Trophy },
  { to: '/admin/plano', label: 'Plano', icon: CreditCard },
]

export function AdminLayout({ children }: { children: ReactNode }) {
  const { clube, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuAberto, setMenuAberto] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-dvh bg-bg text-text flex">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-surface/60 p-4 sticky top-0 h-dvh">
        <div className="mb-6 px-2">
          <p className="font-display text-2xl tracking-wide text-lime">FOOTER</p>
          <p className="text-xs text-text-muted truncate normal-case">{clube?.nome_clube}</p>
        </div>
        <nav className="flex-1 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-lime text-black' : 'text-text-muted hover:bg-surface-2 hover:text-text'
                )
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-2 hover:text-danger transition-colors"
        >
          <LogOut size={18} /> Sair
        </button>
      </aside>

      {/* Header mobile */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 glass safe-top">
        <div className="flex items-center justify-between px-4 h-14">
          <p className="font-display text-xl tracking-wide text-lime">FOOTER</p>
          <button onClick={() => setMenuAberto(true)} aria-label="Abrir menu" className="p-2 -mr-2 tap-shrink">
            <Menu size={22} />
          </button>
        </div>
      </div>

      {/* Menu mobile fullscreen */}
      {menuAberto && (
        <div className="md:hidden fixed inset-0 z-50 bg-bg animate-fade-in flex flex-col safe-top safe-bottom">
          <div className="flex items-center justify-between px-4 h-14 border-b border-border">
            <p className="font-display text-xl tracking-wide text-lime">FOOTER</p>
            <button onClick={() => setMenuAberto(false)} aria-label="Fechar menu" className="p-2 -mr-2 tap-shrink">
              <X size={22} />
            </button>
          </div>
          <p className="px-4 pt-3 text-xs text-text-muted normal-case truncate">{clube?.nome_clube}</p>
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenuAberto(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-3 text-base font-medium transition-colors',
                    isActive ? 'bg-lime text-black' : 'text-text-muted hover:bg-surface-2 hover:text-text'
                  )
                }
              >
                <item.icon size={20} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 m-4 rounded-xl px-3 py-3 text-base font-medium text-danger hover:bg-danger/10 transition-colors"
          >
            <LogOut size={20} /> Sair
          </button>
        </div>
      )}

      <main className="flex-1 min-w-0 px-4 pb-24 pt-20 md:pt-6 md:px-8 md:pb-8 max-w-5xl mx-auto w-full">
        {children}
      </main>
    </div>
  )
}
