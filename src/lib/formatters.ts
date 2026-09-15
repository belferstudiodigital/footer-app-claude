const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** "2026-09-20" -> "domingo, 20 de setembro" */
export function formatDataPorExtenso(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const data = new Date(ano, mes - 1, dia)
  return `${DIAS_SEMANA[data.getDay()]}, ${dia} de ${MESES[mes - 1]}`
}

/** "19:30:00" -> "19h30" */
export function formatHora(horaISO: string): string {
  const [h, m] = horaISO.split(':')
  return m === '00' ? `${h}h` : `${h}h${m}`
}

export function diaSemanaLabel(dia: number): string {
  return DIAS_SEMANA[dia]
}

export function formatDataHoraCurta(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function tempoRestante(prazoISO: string): string | null {
  const diff = new Date(prazoISO).getTime() - Date.now()
  if (diff <= 0) return null
  const horas = Math.floor(diff / 3_600_000)
  const dias = Math.floor(horas / 24)
  if (dias >= 1) return `${dias} dia${dias > 1 ? 's' : ''}`
  const min = Math.floor((diff % 3_600_000) / 60_000)
  if (horas >= 1) return `${horas}h${min > 0 ? ` ${min}min` : ''}`
  return `${min} min`
}
