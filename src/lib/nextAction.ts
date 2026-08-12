// "Sıradaki aksiyon" — bir operasyonun açık, en yakın due_at'li görevi (P6 / Aşama 2).
// Saf fonksiyon (render dışı, test edilebilir). status_closed / completed_at kapalı sayılır.

export interface NextActionTask {
  title: string
  due_at: string | null
  completed_at: string | null
  status_closed: boolean
}

export interface NextAction {
  title: string
  due_at: string | null
  overdue: boolean
}

/**
 * Açık görevler arasından "sıradaki aksiyon"u seçer:
 *   - Tarihli açık görevler önceliklidir → en yakın (en küçük) due_at.
 *   - Tarihli açık görev yoksa ilk açık görev (tarihsiz) döner.
 *   - Açık görev yoksa null.
 * overdue = seçilen görevin due_at'i now'dan küçükse (geçmişte).
 */
export function pickNextAction(tasks: readonly NextActionTask[], nowMs: number): NextAction | null {
  const open = tasks.filter((t) => !t.status_closed && !t.completed_at)
  if (open.length === 0) return null

  const dated = open
    .filter((t): t is NextActionTask & { due_at: string } => t.due_at != null)
    .map((t) => ({ t, ms: new Date(t.due_at).getTime() }))
    .sort((a, b) => a.ms - b.ms)

  if (dated.length > 0) {
    const { t, ms } = dated[0]!
    return { title: t.title, due_at: t.due_at, overdue: ms < nowMs }
  }
  return { title: open[0]!.title, due_at: null, overdue: false }
}
