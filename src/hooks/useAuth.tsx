import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Clube, PapelUsuarioRow } from '../types/database'

interface AuthState {
  loading: boolean
  session: Session | null
  papel: PapelUsuarioRow | null
  clube: Clube | null
  isSuperadmin: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [papel, setPapel] = useState<PapelUsuarioRow | null>(null)
  const [clube, setClube] = useState<Clube | null>(null)

  async function carregarPapel(userId: string) {
    const { data: papelRow } = await supabase
      .from('papeis_usuario')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    setPapel((papelRow as PapelUsuarioRow) ?? null)

    if (papelRow?.clube_id) {
      const { data: clubeRow } = await supabase
        .from('clubes')
        .select('*')
        .eq('id', papelRow.clube_id)
        .maybeSingle()
      setClube((clubeRow as Clube) ?? null)
    } else {
      setClube(null)
    }
  }

  async function refresh() {
    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    if (data.session?.user) {
      await carregarPapel(data.session.user.id)
    } else {
      setPapel(null)
      setClube(null)
    }
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      await refresh()
      if (mounted) setLoading(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      if (newSession?.user) {
        await carregarPapel(newSession.user.id)
      } else {
        setPapel(null)
        setClube(null)
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setPapel(null)
    setClube(null)
  }

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        papel,
        clube,
        isSuperadmin: papel?.papel === 'superadmin',
        refresh,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
