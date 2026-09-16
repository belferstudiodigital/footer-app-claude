-- FOOTER: agendamento do lembrete push semanal
--
-- Este script agenda uma chamada automática à Edge Function "lembrete-semanal"
-- a cada 15 minutos. A própria função checa, a cada chamada, se algum time tem
-- times.dia_aviso_semanal / times.horario_aviso_semanal batendo com o dia e
-- horário atuais (fuso America/Sao_Paulo) e, se tiver, dispara a notificação push.
--
-- PRÉ-REQUISITO: a Edge Function "lembrete-semanal" precisa já estar publicada
-- no Supabase (Dashboard → Edge Functions → Create a new function → cole o
-- conteúdo de supabase/functions/lembrete-semanal/index.ts) antes de rodar
-- este SQL, com as variáveis de ambiente VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
-- e APP_URL configuradas em Edge Functions → lembrete-semanal → Secrets.
--
-- Rode este bloco no SQL Editor do Supabase DEPOIS de publicar a função.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('footer-lembrete-semanal')
where exists (select 1 from cron.job where jobname = 'footer-lembrete-semanal');

select cron.schedule(
  'footer-lembrete-semanal',
  '*/15 * * * *', -- a cada 15 minutos
  $$
  select net.http_post(
    url := 'https://vbngqgnghdnihnuzukqf.supabase.co/functions/v1/lembrete-semanal',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZibmdxZ25naGRuaWhudXp1a3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNTA5NzIsImV4cCI6MjEwNDkyNjk3Mn0.dc5SpbsyXpquov6adPNrw6a9wajJMT4DDq5N5z8KJo4'
    ),
    body := '{}'::jsonb
  );
  $$
);
