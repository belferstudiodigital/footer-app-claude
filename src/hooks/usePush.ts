import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function usePush() {
  const { session, clube } = useAuth()
  const [suportado, setSuportado] = useState(false)
  const [permissao, setPermissao] = useState<NotificationPermission>('default')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    setSuportado('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)
    if ('Notification' in window) setPermissao(Notification.permission)
  }, [])

  async function ativar() {
    setErro('')
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
    if (!vapidKey) {
      setErro('Push ainda não configurado neste ambiente (falta a chave VAPID).')
      return
    }
    if (!session?.user || !clube) {
      setErro('Faça login para ativar notificações.')
      return
    }

    setCarregando(true)
    try {
      const registro = await navigator.serviceWorker.ready
      const permissaoConcedida = await Notification.requestPermission()
      setPermissao(permissaoConcedida)
      if (permissaoConcedida !== 'granted') {
        setErro('Permissão de notificação negada.')
        return
      }

      // Se já existe uma inscrição antiga (de uma chave VAPID anterior), remove antes de
      // criar uma nova — o navegador rejeita subscribe() com applicationServerKey diferente
      // da inscrição existente.
      const inscricaoAntiga = await registro.pushManager.getSubscription()
      if (inscricaoAntiga) {
        await inscricaoAntiga.unsubscribe()
      }

      const subscription = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
      const json = subscription.toJSON()

      await supabase.from('push_tokens').upsert(
        {
          user_id: session.user.id,
          clube_id: clube.id,
          endpoint: json.endpoint!,
          p256dh: json.keys!.p256dh,
          auth: json.keys!.auth,
          user_agent: navigator.userAgent,
        },
        { onConflict: 'endpoint' }
      )
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível ativar as notificações.')
    } finally {
      setCarregando(false)
    }
  }

  return { suportado, permissao, ativar, carregando, erro }
}
