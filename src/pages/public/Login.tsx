import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { ErrorBanner } from '../../components/ui/Feedback'
import { useAuth } from '../../hooks/useAuth'

export default function Login() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })
      if (error) throw error
      await refresh()

      let { data: papelRow } = await supabase
        .from('papeis_usuario')
        .select('papel, clube_id')
        .eq('user_id', data.user.id)
        .maybeSingle()

      // Primeiro login após confirmar e-mail: o clube ainda não existe (só o
      // cadastro de login). Os dados ficaram guardados no metadata do usuário
      // desde a tela de Cadastro — criamos o clube agora.
      if (!papelRow) {
        const meta = data.user.user_metadata as Record<string, string> | undefined
        if (meta?.nome_clube) {
          const { error: rpcError } = await supabase.rpc('criar_clube', {
            p_nome_responsavel: meta.nome_responsavel,
            p_email: data.user.email,
            p_cpf: meta.cpf,
            p_whatsapp: meta.whatsapp,
            p_nome_clube: meta.nome_clube,
          })
          if (rpcError) throw rpcError
          await refresh()
          const { data: novoPapel } = await supabase
            .from('papeis_usuario')
            .select('papel, clube_id')
            .eq('user_id', data.user.id)
            .maybeSingle()
          papelRow = novoPapel
        }
      }

      if (papelRow?.papel === 'superadmin') {
        navigate('/superadmin')
        return
      }

      if (papelRow?.clube_id) {
        const { data: clubeRow } = await supabase
          .from('clubes')
          .select('situacao, plano')
          .eq('id', papelRow.clube_id)
          .maybeSingle()

        if (clubeRow && !clubeRow.plano) navigate('/assinatura')
        else if (clubeRow?.situacao === 'pendente') navigate('/aguardando-ativacao')
        else if (clubeRow && ['suspenso', 'cancelado', 'inadimplente'].includes(clubeRow.situacao)) navigate('/regularizar')
        else navigate('/admin')
        return
      }

      navigate('/')
    } catch (err) {
      setErro(err instanceof Error ? traduzirErro(err.message) : 'Não foi possível entrar.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 safe-top safe-bottom">
      <div className="w-full max-w-sm animate-fade-in">
        <p className="font-display text-3xl text-lime tracking-wide text-center mb-8">FOOTER</p>
        <h1 className="font-display text-xl mb-6 text-center">Entrar</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {erro && <ErrorBanner message={erro} />}
          <Input
            label="E-mail"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Senha"
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
          <Button type="submit" className="w-full" size="lg" loading={carregando}>
            Entrar
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-muted">
          Ainda não tem conta?{' '}
          <Link to="/cadastro" className="text-lime hover:underline">
            Cadastre-se
          </Link>
        </p>
      </div>
    </div>
  )
}

function traduzirErro(msg: string) {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.'
  return msg
}
