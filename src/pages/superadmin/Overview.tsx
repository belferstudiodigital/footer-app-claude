import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui/Card'
import { Spinner } from '../../components/ui/Feedback'

export default function Overview() {
  const { data, isLoading } = useQuery({
    queryKey: ['superadmin-overview'],
    queryFn: async () => {
      const [clubes, times, jogos, confirmacoes] = await Promise.all([
        supabase.from('clubes').select('id', { count: 'exact', head: true }),
        supabase.from('times').select('id', { count: 'exact', head: true }),
        supabase.from('jogos').select('id', { count: 'exact', head: true }),
        supabase.from('confirmacoes').select('id', { count: 'exact', head: true }),
      ])
      return {
        clubes: clubes.count ?? 0,
        times: times.count ?? 0,
        jogos: jogos.count ?? 0,
        confirmacoes: confirmacoes.count ?? 0,
      }
    },
  })

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">Visão geral</h1>
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metrica label="Clubes" valor={data?.clubes ?? 0} />
          <Metrica label="Times" valor={data?.times ?? 0} />
          <Metrica label="Jogos" valor={data?.jogos ?? 0} />
          <Metrica label="Confirmações" valor={data?.confirmacoes ?? 0} />
        </div>
      )}
    </div>
  )
}

function Metrica({ label, valor }: { label: string; valor: number }) {
  return (
    <Card>
      <p className="font-display text-3xl text-lime">{valor}</p>
      <p className="text-sm text-text-muted normal-case">{label}</p>
    </Card>
  )
}
