import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Spinner } from './ui/Feedback'
import { AdminLayout } from './AdminLayout'
import { SuperAdminLayout } from './SuperAdminLayout'

export function RequireAdminClube({ children }: { children: ReactNode }) {
  const { loading, session, papel, clube } = useAuth()

  if (loading) return <Spinner className="min-h-dvh" />
  if (!session) return <Navigate to="/login" replace />
  if (!papel || papel.papel !== 'admin_clube' || !clube) return <Navigate to="/login" replace />

  if (!clube.plano) return <Navigate to="/assinatura" replace />
  if (clube.situacao === 'pendente') return <Navigate to="/aguardando-ativacao" replace />
  if (['suspenso', 'cancelado', 'inadimplente'].includes(clube.situacao)) {
    return <Navigate to="/regularizar" replace />
  }

  return <AdminLayout>{children}</AdminLayout>
}

export function RequireSuperadmin({ children }: { children: ReactNode }) {
  const { loading, session, isSuperadmin } = useAuth()

  if (loading) return <Spinner className="min-h-dvh" />
  if (!session) return <Navigate to="/login" replace />
  if (!isSuperadmin) return <Navigate to="/" replace />

  return <SuperAdminLayout>{children}</SuperAdminLayout>
}
