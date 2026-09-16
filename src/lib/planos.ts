import type { PlanoClube } from '../types/database'

export const PLANOS: Record<PlanoClube, { nome: string; precoCentavos: number; limiteTimes: number | null; descricao: string }> = {
  standard: { nome: 'STANDARD', precoCentavos: 1990, limiteTimes: 1, descricao: '1 time ativo' },
  pro: { nome: 'PRO', precoCentavos: 3990, limiteTimes: 3, descricao: 'até 3 times ativos' },
  ultra: { nome: 'ULTRA', precoCentavos: 5990, limiteTimes: null, descricao: 'times ilimitados' },
}

export function planoQueResolve(timesAtuais: number): PlanoClube {
  if (timesAtuais < 1) return 'standard'
  if (timesAtuais < 3) return 'pro'
  return 'ultra'
}

export function limiteAtingido(plano: PlanoClube | null, timesAtivos: number): boolean {
  if (!plano) return true
  const limite = PLANOS[plano].limiteTimes
  if (limite === null) return false
  return timesAtivos >= limite
}
