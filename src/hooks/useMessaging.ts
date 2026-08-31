import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useReferenceQuery } from '@/hooks/useReferenceQuery'
import { ensureRows } from '@/lib/errors'

/**
 * Mesajlaşma — M3.1 şeması üzerinde gelen kutusu ve konuşma akışı.
 *
 * Konuşma kendi kimliğini taşımaz; `entity_type`/`entity_id` ile lead ya da müşteriye
 * bağlıdır. Bu yüzden liste sorgusu ilgili kaydın adını iki kaynaktan toplar —
 * PostgREST polimorfik gömme yapamadığı için ad çözümü istemcide birleştirilir.
 */

export interface KonusmaSatir {
  id: number
  entity_type: 'lead' | 'customer'
  entity_id: number
  ad: string
  kanal: string
  son_mesaj_at: string | null
  okunmamis: number
  son_metin: string | null
}

export interface MesajSatir {
  id: number
  direction: 'inbound' | 'outbound'
  status: string
  body: string | null
  rendered_body: string | null
  media_url: string | null
  media_type: string | null
  error_message: string | null
  created_at: string
  sent_at: string | null
}

export interface KonusmaFiltre {
  arama?: string
  yalnizOkunmamis?: boolean
  tur?: 'lead' | 'customer' | null
}

/** Gelen kutusu — son mesaja göre sıralı konuşmalar. */
export function useKonusmalar(f: KonusmaFiltre = {}) {
  return useQuery({
    queryKey: ['konusmalar', f],
    queryFn: async (): Promise<KonusmaSatir[]> => {
      let q = supabase.from('conversations')
        .select('id, entity_type, entity_id, unread_count, last_message_at, channel:interaction_channels(label)')
        .eq('is_archived', false)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(200)
      if (f.yalnizOkunmamis) q = q.gt('unread_count', 0)
      if (f.tur) q = q.eq('entity_type', f.tur)
      const { data, error } = await q
      if (error) throw error
      const satir = (data ?? []) as unknown as {
        id: number; entity_type: 'lead' | 'customer'; entity_id: number
        unread_count: number; last_message_at: string | null; channel: { label: string } | null
      }[]
      if (!satir.length) return []

      // Adları toplu çek (N+1 sorgudan kaçın).
      const leadIds = satir.filter((s) => s.entity_type === 'lead').map((s) => s.entity_id)
      const custIds = satir.filter((s) => s.entity_type === 'customer').map((s) => s.entity_id)
      const [leads, custs, sonlar] = await Promise.all([
        leadIds.length
          ? supabase.from('leads').select('id, company_name, full_name').in('id', leadIds)
          : Promise.resolve({ data: [] as { id: number; company_name: string | null; full_name: string | null }[] }),
        custIds.length
          ? supabase.from('customers').select('id, company_name, full_name').in('id', custIds)
          : Promise.resolve({ data: [] as { id: number; company_name: string | null; full_name: string | null }[] }),
        supabase.from('messages')
          .select('conversation_id, body, created_at')
          .in('conversation_id', satir.map((s) => s.id))
          .order('created_at', { ascending: false }),
      ])
      const adOf = new Map<string, string>()
      for (const l of (leads.data ?? [])) adOf.set(`lead:${l.id}`, l.company_name || l.full_name || `#${l.id}`)
      for (const c of (custs.data ?? [])) adOf.set(`customer:${c.id}`, c.company_name || c.full_name || `#${c.id}`)
      const sonMetin = new Map<number, string>()
      for (const m of ((sonlar.data ?? []) as { conversation_id: number; body: string | null }[])) {
        if (!sonMetin.has(m.conversation_id) && m.body) sonMetin.set(m.conversation_id, m.body)
      }

      let sonuc: KonusmaSatir[] = satir.map((s) => ({
        id: s.id, entity_type: s.entity_type, entity_id: s.entity_id,
        ad: adOf.get(`${s.entity_type}:${s.entity_id}`) ?? `#${s.entity_id}`,
        kanal: s.channel?.label ?? '—',
        son_mesaj_at: s.last_message_at, okunmamis: s.unread_count,
        son_metin: sonMetin.get(s.id) ?? null,
      }))
      if (f.arama?.trim()) {
        const a = f.arama.trim().toLocaleLowerCase('tr')
        sonuc = sonuc.filter((s) => s.ad.toLocaleLowerCase('tr').includes(a))
      }
      return sonuc
    },
  })
}

/** Bir konuşmanın mesajları (eskiden yeniye). */
export function useMesajlar(konusmaId: number | null) {
  return useQuery({
    queryKey: ['mesajlar', konusmaId],
    enabled: konusmaId != null,
    queryFn: async (): Promise<MesajSatir[]> => {
      const { data, error } = await supabase.from('messages')
        .select('id, direction, status, body, rendered_body, media_url, media_type, error_message, created_at, sent_at')
        .eq('conversation_id', konusmaId as number)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as MesajSatir[]
    },
  })
}

/** Okundu işaretle — konuşma açıldığında. */
export function useOkunduIsaretle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (konusmaId: number) => {
      ensureRows(await supabase.from('conversations')
        .update({ unread_count: 0 }).eq('id', konusmaId).gt('unread_count', 0).select('id'))
    },
    // Okunmamış sayacı 0 zaten ise güncelleme satır döndürmez; hata sayılmaz.
    onError: () => {},
    onSuccess: () => qc.invalidateQueries({ queryKey: ['konusmalar'] }),
  })
}

/** Mesaj gönder — whatsapp-send edge fonksiyonu (gönderim + kayıt tek işlem). */
export function useMesajGonder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { entityType: 'lead' | 'customer'; entityId: number; text: string }) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-send', {
        body: { entity_type: v.entityType, entity_id: v.entityId, text: v.text },
      })
      if (error) throw error
      const r = data as { ok: boolean; error?: string }
      if (!r?.ok) throw new Error(r?.error ?? 'Mesaj gönderilemedi.')
      return r
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['konusmalar'] })
      qc.invalidateQueries({ queryKey: ['mesajlar'] })
    },
  })
}

/** Kullanıcının mesaj yetkileri. */
export function useMesajYetkisi() {
  return useReferenceQuery({
    queryKey: ['mesaj-yetkisi'],
    queryFn: async () => {
      const [gor, gonder] = await Promise.all([
        supabase.rpc('has_permission', { permission_key: 'messages.view' }),
        supabase.rpc('has_permission', { permission_key: 'messages.send' }),
      ])
      return { view: gor.data === true, send: gonder.data === true }
    },
  })
}
