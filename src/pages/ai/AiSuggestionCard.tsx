import { useState, type ReactNode } from 'react'
import { Sparkles, Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAiFeedback } from '@/hooks/useAi'

/**
 * P6.9 — Tüm YZ önerileri AYNI görsel kalıpta: mor kenar + kıvılcım + "Öneri" etiketi,
 * kısa gerekçe, Kabul/Reddet. Kabul/red ai_requests'e yazılır (Faz 7 analizi). Reddederken
 * sebep opsiyonel. Kullanıcı bunun MODEL çıktısı olduğunu bilir; hiçbir öneri otomatik uygulanmaz.
 */
export function AiSuggestionCard({ title, rationale, requestId, children, onAccept, onReject, busy }:
  { title: string; rationale?: string; requestId?: number | null; children: ReactNode
    onAccept?: () => void | Promise<void>; onReject?: () => void | Promise<void>; busy?: boolean }) {
  const feedback = useAiFeedback()
  const [state, setState] = useState<'open' | 'accepted' | 'rejected'>('open')
  const [reason, setReason] = useState('')
  const [asking, setAsking] = useState(false)

  async function accept() {
    if (requestId) void feedback.mutateAsync({ requestId, accepted: true })
    await onAccept?.(); setState('accepted')
  }
  async function reject() {
    if (requestId) void feedback.mutateAsync({ requestId, accepted: false, reason: reason.trim() || undefined })
    await onReject?.(); setState('rejected')
  }

  return (
    <div className="rounded-lg border-2 border-[color:var(--color-accent-primary,#7c3aed)]/40 bg-[color:var(--color-accent-pale,#f5f3ff)]/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-4 text-[color:var(--color-accent-primary,#7c3aed)]" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="rounded-full bg-[color:var(--color-accent-primary,#7c3aed)]/15 px-2 py-0.5 text-[10px] font-medium text-[color:var(--color-accent-primary,#7c3aed)]">Öneri</span>
      </div>

      <div className="text-sm text-foreground">{children}</div>
      {rationale && <p className="mt-2 text-[11px] text-text-muted">Bu öneri şuna dayanıyor: {rationale}</p>}

      {state === 'open' && (onAccept || onReject || requestId) && (
        <div className="mt-3 flex items-center gap-2">
          {asking ? (
            <>
              <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ret sebebi (opsiyonel)" className="h-8" />
              <Button size="sm" variant="outline" className="h-8" onClick={() => void reject()}>Reddet</Button>
            </>
          ) : (
            <>
              <Button size="sm" className="h-8" disabled={busy} onClick={() => void accept()}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Kabul et</Button>
              <Button size="sm" variant="ghost" className="h-8 text-text-muted" onClick={() => setAsking(true)}><X className="size-3.5" /> Reddet</Button>
            </>
          )}
        </div>
      )}
      {state === 'accepted' && <p className="mt-2 text-xs text-success-foreground">✓ Kabul edildi.</p>}
      {state === 'rejected' && <p className="mt-2 text-xs text-text-muted">Reddedildi.</p>}
    </div>
  )
}
