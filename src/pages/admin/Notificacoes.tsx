import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellRing, Send, CheckCircle2, XCircle, HelpCircle } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { usePush } from '../../hooks/usePush'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Spinner, EmptyState, ErrorBanner } from '../../components/ui/Feedback'
import { formatDataPorExtenso, formatHora, formatDataHoraCurta } from '../../lib/formatters'
import { waLink, cn } from '../../lib/utils'
import type { Notificacao } from '../../types/database'

export default function Notificacoes() {
  const { clube } = useAuth()
  const queryClient = useQueryClient()
  const push = usePush()
  const [timeId, setTimeId] = useState<string | null>(null)
  const [jogoId, setJogoId] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)

  const { data: times } = useQuery({
    queryKey: ['times', clube?.id],
    enabled: Boolean(clube),
    queryFn: async () => {
      const { data } = await supabase.from('times').select('*').eq('clube_id', clube!.id).order('nome')
      if (data && data.length > 0 && !timeId) setTimeId(data[0].id)
      return data ?? []
    },
  })

  const { data: jogos } = useQuery({
    queryKey: ['jogos-time-notif', timeId],
    enabled: Boolean(timeId),
    queryFn: async () => {
      const { data } = await supabase.from('jogos').select('*').eq('time_id', timeId).order('data_jogo', { ascending: false }).limit(6)
      if (data && data.length > 0 && !jogoId) setJogoId(data[0].id)
      return data ?? []
    },
  })

  const { data: historico, isLoading } = useQuery({
    queryKey: ['notificacoes', clube?.id],
    enabled: Boolean(clube),
    queryFn: async () => {
      const { data } = await supabase.from('notificacoes').select('*').eq('clube_id', clube!.id).order('created_at', { ascending: false }).limit(30)
      return (data ?? []) as Notificacao[]
    },
  })

  const timeAtual = times?.find((t) => t.id === timeId)
  const jogoAtual = jogos?.find((j) => j.id === jogoId)

  async function gerarEEnviarAviso() {
    if (!timeAtual || !jogoAtual || !clube) return
    setGerando(true)
    try {
      const { data: mensalistas } = await supabase.from('mensalistas').select('nome, contador_furos_recentes').eq('time_id', timeId).eq('ativo', true)
      const emRisco = (mensalistas ?? []).filter((m) => m.contador_furos_recentes > 0)

      const link = `${window.location.origin}/jogo/${jogoAtual.id}`
      const dataFmt = formatDataPorExtenso(jogoAtual.data_jogo)
        .split(',')
        .map((s) => s.trim())
      const dataCurta = new Date(`${jogoAtual.data_jogo}T00:00:00`).toLocaleDateString('pt-BR')

      let texto = `*FOOTER — ${timeAtual.nome}*\n\n`
      texto += `E aí, atletas! Clique e confirme sua presença no próximo racha, antes que acabem as vagas.\n\n`
      texto += `📅 Data: ${dataCurta} (${dataFmt[0]})\n`
      texto += `🕐 Horário: das ${formatHora(jogoAtual.horario_inicio)} às ${formatHora(jogoAtual.horario_fim)}\n`
      texto += `📍 Local: ${jogoAtual.local}\n\n`
      texto += `${link}\n`

      const recadosPersonalizados = (jogoAtual.recados || timeAtual.recados || '').trim()
      texto += `\n⚠️ *RECADOS IMPORTANTES:*\n\n`
      texto += `ATENÇÃO MENSALISTA, REMOVER seu nome da lista caso não for comparecer nesse jogo!\n\n`
      texto += `• ATLETA, confirmou seu nome na lista? Significa que contaremos com você em nossa pelada, NÃO DESFALQUE o time para não prejudicar todos que irão comparecer.\n`
      if (recadosPersonalizados) {
        texto += `• ${recadosPersonalizados}\n`
      }

      if (emRisco.length > 0) {
        texto += `\n⚠️ Mensalistas com furo recente, fiquem espertos e confirmem ou avisem a tempo:\n`
        texto += emRisco.map((m) => `- ${m.nome} (${m.contador_furos_recentes} furo${m.contador_furos_recentes > 1 ? 's' : ''})`).join('\n')
        texto += `\n`
      }

      if (timeAtual.valor_avulso_centavos != null || timeAtual.chave_pix) {
        texto += `\nPara os atletas avulsos, segue valor e Chave Pix:\n`
        if (timeAtual.valor_avulso_centavos != null) {
          texto += `Valor: ${(timeAtual.valor_avulso_centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n`
        }
        if (timeAtual.chave_pix) {
          texto += `Chave Pix: ${timeAtual.chave_pix}\n`
        }
      }

      const ciclo = `${jogoAtual.id}:aviso_semanal:${new Date().toISOString().slice(0, 10)}`
      const { error } = await supabase.from('notificacoes').insert({
        clube_id: clube.id,
        time_id: timeId,
        jogo_id: jogoAtual.id,
        tipo: emRisco.length > 0 ? 'aviso_semanal_mensalistas_risco' : 'abertura_lista',
        ciclo,
        situacao: 'sucesso',
        destinatarios: [],
        mensagem: texto,
      })
      if (error && !error.message.includes('duplicate')) throw error

      window.open(waLink(timeAtual.whatsapp_admin, texto), '_blank')
      queryClient.invalidateQueries({ queryKey: ['notificacoes', clube.id] })
    } catch {
      // silencioso — já mostramos o link do WhatsApp de qualquer forma
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">Notificações</h1>

      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-lime/15 text-lime">
            {push.permissao === 'granted' ? <BellRing size={18} /> : <Bell size={18} />}
          </div>
          <div className="flex-1">
            <p className="font-medium">Notificações push</p>
            <p className="text-xs text-text-muted normal-case">
              {!push.suportado
                ? 'Não suportado neste navegador.'
                : push.permissao === 'granted'
                ? 'Ativadas neste dispositivo.'
                : 'Ative para receber avisos direto no celular.'}
            </p>
          </div>
          {push.suportado && push.permissao !== 'granted' && (
            <Button size="sm" onClick={push.ativar} loading={push.carregando}>
              Ativar
            </Button>
          )}
        </div>
        {push.erro && <ErrorBanner message={push.erro} />}
      </Card>

      <Card className="space-y-3">
        <p className="text-xs uppercase tracking-wide text-text-muted">Gerar aviso semanal</p>
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
          {times?.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTimeId(t.id)
                setJogoId(null)
              }}
              className={cn('shrink-0 rounded-full px-4 py-2 text-sm font-medium', timeId === t.id ? 'bg-lime text-black' : 'bg-surface-2 text-text-muted border border-border')}
            >
              {t.nome}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
          {jogos?.map((j) => (
            <button
              key={j.id}
              onClick={() => setJogoId(j.id)}
              className={cn('shrink-0 rounded-xl px-3 py-2 text-xs font-medium capitalize whitespace-nowrap', jogoId === j.id ? 'bg-lime/15 text-lime border border-lime/40' : 'bg-surface-2 text-text-muted border border-border')}
            >
              {formatDataPorExtenso(j.data_jogo).split(',')[1]}
            </button>
          ))}
        </div>
        <Button onClick={gerarEEnviarAviso} loading={gerando} disabled={!jogoAtual}>
          <Send size={16} /> Gerar mensagem e abrir WhatsApp
        </Button>
        <p className="text-xs text-text-muted">
          A mensagem inclui automaticamente os mensalistas com furo recente, só quando houver algum.
        </p>
      </Card>

      <div>
        <h2 className="font-display text-lg mb-2">Histórico</h2>
        {isLoading ? (
          <Spinner />
        ) : !historico || historico.length === 0 ? (
          <EmptyState title="Nenhum envio ainda" />
        ) : (
          <div className="space-y-2">
            {historico.map((n) => (
              <Card key={n.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{TIPO_LABEL[n.tipo] ?? n.tipo}</p>
                    <p className="text-xs text-text-muted normal-case">{formatDataHoraCurta(n.created_at)}</p>
                  </div>
                  <StatusIcone situacao={n.situacao} />
                </div>
                {n.erro && <p className="mt-1 text-xs text-danger normal-case">{n.erro}</p>}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const TIPO_LABEL: Record<string, string> = {
  abertura_lista: 'Abertura da lista',
  lembrete_semanal: 'Lembrete semanal',
  minimo_atingido: 'Mínimo atingido',
  maximo_atingido: 'Máximo atingido',
  sem_minimo: 'Cancelado sem mínimo',
  vaga_liberada: 'Vaga liberada',
  aviso_semanal_mensalistas_risco: 'Aviso semanal (mensalistas em risco)',
}

function StatusIcone({ situacao }: { situacao: Notificacao['situacao'] }) {
  if (situacao === 'sucesso') return <Badge tone="success"><CheckCircle2 size={12} className="mr-1" />Enviado</Badge>
  if (situacao === 'falha') return <Badge tone="danger"><XCircle size={12} className="mr-1" />Falha</Badge>
  return <Badge tone="muted"><HelpCircle size={12} className="mr-1" />Sem dispositivo</Badge>
}
