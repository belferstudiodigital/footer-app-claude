import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { ErrorBanner } from '../../components/ui/Feedback'
import { formatCPF, isValidCPF, formatPhoneBR, normalizePhoneBR } from '../../lib/utils'
import { useAuth } from '../../hooks/useAuth'

export default function Cadastro() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [form, setForm] = useState({
    nomeResponsavel: '',
    nomeClube: '',
    email: '',
    cpf: '',
    whatsapp: '',
    senha: '',
    confirmSenha: '',
  })
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')

    if (!isValidCPF(form.cpf)) return setErro('CPF inválido. Confira os números digitados.')
    if (form.whatsapp.replace(/\D/g, '').length < 10) return setErro('WhatsApp inválido. Informe o DDD + número.')
    if (form.senha.length < 8) return setErro('A senha precisa ter no mínimo 8 caracteres.')
    if (form.senha !== form.confirmSenha) return setErro('As senhas não coincidem.')

    setCarregando(true)
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.senha,
        options: {
          // Guardamos os dados do clube no metadata do usuário: se a confirmação de
          // e-mail estiver obrigatória, ainda não temos sessão pra chamar criar_clube()
          // agora — o Login.tsx lê esse metadata e cria o clube no primeiro login,
          // já com a confirmação feita.
          data: {
            nome_responsavel: form.nomeResponsavel,
            nome_clube: form.nomeClube,
            cpf: form.cpf.replace(/\D/g, ''),
            whatsapp: normalizePhoneBR(form.whatsapp),
          },
        },
      })
      if (signUpError) throw signUpError
      if (!signUpData.session) {
        // Projeto com confirmação de e-mail obrigatória: orienta o usuário.
        setErro('Enviamos um e-mail de confirmação. Confirme e depois faça login para continuar o cadastro.')
        setCarregando(false)
        return
      }

      const { error: rpcError } = await supabase.rpc('criar_clube', {
        p_nome_responsavel: form.nomeResponsavel,
        p_email: form.email,
        p_cpf: form.cpf.replace(/\D/g, ''),
        p_whatsapp: normalizePhoneBR(form.whatsapp),
        p_nome_clube: form.nomeClube,
      })
      if (rpcError) throw rpcError

      await refresh()
      navigate('/assinatura')
    } catch (err) {
      setErro(err instanceof Error ? traduzirErro(err.message) : 'Não foi possível concluir o cadastro.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-10 safe-top safe-bottom">
      <div className="w-full max-w-sm animate-fade-in">
        <p className="font-display text-3xl text-lime tracking-wide text-center mb-8">FOOTER</p>
        <h1 className="font-display text-xl mb-6 text-center">Criar minha conta</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {erro && <ErrorBanner message={erro} />}
          <Input
            label="Seu nome completo"
            required
            value={form.nomeResponsavel}
            onChange={(e) => set('nomeResponsavel', e.target.value)}
          />
          <Input
            label="Nome do clube / pelada"
            required
            placeholder="Ex: Racha do Bairro"
            value={form.nomeClube}
            onChange={(e) => set('nomeClube', e.target.value)}
          />
          <Input
            label="E-mail"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
          <Input
            label="CPF"
            inputMode="numeric"
            required
            value={form.cpf}
            onChange={(e) => set('cpf', formatCPF(e.target.value))}
          />
          <Input
            label="WhatsApp (com DDD)"
            inputMode="tel"
            required
            placeholder="(11) 99999-9999"
            value={form.whatsapp}
            onChange={(e) => set('whatsapp', formatPhoneBR(e.target.value))}
          />
          <Input
            label="Senha"
            type="password"
            required
            hint="Mínimo de 8 caracteres"
            value={form.senha}
            onChange={(e) => set('senha', e.target.value)}
          />
          <Input
            label="Confirmar senha"
            type="password"
            required
            value={form.confirmSenha}
            onChange={(e) => set('confirmSenha', e.target.value)}
          />
          <Button type="submit" className="w-full" size="lg" loading={carregando}>
            Criar conta
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-muted">
          Já tem conta?{' '}
          <Link to="/login" className="text-lime hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}

function traduzirErro(msg: string) {
  if (msg.includes('User already registered')) return 'Já existe uma conta com este e-mail.'
  if (msg.includes('usuario_ja_possui_papel')) return 'Esta conta já está vinculada a um clube.'
  return msg
}
