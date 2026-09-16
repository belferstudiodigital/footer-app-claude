import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Select } from '../../components/ui/Input'
import { Spinner, EmptyState, ErrorBanner } from '../../components/ui/Feedback'
import { PLANOS } from '../../lib/planos'
import type { Clube, SituacaoClube } from '../../types/database'

const SITUACOES: SituacaoClube[] = ['pendente', 'ativo', 'suspenso', 'cancelado', 'inadimplente']
const TONE: Record<SituacaoClube, 'muted' | 'success' | 'warning' | 'danger'> = {
  pendente: 'muted',
  ativo: 'success',
  suspenso: 'warning',
  cancelado: 'danger',
  inadimplente: 'danger',
}

export default function Usuarios() {
  const queryClient = useQueryClient()
  const [erro, setErro] = useState('')

  const { data: clubes, isLoading } = useQuery({
    queryKey: ['superadmin-clubes'],
    queryFn: async () => {
      const { data } = await supabase.from('clubes').select('*').order('created_at', { ascending: false })
      return (data ?? []) as Clube[]
    },
  })

  async function alterarSituacao(clube: Clube, situacao: SituacaoClube) {
    setErro('')
    const { error } = await supabase.from('clubes').update({ situacao }).eq('id', clube.id)
    if (error) setErro('Não foi possível atualizar.')
    else queryClient.invalidateQueries({ queryKey: ['superadmin-clubes'] })
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">Usuários / Clubes</h1>
      {erro && <ErrorBanner message={erro} />}
      {isLoading ? (
        <Spinner />
      ) : !clubes || clubes.length === 0 ? (
        <EmptyState title="Nenhum clube cadastrado" />
      ) : (
        <div className="space-y-2">
          {clubes.map((c) => (
            <Card key={c.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-display text-lg">{c.nome_clube}</p>
                  <p className="text-sm text-text-muted normal-case">{c.nome_responsavel} · {c.email}</p>
                  {c.plano && <p className="text-xs text-text-muted normal-case">{PLANOS[c.plano].nome}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={TONE[c.situacao]}>{c.situacao}</Badge>
                  <Select value={c.situacao} onChange={(e) => alterarSituacao(c, e.target.value as SituacaoClube)} className="w-36 h-9 text-xs">
                    {SITUACOES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
