import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'
import { useCurrentUser } from './useCurrentUser'

export interface AppNotification {
  id: number
  type: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  body: string | null
  entity_type: string | null
  entity_id: string | null
  action_url: string | null
  read_at: string | null
  dismissed_at: string | null
  silent: boolean
  created_at: string
}

/** Bildirim listesi (kendi bildirimlerim — RLS user_id=auth.uid()). */
export function useNotifications(limit = 50) {
  return useQuery({
    queryKey: ['notifications', limit],
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase.from('notifications')
        .select('id, type, severity, title, body, entity_type, entity_id, action_url, read_at, dismissed_at, silent, created_at')
        .is('dismissed_at', null).order('created_at', { ascending: false }).limit(limit)
      if (error) throw error
      return (data ?? []) as AppNotification[]
    },
  })
}

/** Okunmamış sayısı (zil rozeti). */
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ['notifications-unread'],
    queryFn: async (): Promise<number> => {
      const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true })
        .is('read_at', null).is('dismissed_at', null)
      return count ?? 0
    },
    refetchInterval: 120_000,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      ensureRows(await supabase.from('notifications').update({ read_at: new Date().toISOString() } as never).eq('id', id).is('read_at', null).select('id'))
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); qc.invalidateQueries({ queryKey: ['notifications-unread'] }) },
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() } as never).is('read_at', null).is('dismissed_at', null)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); qc.invalidateQueries({ queryKey: ['notifications-unread'] }) },
  })
}

export function useDismissNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      ensureRows(await supabase.from('notifications').update({ dismissed_at: new Date().toISOString() } as never).eq('id', id).select('id'))
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); qc.invalidateQueries({ queryKey: ['notifications-unread'] }) },
  })
}

/**
 * Gerçek zamanlı bildirim (B.4) + yeni bildirimde geri çağrı (B.5 ses). Kendi user_id'ime
 * gelen INSERT'leri dinler; listeyi tazeler, onNew ile sesi tetikler.
 */
export function useNotificationRealtime(onNew?: (n: AppNotification) => void) {
  const qc = useQueryClient()
  const { data: me } = useCurrentUser()
  const cb = useRef(onNew)
  useEffect(() => { cb.current = onNew }, [onNew])
  useEffect(() => {
    if (!me?.id) return
    const ch = supabase.channel('notifications-' + me.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${me.id}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: ['notifications'] })
          qc.invalidateQueries({ queryKey: ['notifications-unread'] })
          cb.current?.(payload.new as AppNotification)
        })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [me?.id, qc])
}

/**
 * Uyarı motoru poller (B.2): açık dosya kademelerini okuma anında hesaplatır. Ayardaki
 * aralıkla process_open_file_alerts RPC'sini çağırır (cron yok). Yeni bildirimler realtime düşer.
 */
export function useAlertEngine() {
  const { data: me } = useCurrentUser()
  useEffect(() => {
    if (!me?.id) return
    let timer: ReturnType<typeof setInterval> | null = null
    let cancelled = false
    const run = () => {
      void supabase.rpc('process_open_file_alerts'); void supabase.rpc('process_delivery_warnings')
      void supabase.rpc('process_payment_due_warnings'); void supabase.rpc('process_task_due_warnings')
      void supabase.rpc('process_goal_notifications')
      // P9 (madde 16): teklif 1-saat sesli + numune termini doldu sesli (types'te yok → cast)
      void supabase.rpc('process_quote_final_hour' as never); void supabase.rpc('process_sample_due_warnings' as never)
    }
    ;(async () => {
      const { data } = await supabase.from('settings').select('value').eq('key', 'alerts.check_interval_minutes').maybeSingle()
      const mins = Number(data?.value ?? 15) || 15
      if (cancelled) return
      run() // açılışta bir kez
      timer = setInterval(run, mins * 60_000)
    })()
    return () => { cancelled = true; if (timer) clearInterval(timer) }
  }, [me?.id])
}
