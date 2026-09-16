// Edge Function: lembrete-semanal
//
// Disparada periodicamente (via pg_cron + pg_net, ver migration 0005) para checar
// se algum time tem "aviso semanal" configurado (times.dia_aviso_semanal /
// times.horario_aviso_semanal) para o dia e horário atuais (fuso America/Sao_Paulo).
// Quando encontra, envia uma notificação push (Web Push / VAPID) para os dispositivos
// do admin daquele clube, lembrando de enviar o link da lista no grupo do WhatsApp.
//
// Variáveis de ambiente necessárias (Dashboard do Supabase → Edge Functions →
// lembrete-semanal → Secrets, ou via `supabase secrets set`):
//   SUPABASE_URL               (já disponível automaticamente)
//   SUPABASE_SERVICE_ROLE_KEY  (já disponível automaticamente)
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   APP_URL                    (ex: https://footer-projeto.vercel.app)

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://footer-projeto.vercel.app'
const TIMEZONE = 'America/Sao_Paulo'

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:footeroficial@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

function horaAtualSaoPaulo(): { diaSemana: number; hhmm: string } {
  const agora = new Date()
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const mapa: Record<string, string> = {}
  for (const parte of fmt.formatToParts(agora)) mapa[parte.type] = parte.value
  const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const hora = mapa.hour === '24' ? '00' : mapa.hour
  return { diaSemana: DIAS[mapa.weekday], hhmm: `${hora}:${mapa.minute}` }
}

function formatarErroWebPush(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { statusCode?: number; body?: string; message?: string; endpoint?: string }
    const partes = [e.message ?? String(err)]
    if (e.statusCode) partes.push(`status=${e.statusCode}`)
    if (e.body) partes.push(`body=${e.body}`)
    if (e.endpoint) partes.push(`endpoint=${e.endpoint.slice(0, 60)}...`)
    return partes.join(' | ').slice(0, 500)
  }
  return String(err).slice(0, 500)
}

// Arredonda hh:mm para o bloco de 15 minutos mais próximo (para casar com a
// frequência do agendamento em cron.schedule, ver migration 0005).
function arredondarBloco15(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const bloco = Math.round(m / 15) * 15
  const horaFinal = bloco === 60 ? (h + 1) % 24 : h
  const minFinal = bloco === 60 ? 0 : bloco
  return `${String(horaFinal).padStart(2, '0')}:${String(minFinal).padStart(2, '0')}`
}

Deno.serve(async () => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response(JSON.stringify({ erro: 'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { diaSemana, hhmm } = horaAtualSaoPaulo()
  const blocoAtual = arredondarBloco15(hhmm)
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE }) // YYYY-MM-DD

  const { data: times, error } = await supabase
    .from('times')
    .select('id, clube_id, nome, dia_aviso_semanal, horario_aviso_semanal, ativo')
    .eq('ativo', true)
    .eq('dia_aviso_semanal', diaSemana)
    .not('horario_aviso_semanal', 'is', null)

  if (error) {
    return new Response(JSON.stringify({ erro: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  const candidatos = (times ?? []).filter((t) => {
    const alvo = arredondarBloco15((t.horario_aviso_semanal as string).slice(0, 5))
    return alvo === blocoAtual
  })

  const resultados: Record<string, string> = {}

  for (const time of candidatos) {
    const ciclo = `${time.id}:lembrete_semanal:${hoje}`

    const { data: existente } = await supabase
      .from('notificacoes')
      .select('id')
      .eq('clube_id', time.clube_id)
      .eq('ciclo', ciclo)
      .maybeSingle()
    if (existente) {
      resultados[time.id] = 'ja_enviado'
      continue
    }

    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('endpoint, p256dh, auth')
      .eq('clube_id', time.clube_id)

    const payload = JSON.stringify({
      title: '🔔 Hora de enviar a lista!',
      body: `${time.nome}: envie o link da lista no grupo do WhatsApp.`,
      url: `${APP_URL}/admin/notificacoes`,
    })

    let situacao: 'sucesso' | 'falha' | 'sem_dispositivo' = 'sem_dispositivo'
    let erroMsg: string | null = null

    if (tokens && tokens.length > 0) {
      const envios = await Promise.allSettled(
        tokens.map((t) =>
          webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload)
        )
      )
      const algumSucesso = envios.some((r) => r.status === 'fulfilled')
      situacao = algumSucesso ? 'sucesso' : 'falha'
      if (!algumSucesso) {
        const falha = envios.find((r): r is PromiseRejectedResult => r.status === 'rejected')
        erroMsg = falha ? formatarErroWebPush(falha.reason) : 'Falha desconhecida ao enviar push.'
      }
    }

    await supabase.from('notificacoes').insert({
      clube_id: time.clube_id,
      time_id: time.id,
      tipo: 'lembrete_semanal',
      ciclo,
      situacao,
      erro: erroMsg,
      destinatarios: (tokens ?? []).map((t) => t.endpoint),
      mensagem: payload,
    })

    resultados[time.id] = situacao
  }

  return new Response(JSON.stringify({ ok: true, processados: candidatos.length, resultados }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
