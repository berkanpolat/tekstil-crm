import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { formatDistanceToNow, format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Loader2, Search, Send, MessageSquare, AlertCircle, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toUserMessage } from '@/lib/errors'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  useKonusmalar, useMesajlar, useOkunduIsaretle, useMesajGonder, useMesajYetkisi,
  type KonusmaSatir,
} from '@/hooks/useMessaging'

/**
 * Gelen kutusu — solda konuşma listesi, sağda seçili konuşmanın akışı.
 *
 * Konuşma lead ya da müşteriye bağlı olabildiği için başlıktaki bağlantı da ona göre
 * kurulur; kullanıcı mesajdan kartın kendisine geçebilir.
 */
export function InboxPage() {
  const yetki = useMesajYetkisi()
  const [arama, setArama] = useState('')
  const [yalnizOkunmamis, setYalnizOkunmamis] = useState(false)
  const [secili, setSecili] = useState<KonusmaSatir | null>(null)

  const konusmalar = useKonusmalar({ arama, yalnizOkunmamis })
  const okundu = useOkunduIsaretle()

  // Konuşma açılınca okunmuş say — sayaç gelen kutusunda şişip kalmasın.
  useEffect(() => {
    if (secili && secili.okunmamis > 0) okundu.mutate(secili.id)
    // okundu referansı her render değişiyor; yalnız seçim değişince çalışsın.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secili?.id])

  if (yetki.data && !yetki.data.view) {
    return <div className="p-8 text-sm text-text-muted">Mesajları görme yetkiniz yok.</div>
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col">
      <PageHeader title="Mesajlar" description="WhatsApp konuşmaları — potansiyel ve müşterilerle." />
      <div className="flex min-h-0 flex-1 gap-4">
        {/* ── Konuşma listesi ── */}
        <aside className="flex w-80 shrink-0 flex-col rounded-lg border border-border">
          <div className="space-y-2 border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
              <Input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Ara…" className="pl-8" />
            </div>
            <label className="flex items-center gap-2 text-xs text-text-muted">
              <input type="checkbox" checked={yalnizOkunmamis} onChange={(e) => setYalnizOkunmamis(e.target.checked)} />
              Yalnız okunmamışlar
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {konusmalar.isLoading && <div className="p-4 text-sm text-text-muted">Yükleniyor…</div>}
            {konusmalar.data?.length === 0 && <div className="p-4 text-sm text-text-muted">Konuşma yok.</div>}
            {konusmalar.data?.map((k) => (
              <button
                key={k.id}
                onClick={() => setSecili(k)}
                className={cn('w-full border-b border-border px-3 py-2.5 text-left hover:bg-muted/50',
                  secili?.id === k.id && 'bg-muted')}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{k.ad}</span>
                  {k.son_mesaj_at && (
                    <span className="shrink-0 text-[11px] text-text-muted">
                      {formatDistanceToNow(new Date(k.son_mesaj_at), { addSuffix: true, locale: tr })}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-text-muted">{k.son_metin ?? '—'}</span>
                  {k.okunmamis > 0 && (
                    <span className="shrink-0 rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
                      {k.okunmamis}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* ── Konuşma akışı ── */}
        <section className="flex min-w-0 flex-1 flex-col rounded-lg border border-border">
          {!secili ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-text-muted">
              <MessageSquare className="size-8" />
              <p className="text-sm">Soldan bir konuşma seçin.</p>
            </div>
          ) : (
            <>
              <header className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <Link
                    to={secili.entity_type === 'lead' ? `/potansiyeller/${secili.entity_id}` : `/musteriler/${secili.entity_id}`}
                    className="text-sm font-medium text-foreground hover:underline"
                  >
                    {secili.ad}
                  </Link>
                  <p className="text-xs text-text-muted">
                    {secili.kanal} · {secili.entity_type === 'lead' ? 'Potansiyel' : 'Müşteri'}
                  </p>
                </div>
              </header>
              <Akis konusmaId={secili.id} />
              <Gonderim secili={secili} gonderebilir={!!yetki.data?.send} />
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function Akis({ konusmaId }: { konusmaId: number }) {
  const mesajlar = useMesajlar(konusmaId)
  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
      {mesajlar.isLoading && <p className="text-sm text-text-muted">Yükleniyor…</p>}
      {mesajlar.data?.map((m) => {
        const giden = m.direction === 'outbound'
        return (
          <div key={m.id} className={cn('flex', giden ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[70%] rounded-lg px-3 py-2 text-sm',
              giden ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>
              {m.media_url && (
                <a href={m.media_url} target="_blank" rel="noreferrer"
                   className="mb-1 flex items-center gap-1 text-xs underline opacity-90">
                  <Paperclip className="size-3" /> Ek {m.media_type ? `(${m.media_type})` : ''}
                </a>
              )}
              <p className="whitespace-pre-wrap break-words">{m.body ?? m.rendered_body ?? '—'}</p>
              <div className={cn('mt-1 flex items-center gap-1 text-[11px]',
                giden ? 'text-primary-foreground/70' : 'text-text-muted')}>
                <span>{format(new Date(m.created_at), 'd MMM HH:mm', { locale: tr })}</span>
                {giden && <span>· {m.status}</span>}
                {m.status === 'basarisiz' && (
                  <span title={m.error_message ?? ''}><AlertCircle className="size-3" /></span>
                )}
              </div>
            </div>
          </div>
        )
      })}
      {mesajlar.data?.length === 0 && <p className="text-sm text-text-muted">Bu konuşmada mesaj yok.</p>}
    </div>
  )
}

function Gonderim({ secili, gonderebilir }: { secili: KonusmaSatir; gonderebilir: boolean }) {
  const [metin, setMetin] = useState('')
  const gonder = useMesajGonder()

  // 24 saatlik WhatsApp penceresi: müşteri son 24 saatte yazmadıysa serbest metin
  // Twilio tarafından reddedilir. Kullanıcıyı denemeden önce uyarıyoruz.
  // Şimdi'yi render'da okumak saflık ihlali (CLAUDE.md); bileşen kurulurken bir kez
  // alınır — pencere sınırı saatler mertebesinde, bu hassasiyet fazlasıyla yeterli.
  const [simdi] = useState(() => Date.now())
  const pencereKapali = useMemo(() => {
    if (!secili.son_mesaj_at) return true
    return simdi - new Date(secili.son_mesaj_at).getTime() > 24 * 3600 * 1000
  }, [secili.son_mesaj_at, simdi])

  async function yolla() {
    if (!metin.trim()) return
    try {
      await gonder.mutateAsync({ entityType: secili.entity_type, entityId: secili.entity_id, text: metin.trim() })
      setMetin('')
      toast.success('Mesaj gönderildi.')
    } catch (e) { toast.error(await toUserMessage(e)) }
  }

  if (!gonderebilir) {
    return <div className="border-t border-border p-3 text-xs text-text-muted">Mesaj gönderme yetkiniz yok.</div>
  }
  return (
    <div className="space-y-2 border-t border-border p-3">
      {pencereKapali && (
        <p className="flex items-center gap-1.5 rounded bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="size-3.5 shrink-0" />
          24 saatlik yanıt penceresi kapalı — serbest metin reddedilebilir, onaylı şablon gerekir.
        </p>
      )}
      <div className="flex gap-2">
        <Textarea
          value={metin} onChange={(e) => setMetin(e.target.value)} rows={2}
          placeholder="Mesaj yazın…"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void yolla() }}
        />
        <Button onClick={() => void yolla()} disabled={gonder.isPending || !metin.trim()} className="self-end">
          {gonder.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
    </div>
  )
}
