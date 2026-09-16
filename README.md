# FOOTER — build de teste (React + Vite + Supabase)

App PWA para organizar peladas/rachas recorrentes, com paridade ao produto em produção (Lovable) mais as 6 melhorias descritas no PRD (prazo diferenciado + liberação automática de vaga para mensalistas, contador de furos + selo de confiabilidade, status público de pagamento, botão "Já paguei" + confirmação 1-toque do admin, Resumo Pós-Jogo compartilhável, aviso semanal automático via WhatsApp citando mensalistas em risco).

Stack: React 18 + TypeScript + Vite, Tailwind CSS v4, TanStack Query, React Router, Supabase (Postgres + Auth + RLS + RPCs), vite-plugin-pwa.

Toda a regra de negócio sensível (confirmação, furo, pagamento, promoção de fila de espera, renomeação sincronizada) vive em funções `SECURITY DEFINER` no Postgres — o front-end só chama RPCs, nunca escreve direto nas tabelas críticas.

## Rodando localmente

```bash
npm install
cp .env.example .env   # preencha as chaves abaixo
npm run dev
```

## Variáveis de ambiente necessárias

| Variável | Onde encontrar | Obrigatória para o app funcionar? |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → "Project URL" (ou monte a partir do "Reference": `https://<reference>.supabase.co`) | Sim |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → "Project API keys" → `anon` `public` | Sim |
| `VITE_VAPID_PUBLIC_KEY` | Gerada localmente com `npx web-push generate-vapid-keys` | Só para push notification (o app funciona sem) |

`SUPABASE_SERVICE_ROLE_KEY` e `VAPID_PRIVATE_KEY` **não são usadas neste build** — não existe nenhuma função server-side (Edge Function) que precise delas; toda autorização sensível é feita pelas próprias funções do Postgres. Não é necessário informá-las para rodar ou fazer deploy.

## Banco de dados (Supabase)

As migrations ficam em `supabase/migrations/`, em ordem:

1. `0001_schema.sql` — tabelas, enums, triggers de `updated_at`
2. `0002_rls.sql` — Row Level Security + view pública de pagamentos (nunca expõe valores)
3. `0003_functions.sql` — funções principais (confirmação, furo, prazo, pagamento)
4. `0004_admin_functions.sql` — funções administrativas

Para aplicar num projeto Supabase novo, sem precisar de token/CLI: abra **SQL Editor** no painel do Supabase e cole o conteúdo de cada arquivo, um de cada vez, na ordem acima, clicando em "Run".

## Deploy (Vercel)

Este é um projeto Vite padrão (`npm run build` gera `dist/`), então o import na Vercel é direto:

1. Suba esta pasta para um repositório no GitHub (a Vercel importa a partir de um repositório Git).
2. Na Vercel: **Add New → Project → Import Git Repository**, selecione o repositório. Framework preset "Vite" é detectado automaticamente.
3. Em **Environment Variables**, adicione `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e (opcional) `VITE_VAPID_PUBLIC_KEY`.
4. Deploy. Não é necessário nenhum token de API da Vercel — o import acontece pela interface web, autenticado com sua própria conta.

Alternativa sem GitHub: instale a Vercel CLI na sua máquina (`npm i -g vercel`), rode `vercel` dentro da pasta do projeto e siga o login interativo pelo navegador — também não exige token manual.
