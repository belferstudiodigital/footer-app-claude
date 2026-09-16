import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, Receipt, Bell, Settings, LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { cn } from '../lib/utils'

const NAV = [
  { to: '/superadmin', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/superadmin/usuarios', label: 'Usuários', icon: Users },
  { to: '/superadmin/faturamento', label: 'Faturamento', icon: Receipt },
  { to: '/superadmin/notificacoes', label: 'Notificações', icon: Bell },
  { to: '/superadmin/configuracoes', label: 'Configurações', icon: Settings },
]

export function SuperAdminLayout({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [menuAberto, setMenuAberto] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-dvh bg-bg text-text flex">
      <aside className="hidden md:flex w-64 shrink-0 flex-col ios-liquid-glass rounded-none border-y-0 border-l-0 p-4 sticky top-0 h-dvh">
        <div className="mb-8 px-2">
          <p className="font-display text-2xl tracking-wide text-lime">FOOTER</p>
          <p className="text-xs text-text-muted normal-case">Superadmin</p>
        </div>
        <nav className="flex-1 space-y-2.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ios-fluid-button', isActive ? 'bg-lime text-black' : 'text-text-muted hover:bg-surface-2/60 hover:backdrop-blur-md hover:text-text')
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={handleSignOut} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-2/60 hover:backdrop-blur-md hover:text-danger ios-fluid-button">
          <LogOut size={18} /> Sair
        </button>
      </aside>

      <div className="md:hidden fixed top-0 inset-x-0 z-40 ios-liquid-glass rounded-none border-x-0 border-t-0 safe-top">
        <div className="flex items-center justify-between px-4 h-14">
          <p className="font-display text-xl tracking-wide text-lime">FOOTER · Superadmin</p>
          <button onClick={() => setMenuAberto(true)} className="p-2 -mr-2 ios-fluid-button">
            <Menu size={22} />
          </button>
        </div>
      </div>

      {menuAberto && (
        <div className="md:hidden fixed inset-0 z-50 bg-bg animate-fade-in flex flex-col safe-top safe-bottom">
          <div className="flex items-center justify-between px-4 h-14 ios-liquid-glass rounded-none border-x-0 border-t-0">
            <p className="font-display text-xl tracking-wide text-lime">FOOTER</p>
            <button onClick={() => setMenuAberto(false)} className="p-2 -mr-2 ios-fluid-button">
              <X size={22} />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto p-4 space-y-3">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenuAberto(false)}
                className={({ isActive }) =>
                  cn('flex items-center gap-3 rounded-xl px-3 py-3 text-base font-medium ios-fluid-button', isActive ? 'bg-lime text-black' : 'text-text-muted hover:bg-surface-2/60 hover:backdrop-blur-md hover:text-text')
                }
              >
                <item.icon size={20} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button onClick={handleSignOut} className="flex items-center gap-3 m-4 rounded-xl px-3 py-3 text-base font-medium text-danger hover:bg-danger/10 ios-fluid-button">
            <LogOut size={20} /> Sair
          </button>
        </div>
      )}

      <main className="flex-1 min-w-0 px-4 pb-10 pt-20 md:pt-6 md:px-8 max-w-5xl mx-auto w-full">{children}</main>
    </div>
  )
}
