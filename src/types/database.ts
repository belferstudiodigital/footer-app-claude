// Tipos manuais espelhando supabase/migrations/*.sql
// (gere novamente com `supabase gen types typescript` quando o projeto estiver linkado)

export type SituacaoClube = 'pendente' | 'ativo' | 'suspenso' | 'cancelado' | 'inadimplente'
export type PlanoClube = 'standard' | 'pro' | 'ultra'
export type PapelUsuario = 'admin_clube' | 'superadmin'
export type SituacaoJogo = 'aguardando' | 'confirmado' | 'cancelado' | 'auto_cancelado' | 'encerrado'
export type PosicaoJogador = 'linha' | 'goleiro'
export type StatusConfirmacao = 'confirmado' | 'espera' | 'nao_vai' | 'pendente_mensalista' | 'furo'
export type OrigemLiberacaoVaga = 'voluntaria' | 'furo_auto_liberado'
export type TipoPagamento = 'mensal' | 'avulso'
export type StatusPagamento = 'pendente' | 'declarado' | 'pago'
export type TipoFuro = 'automatico' | 'manual'
export type TipoNotificacao =
  | 'abertura_lista'
  | 'lembrete_semanal'
  | 'minimo_atingido'
  | 'maximo_atingido'
  | 'sem_minimo'
  | 'vaga_liberada'
  | 'aviso_semanal_mensalistas_risco'
export type SituacaoNotificacao = 'sucesso' | 'falha' | 'sem_dispositivo'
export type SituacaoFatura = 'pago' | 'pendente' | 'atrasado'

export interface Clube {
  id: string
  nome_responsavel: string
  email: string
  cpf: string
  whatsapp: string
  nome_clube: string
  situacao: SituacaoClube
  plano: PlanoClube | null
  provider_customer_id: string | null
  subscription_id: string | null
  created_at: string
  updated_at: string
}

export interface PapelUsuarioRow {
  id: string
  user_id: string
  clube_id: string | null
  papel: PapelUsuario
  created_at: string
}

export interface Time {
  id: string
  clube_id: string
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
  dia_aviso_semanal: number | null
  horario_aviso_semanal: string | null
  whatsapp_admin: string
  valor_avulso_centavos: number | null
  chave_pix: string | null
  recados: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface Jogo {
  id: string
  time_id: string
  clube_id: string
  data_jogo: string
  horario_inicio: string
  horario_fim: string
  local: string
  situacao: SituacaoJogo
  horario_limite: string
  prazo_confirmacao_mensalista: string
  recados: string | null
  furos_processados: boolean
  auto_cancelamento_avaliado: boolean
  created_at: string
  updated_at: string
}

export interface Mensalista {
  id: string
  clube_id: string
  time_id: string
  nome: string
  nome_normalizado: string
  posicao_padrao: PosicaoJogador
  ativo: boolean
  contador_furos_recentes: number
  sequencia_confirmacoes: number
  created_at: string
  updated_at: string
}

export interface Confirmacao {
  id: string
  jogo_id: string
  clube_id: string
  mensalista_id: string | null
  nome: string
  nome_normalizado: string
  posicao: PosicaoJogador
  status: StatusConfirmacao
  vaga_principal: boolean
  origem_liberacao: OrigemLiberacaoVaga | null
  ordem_entrada: number
  created_at: string
  updated_at: string
}

export interface FuroMensalista {
  id: string
  mensalista_id: string
  jogo_id: string | null
  clube_id: string
  tipo: TipoFuro
  created_at: string
}

export interface Pagamento {
  id: string
  clube_id: string
  time_id: string
  tipo: TipoPagamento
  mensalista_id: string | null
  jogo_id: string | null
  referencia_mes: string | null
  nome: string
  nome_normalizado: string
  valor_centavos: number | null
  status: StatusPagamento
  declarado_em: string | null
  pago_em: string | null
  observacao: string | null
  created_at: string
  updated_at: string
}

export interface PagamentoStatusPublico {
  id: string
  clube_id: string
  time_id: string
  tipo: TipoPagamento
  mensalista_id: string | null
  jogo_id: string | null
  referencia_mes: string | null
  nome: string
  nome_normalizado: string
  status: StatusPagamento
}

export interface Sorteio {
  id: string
  jogo_id: string
  clube_id: string
  configuracao: Record<string, unknown>
  resultado: Record<string, unknown>
  created_at: string
}

export interface Notificacao {
  id: string
  clube_id: string
  time_id: string | null
  jogo_id: string | null
  tipo: TipoNotificacao
  ciclo: string
  situacao: SituacaoNotificacao
  erro: string | null
  destinatarios: unknown[]
  mensagem: string
  created_at: string
}

export interface PushToken {
  id: string
  user_id: string
  clube_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  created_at: string
}

export interface Fatura {
  id: string
  clube_id: string
  plano: PlanoClube
  valor_centavos: number
  status: SituacaoFatura
  referencia_mes: string
  pago_em: string | null
  created_at: string
}

// Placeholder mínimo para satisfazer o generic do supabase-js.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any
