import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Select, Textarea } from '../../components/ui/Input'
import { ErrorBanner, Spinner } from '../../components/ui/Feedback'
import { formatPhoneBR, normalizePhoneBR, waLink } from '../../lib/utils'
import { diaSemanaLabel } from '../../lib/formatters'
import { limiteAtingido } from '../../lib/planos'

const DIAS = [0, 1, 2, 3, 4, 5, 6]

interface FormState {
  nome: string
  dia_semana: number
  horario_inicio: string
  horario_fim: string
  local: string
  minimo_jogadores: number
  maximo_jogadores: number
  maximo_goleiros: number
  maximo_espera: number
  horas_limite_confirmacao: number
  horas_prazo_confirmacao_mensalista: number
  janela_furos_semanas: number
  whatsapp_admin: string
  valor_avulso: string
  chave_pix: string
  recados: string
  ativo: boolean
}

const PADRAO: FormState = {
  nome: '',
  dia_semana: 0,
  horario_inicio: '19:00',
  horario_fim: '21:00',
  local: '',
  minimo_jogadores: 14,
  maximo_jogadores: 20,
  maximo_goleiros: 2,
  maximo_espera: 10,
  horas_limite_confirmacao: 2,
  horas_prazo_confirmacao_mensalista: 24,
  janela_furos_semanas: 4,
  whatsapp_admin: '',
  valor_avulso: '',
  chave_pix: '',
  recados: '',
  ativo: true,
}

export default function TimeForm() {
  const { timeId } = useParams<{ timeId: string }>()
  const editando = Boolean(timeId)
  const { clube } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<FormState>(PADRAO)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [carregado, setCarregado] = useState(!editando)

  const { data: timesAtuais } = useQuery({
    queryKey: ['times', clube?.id],
    enabled: Boolean(clube) && !editando,
    queryFn: async () => {
      const { data } = await supabase.from('times').select('id, ativo').eq('clube_id', clube!.id)
      return data ?? []
    },
  })

  useEffect(() => {
    if (!editando || !timeId) return
    ;(async () => {
      const { data } = await supabase.from('times').select('*').eq('id', timeId).single()
      if (data) {
        setForm({
          nome: data.nome,
          dia_semana: data.dia_semana,
          horario_inicio: data.horario_inicio.slice(0, 5),
          horario_fim: data.horario_fim.slice(0, 5),
          local: data.local,
          minimo_jogadores: data.minimo_jogadores,
          maximo_jogadores: data.maximo_jogadores,
          maximo_goleiros: data.maximo_goleiros,
          maximo_espera: data.maximo_espera,
          horas_limite_confirmacao: Number(data.horas_limite_confirmacao),
          horas_prazo_confirmacao_mensalista: Number(data.horas_prazo_confirmacao_mensalista),
          janela_furos_semanas: data.janela_furos_semanas,
          whatsapp_admin: formatPhoneBR(data.whatsapp_admin.replace('+55', '')),
          valor_avulso: data.valor_avulso_centavos != null ? (data.valor_avulso_centavos / 100).toFixed(2) : '',
          chave_pix: data.chave_pix ?? '',
          recados: data.recados ?? '',
          ativo: data.ativo,
        })
      }
      setCarregado(true)
    })()
  }, [editando, timeId])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function validar(): string | null {
    if (!form.nome.trim()) return 'Informe o nome do time.'
    if (!form.local.trim()) return 'Informe o local do jogo.'
    if (form.minimo_jogadores <= 0) return 'O mínimo de jogadores precisa ser maior que zero.'
    if (form.minimo_jogadores > form.maximo_jogadores) return 'O mínimo não pode ser maior que o máximo.'
    if (form.maximo_goleiros > form.maximo_jogadores) return 'O máximo de goleiros não pode superar o máximo total.'
    if (form.whatsapp_admin.replace(/\D/g, '').length < 10) return 'Informe um WhatsApp válido com DDD.'
    if (form.horas_prazo_confirmacao_mensalista < form.horas_limite_confirmacao) {
      return 'O prazo do mensalista precisa ser igual ou anterior ao horário limite geral (mais horas de antecedência).'
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')

    const erroValidacao = validar()
    if (erroValidacao) return setErro(erroValidacao)

    if (!editando && timesAtuais && limiteAtingido(clube!.plano, timesAtuais.filter((t) => t.ativo).length)) {
      return setErro('Você atingiu o limite de times do seu plano. Faça upgrade para continuar.')
    }

    setSalvando(true)
    try {
      const payload = {
        clube_id: clube!.id,
        nome: form.nome,
        dia_semana: form.dia_semana,
        horario_inicio: form.horario_inicio,
        horario_fim: form.horario_fim,
        local: form.local,
        minimo_jogadores: form.minimo_jogadores,
        maximo_jogadores: form.maximo_jogadores,
        maximo_goleiros: form.maximo_goleiros,
        maximo_espera: form.maximo_espera,
        horas_limite_confirmacao: form.horas_limite_confirmacao,
        horas_prazo_confirmacao_mensalista: form.horas_prazo_confirmacao_mensalista,
        janela_furos_semanas: form.janela_furos_semanas,
        whatsapp_admin: normalizePhoneBR(form.whatsapp_admin),
        valor_avulso_centavos: form.valor_avulso ? Math.round(parseFloat(form.valor_avulso.replace(',', '.')) * 100) : null,
        chave_pix: form.chave_pix || null,
        recados: form.recados || null,
        ativo: form.ativo,
      }

      if (editando) {
        const { error } = await supabase.from('times').update(payload).eq('id', timeId)
        if (error) throw error
      } else {
        const { data: novoTime, error } = await supabase.from('times').insert(payload).select().single()
        if (error) throw error
        await supabase.rpc('gerar_proximo_jogo', { p_time_id: novoTime.id })
      }

      queryClient.invalidateQueries({ queryKey: ['times', clube!.id] })
      navigate('/admin/times')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar o time.')
    } finally {
      setSalvando(false)
    }
  }

  async function handleExcluir() {
    if (!timeId) return
    if (!confirm('Tem certeza? Isso vai remover o time e o histórico de jogos vinculados.')) return
    setSalvando(true)
    try {
      const { error } = await supabase.from('times').delete().eq('id', timeId)
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['times', clube!.id] })
      navigate('/admin/times')
    } catch {
      setErro('Não foi possível excluir. Tente novamente.')
      setSalvando(false)
    }
  }

  if (!carregado) return <Spinner />

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">{editando ? 'Editar time' : 'Novo time'}</h1>
        {editando && (
          <button onClick={handleExcluir} className="p-2 text-danger tap-shrink" aria-label="Excluir time">
            <Trash2 size={18} />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {erro && <ErrorBanner message={erro} />}

        <Card className="space-y-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">Informações do jogo</p>
          <Input label="Nome do time" required value={form.nome} onChange={(e) => set('nome', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Dia da semana" value={form.dia_semana} onChange={(e) => set('dia_semana', Number(e.target.value))}>
              {DIAS.map((d) => (
                <option key={d} value={d} className="capitalize">
                  {diaSemanaLabel(d)}
                </option>
              ))}
            </Select>
            <Input
              label="Local"
              required
              value={form.local}
              onChange={(e) => set('local', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Horário de início" type="time" required value={form.horario_inicio} onChange={(e) => set('horario_inicio', e.target.value)} />
            <Input label="Horário de fim" type="time" required value={form.horario_fim} onChange={(e) => set('horario_fim', e.target.value)} />
          </div>
        </Card>

        <Card className="space-y-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">Vagas</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Mínimo de jogadores" type="number" required value={form.minimo_jogadores} onChange={(e) => set('minimo_jogadores', Number(e.target.value))} />
            <Input label="Máximo de jogadores" type="number" required value={form.maximo_jogadores} onChange={(e) => set('maximo_jogadores', Number(e.target.value))} />
            <Input label="Máximo de goleiros" type="number" required value={form.maximo_goleiros} onChange={(e) => set('maximo_goleiros', Number(e.target.value))} />
            <Input label="Máximo na espera" type="number" required value={form.maximo_espera} onChange={(e) => set('maximo_espera', Number(e.target.value))} />
          </div>
        </Card>

        <Card className="space-y-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">Prazos de confirmação</p>
          <Input
            label="Horário limite geral (horas antes do jogo)"
            type="number"
            step="0.5"
            required
            value={form.horas_limite_confirmacao}
            onChange={(e) => set('horas_limite_confirmacao', Number(e.target.value))}
            hint="Depois desse prazo, ninguém mais confirma."
          />
          <Input
            label="Prazo de confirmação do mensalista (horas antes do jogo)"
            type="number"
            step="0.5"
            required
            value={form.horas_prazo_confirmacao_mensalista}
            onChange={(e) => set('horas_prazo_confirmacao_mensalista', Number(e.target.value))}
            hint="Precisa ser igual ou maior que o horário limite geral. Depois desse prazo, a vaga do mensalista que não respondeu é liberada automaticamente."
          />
          <Input
            label="Janela de furos recentes (semanas)"
            type="number"
            required
            value={form.janela_furos_semanas}
            onChange={(e) => set('janela_furos_semanas', Number(e.target.value))}
            hint="Período considerado no contador de furos do mensalista."
          />
        </Card>

        <Card className="space-y-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">Contato e pagamento</p>
          <Input
            label="WhatsApp do administrador"
            required
            value={form.whatsapp_admin}
            onChange={(e) => set('whatsapp_admin', formatPhoneBR(e.target.value))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Valor do avulso (R$)"
              inputMode="decimal"
              value={form.valor_avulso}
              onChange={(e) => set('valor_avulso', e.target.value)}
              placeholder="20,00"
            />
            <Input label="Chave Pix" value={form.chave_pix} onChange={(e) => set('chave_pix', e.target.value)} />
          </div>
          {form.whatsapp_admin && (
            <a
              href={waLink(normalizePhoneBR(form.whatsapp_admin), 'Teste de link do FOOTER')}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-lime hover:underline"
            >
              testar link do WhatsApp
            </a>
          )}
        </Card>

        <Card className="space-y-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">Recados e situação</p>
          <Textarea label="Recados" value={form.recados} onChange={(e) => set('recados', e.target.value)} placeholder="Ex: trazer colete, chuteira de society..." />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.ativo} onChange={(e) => set('ativo', e.target.checked)} className="h-4 w-4 accent-[#caff3b]" />
            Time ativo (gera novas listas automaticamente)
          </label>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" loading={salvando} className="flex-1">
            Salvar
          </Button>
          <Link to="/admin/times" className="flex-1">
            <Button type="button" variant="secondary" className="w-full">
              Cancelar
            </Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
