import type { Confirmacao } from '../types/database'

export type MedalhaId = 'joga_de_terno' | 'fominha' | 'vip' | 'primeiro_pelotao' | 'dono_do_var' | 'paredao' | 'salva_vidas'
export type NivelMedalha = 'bronze' | 'prata' | 'ouro' | 'lendario' | null

export const MEDALHAS: Record<MedalhaId, { nome: string; descricao: string; niveis: number[] }> = {
  joga_de_terno: { nome: 'Joga de Terno', descricao: 'Total de confirmações', niveis: [3, 8, 15, 25] },
  fominha: { nome: 'Fominha', descricao: 'Presenças nos últimos 5 jogos', niveis: [2, 3, 4, 5] },
  vip: { nome: 'VIP', descricao: 'Maior sequência', niveis: [2, 4, 7, 12] },
  primeiro_pelotao: { nome: 'Primeiro Pelotão', descricao: 'Posição média de confirmação (menor é melhor)', niveis: [8, 5, 3, 2] },
  dono_do_var: { nome: 'Dono do Var', descricao: '% de confirmações em cima da hora', niveis: [20, 40, 60, 80] },
  paredao: { nome: 'Paredão', descricao: 'Jogos como goleiro', niveis: [2, 5, 10, 20] },
  salva_vidas: { nome: 'Salva-Vidas', descricao: 'Entradas pela espera', niveis: [2, 4, 7, 12] },
}

const NIVEL_NOMES: Exclude<NivelMedalha, null>[] = ['bronze', 'prata', 'ouro', 'lendario']

export interface JogadorRanking {
  nome: string
  totalConfirmacoes: number
  presencasUltimos5: number
  sequenciaAtual: number
  maiorSequencia: number
  posicaoMediaConfirmacao: number | null
  percentualEmCimaDaHora: number
  jogosComoGoleiro: number
  entradasPelaEspera: number
  medalhas: Partial<Record<MedalhaId, NivelMedalha>>
  progresso: Partial<Record<MedalhaId, { atual: number; proximo: number | null }>>
}

/**
 * Calcula o ranking a partir do histórico de confirmações de um time.
 * `confirmacoesPorJogoOrdenado` deve vir ordenado do jogo mais antigo para o mais recente,
 * cada item com o jogo (data + horário_limite) e as confirmações daquele jogo.
 */
export function calcularRanking(
  jogos: { id: string; data_jogo: string; horario_limite: string }[],
  confirmacoes: Confirmacao[]
): JogadorRanking[] {
  const porNome = new Map<string, JogadorRanking & { _sequenciaAtualCalc: number; _ultimoJogoIndex: number | null }>()
  const confirmacoesPorJogo = new Map<string, Confirmacao[]>()
  for (const c of confirmacoes) {
    if (!confirmacoesPorJogo.has(c.jogo_id)) confirmacoesPorJogo.set(c.jogo_id, [])
    confirmacoesPorJogo.get(c.jogo_id)!.push(c)
  }

  const ultimos5JogosIds = jogos.slice(-5).map((j) => j.id)

  jogos.forEach((jogo, jogoIndex) => {
    const confsDoJogo = (confirmacoesPorJogo.get(jogo.id) ?? [])
    const confirmados = confsDoJogo.filter((c) => c.status === 'confirmado')
    const totalConfirmadosNoJogo = confirmados.length

    for (const c of confirmados) {
      let j = porNome.get(c.nome)
      if (!j) {
        j = {
          nome: c.nome,
          totalConfirmacoes: 0,
          presencasUltimos5: 0,
          sequenciaAtual: 0,
          maiorSequencia: 0,
          posicaoMediaConfirmacao: null,
          percentualEmCimaDaHora: 0,
          jogosComoGoleiro: 0,
          entradasPelaEspera: 0,
          medalhas: {},
          progresso: {},
          _sequenciaAtualCalc: 0,
          _ultimoJogoIndex: null,
        }
        porNome.set(c.nome, j)
      }

      j.totalConfirmacoes += 1
      if (ultimos5JogosIds.includes(jogo.id)) j.presencasUltimos5 += 1
      if (c.posicao === 'goleiro') j.jogosComoGoleiro += 1
      if (c.origem_liberacao === 'voluntaria' && c.status === 'confirmado') {
        // aproximação: entrou pela espera se não tinha vaga principal ao criar (não rastreado
        // diretamente); usamos o indicador de promoção como proxy quando aplicável.
      }

      // posição de confirmação dentro do jogo (ordem de chegada entre os confirmados)
      const posicaoNoJogo = confirmados.filter((x) => x.ordem_entrada <= c.ordem_entrada).length
      const somaAnterior = (j.posicaoMediaConfirmacao ?? 0) * (j.totalConfirmacoes - 1)
      j.posicaoMediaConfirmacao = (somaAnterior + posicaoNoJogo) / j.totalConfirmacoes

      // "em cima da hora": entre os últimos 30% a confirmar
      const limiar = Math.max(1, Math.ceil(totalConfirmadosNoJogo * 0.3))
      const emCimaDaHora = posicaoNoJogo > totalConfirmadosNoJogo - limiar
      const totalEmCima = j.percentualEmCimaDaHora * (j.totalConfirmacoes - 1)
      j.percentualEmCimaDaHora = (totalEmCima + (emCimaDaHora ? 100 : 0)) / j.totalConfirmacoes

      // sequência
      if (j._ultimoJogoIndex === jogoIndex - 1 || j._ultimoJogoIndex === null) {
        j._sequenciaAtualCalc += 1
      } else {
        j._sequenciaAtualCalc = 1
      }
      j._ultimoJogoIndex = jogoIndex
      j.sequenciaAtual = j._sequenciaAtualCalc
      j.maiorSequencia = Math.max(j.maiorSequencia, j._sequenciaAtualCalc)
    }

    // jogadores que não confirmaram neste jogo perdem a sequência atual
    for (const j of porNome.values()) {
      if (j._ultimoJogoIndex !== jogoIndex) {
        j._sequenciaAtualCalc = 0
        j.sequenciaAtual = 0
      }
    }

    // entradas pela espera (promovidos)
    for (const c of confsDoJogo) {
      if (c.status === 'confirmado' && c.origem_liberacao) {
        const j = porNome.get(c.nome)
        if (j) j.entradasPelaEspera += 1
      }
    }
  })

  const jogadores = [...porNome.values()].map((j) => {
    const { _sequenciaAtualCalc, _ultimoJogoIndex, ...resto } = j
    void _sequenciaAtualCalc
    void _ultimoJogoIndex
    return calcularMedalhas(resto)
  })

  return jogadores.sort((a, b) => b.totalConfirmacoes - a.totalConfirmacoes)
}

function calcularMedalhas(j: JogadorRanking): JogadorRanking {
  if (j.totalConfirmacoes < 3) {
    return j
  }

  const valorPorMedalha: Record<MedalhaId, number> = {
    joga_de_terno: j.totalConfirmacoes,
    fominha: j.presencasUltimos5,
    vip: j.maiorSequencia,
    primeiro_pelotao: j.posicaoMediaConfirmacao ?? 999,
    dono_do_var: j.percentualEmCimaDaHora,
    paredao: j.jogosComoGoleiro,
    salva_vidas: j.entradasPelaEspera,
  }

  for (const id of Object.keys(MEDALHAS) as MedalhaId[]) {
    const niveis = MEDALHAS[id].niveis
    const valor = valorPorMedalha[id]
    const menorMelhor = id === 'primeiro_pelotao'

    let nivelAtingido: NivelMedalha = null
    for (let i = 0; i < niveis.length; i++) {
      const atingiu = menorMelhor ? valor <= niveis[i] : valor >= niveis[i]
      if (atingiu) nivelAtingido = NIVEL_NOMES[i]
    }
    j.medalhas[id] = nivelAtingido

    const indiceAtual = nivelAtingido ? NIVEL_NOMES.indexOf(nivelAtingido) : -1
    const proximoNivel = indiceAtual < niveis.length - 1 ? niveis[indiceAtual + 1] : null
    j.progresso[id] = { atual: valor, proximo: proximoNivel }
  }

  return j
}
