import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Confirmacao, Jogo, Mensalista, PagamentoStatusPublico, Time } from '../types/database'

export interface JogoPublicoData {
  jogo: Jogo
  time: Time
  confirmacoes: Confirmacao[]
  mensalistas: Mensalista[]
  pagamentos: PagamentoStatusPublico[]
}

export function useJogoPublico(jogoId: string | undefined) {
  return useQuery({
    queryKey: ['jogo-publico', jogoId],
    enabled: Boolean(jogoId),
    refetchInterval: 6_000,
    queryFn: async (): Promise<JogoPublicoData> => {
      const { data: jogo, error: jogoErr } = await supabase.from('jogos').select('*').eq('id', jogoId).single()
      if (jogoErr) throw jogoErr

      const { data: time, error: timeErr } = await supabase.from('times').select('*').eq('id', jogo.time_id).single()
      if (timeErr) throw timeErr

      const { data: confirmacoes, error: confErr } = await supabase
        .from('confirmacoes')
        .select('*')
        .eq('jogo_id', jogoId)
        .order('ordem_entrada', { ascending: true })
      if (confErr) throw confErr

      const { data: mensalistas, error: mensErr } = await supabase
        .from('mensalistas')
        .select('*')
        .eq('time_id', jogo.time_id)
        .eq('ativo', true)
      if (mensErr) throw mensErr

      const referenciaMes = jogo.data_jogo.slice(0, 7) + '-01'
      const { data: pagAvulso } = await supabase
        .from('pagamentos_status_publico')
        .select('*')
        .eq('jogo_id', jogoId)
        .eq('tipo', 'avulso')
      const { data: pagMensal } = await supabase
        .from('pagamentos_status_publico')
        .select('*')
        .eq('time_id', jogo.time_id)
        .eq('tipo', 'mensal')
        .eq('referencia_mes', referenciaMes)

      return {
        jogo,
        time,
        confirmacoes: confirmacoes ?? [],
        mensalistas: mensalistas ?? [],
        pagamentos: [...(pagAvulso ?? []), ...(pagMensal ?? [])],
      }
    },
  })
}
