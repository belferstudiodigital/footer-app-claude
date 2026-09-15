// Motor de geração de imagem compartilhável 9:16 (canvas), reaproveitado
// pelo Ranking (compartilhamento de craque) e pelo Resumo Pós-Jogo.

const LARGURA = 1080
const ALTURA = 1920
const COR_FUNDO = '#080808'
const COR_LIME = '#caff3b'
const COR_TEXTO = '#f0f0eb'
const COR_MUTED = '#a3a39c'

function carregarFonteBebas() {
  return new FontFace('Bebas Neue', 'local("Bebas Neue")').load().catch(() => null)
}

async function garantirFontes() {
  try {
    await Promise.all([
      document.fonts.load('700 80px "Bebas Neue"'),
      document.fonts.load('400 32px "DM Sans"'),
      document.fonts.load('600 32px "DM Sans"'),
    ])
  } catch {
    await carregarFonteBebas()
  }
}

interface DesenhoBase {
  ctx: CanvasRenderingContext2D
  y: number
}

function desenharFundo(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = COR_FUNDO
  ctx.fillRect(0, 0, LARGURA, ALTURA)
  const gradiente = ctx.createRadialGradient(LARGURA / 2, 260, 40, LARGURA / 2, 260, 900)
  gradiente.addColorStop(0, 'rgba(202,255,59,0.14)')
  gradiente.addColorStop(1, 'rgba(202,255,59,0)')
  ctx.fillStyle = gradiente
  ctx.fillRect(0, 0, LARGURA, ALTURA)
}

function desenharMarca(ctx: CanvasRenderingContext2D, y: number) {
  ctx.textAlign = 'center'
  ctx.fillStyle = COR_LIME
  ctx.font = '700 64px "Bebas Neue", sans-serif'
  ctx.fillText('FOOTER', LARGURA / 2, y)
  return y + 40
}

function quebrarLinhas(ctx: CanvasRenderingContext2D, texto: string, maxLargura: number): string[] {
  const palavras = texto.split(' ')
  const linhas: string[] = []
  let atual = ''
  for (const palavra of palavras) {
    const teste = atual ? `${atual} ${palavra}` : palavra
    if (ctx.measureText(teste).width > maxLargura && atual) {
      linhas.push(atual)
      atual = palavra
    } else {
      atual = teste
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}

export interface RankingCardData {
  tipo: 'ranking'
  nomeJogador: string
  nomeTime: string
  medalhas: { nome: string; nivel: string }[]
  sequenciaAtual: number
  totalConfirmacoes: number
}

export interface ResumoPosJogoData {
  tipo: 'resumo-pos-jogo'
  nomeTime: string
  dataJogo: string
  furos: string[]
  pendencias: string[]
  chavePix: string | null
}

export async function gerarCardImagem(dados: RankingCardData | ResumoPosJogoData): Promise<Blob> {
  await garantirFontes()

  const canvas = document.createElement('canvas')
  canvas.width = LARGURA
  canvas.height = ALTURA
  const ctx = canvas.getContext('2d')!

  desenharFundo(ctx)
  let y = 140
  y = desenharMarca(ctx, y)

  ctx.textAlign = 'center'
  ctx.fillStyle = COR_MUTED
  ctx.font = '400 34px "DM Sans", sans-serif'
  ctx.fillText(dados.nomeTime.toUpperCase(), LARGURA / 2, y + 40)
  y += 130

  if (dados.tipo === 'ranking') {
    ctx.fillStyle = COR_TEXTO
    ctx.font = '700 90px "Bebas Neue", sans-serif'
    const linhasNome = quebrarLinhas(ctx, dados.nomeJogador.toUpperCase(), LARGURA - 160)
    for (const linha of linhasNome) {
      ctx.fillText(linha, LARGURA / 2, y)
      y += 96
    }
    y += 40

    ctx.font = '600 40px "DM Sans", sans-serif'
    ctx.fillStyle = COR_LIME
    ctx.fillText(`${dados.totalConfirmacoes} jogos · sequência de ${dados.sequenciaAtual}`, LARGURA / 2, y)
    y += 100

    const porNivel: Record<string, string[]> = {}
    for (const m of dados.medalhas) {
      porNivel[m.nivel] ??= []
      porNivel[m.nivel].push(m.nome)
    }

    for (const [nivel, nomes] of Object.entries(porNivel)) {
      ctx.font = '700 36px "Bebas Neue", sans-serif'
      ctx.fillStyle = COR_LIME
      ctx.fillText(nivel.toUpperCase(), LARGURA / 2, y)
      y += 56
      ctx.font = '400 32px "DM Sans", sans-serif'
      ctx.fillStyle = COR_TEXTO
      for (const nome of nomes) {
        ctx.fillText(nome, LARGURA / 2, y)
        y += 50
      }
      y += 30
    }
  } else {
    ctx.fillStyle = COR_TEXTO
    ctx.font = '700 70px "Bebas Neue", sans-serif'
    ctx.fillText('RESUMO PÓS-JOGO', LARGURA / 2, y)
    y += 50
    ctx.font = '400 30px "DM Sans", sans-serif'
    ctx.fillStyle = COR_MUTED
    ctx.fillText(dados.dataJogo, LARGURA / 2, y)
    y += 100

    y = desenharBloco(ctx, y, 'Furos', dados.furos, '⚠️')
    y = desenharBloco(ctx, y, 'Pendências', dados.pendencias, '💰')

    if (dados.chavePix) {
      y += 40
      ctx.font = '600 34px "DM Sans", sans-serif'
      ctx.fillStyle = COR_LIME
      ctx.fillText('Pix:', LARGURA / 2, y)
      y += 44
      ctx.font = '400 32px "DM Sans", sans-serif'
      ctx.fillStyle = COR_TEXTO
      ctx.fillText(dados.chavePix, LARGURA / 2, y)
    }
  }

  ctx.textAlign = 'center'
  ctx.font = '400 28px "DM Sans", sans-serif'
  ctx.fillStyle = COR_MUTED
  ctx.fillText('FOOTER · Organize sua pelada. Sem bagunça.', LARGURA / 2, ALTURA - 80)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('falha ao gerar imagem'))), 'image/png')
  })
}

function desenharBloco(ctx: CanvasRenderingContext2D, yInicial: number, titulo: string, nomes: string[], emoji: string) {
  let y = yInicial
  ctx.textAlign = 'center'
  ctx.font = '700 44px "Bebas Neue", sans-serif'
  ctx.fillStyle = COR_LIME
  ctx.fillText(`${emoji} ${titulo.toUpperCase()}`, LARGURA / 2, y)
  y += 60

  ctx.font = '400 32px "DM Sans", sans-serif'
  ctx.fillStyle = COR_TEXTO
  if (nomes.length === 0) {
    ctx.fillStyle = COR_MUTED
    ctx.fillText('Nenhum', LARGURA / 2, y)
    y += 50
  } else {
    for (const nome of nomes) {
      ctx.fillText(nome, LARGURA / 2, y)
      y += 48
    }
  }
  return y + 60
}

export async function compartilharOuBaixarImagem(blob: Blob, nomeArquivo: string) {
  const file = new File([blob], nomeArquivo, { type: 'image/png' })
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'FOOTER' })
      return
    } catch {
      // usuário cancelou o share nativo — cai para download
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  a.click()
  URL.revokeObjectURL(url)
}
