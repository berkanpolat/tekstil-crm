import { useQuery } from '@tanstack/react-query'
import { ArrowRight, GitBranch } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'

interface Transition {
  id: number
  entity_type: string
  from_key: string
  to_key: string
  requires_reason: boolean
  is_active: boolean
  sort_order: number
}

const ENTITY_LABEL: Record<string, string> = {
  operation: 'Operasyon aşamaları', quote: 'Teklif durumları', sample: 'Numune durumları', order: 'Sipariş durumları',
}

function useTransitions() {
  return useQuery({
    queryKey: ['status-transitions'],
    queryFn: async (): Promise<Transition[]> => {
      const { data, error } = await supabase.from('status_transitions')
        .select('id, entity_type, from_key, to_key, requires_reason, is_active, sort_order')
        .order('entity_type').order('sort_order')
      if (error) throw error
      return (data ?? []) as Transition[]
    },
  })
}

/** Durum makinesi — izinli geçişler (görüntüleme). Kurallar tabloda; kod değil. */
export function StatusTransitionsPage() {
  const { data, isLoading } = useTransitions()
  const groups = new Map<string, Transition[]>()
  for (const t of data ?? []) { const a = groups.get(t.entity_type) ?? []; a.push(t); groups.set(t.entity_type, a) }

  return (
    <div className="space-y-5">
      <PageHeader title="Durum Geçişleri"
        description="Modüller arası izinli geçişler. Koda gömülü değil — bu tabloda tutulur, UI ileri adımları buradan önerir." />
      {isLoading ? <Skeleton className="h-64 w-full" /> : (data ?? []).length === 0 ? (
        <EmptyState icon={GitBranch} title="Geçiş tanımı yok" description="Henüz geçiş tanımlanmamış." />
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([entity, list]) => (
            <div key={entity} className="border-border overflow-hidden rounded-lg border">
              <div className="bg-muted/50 text-text-secondary border-b px-3 py-2 text-sm font-medium">{ENTITY_LABEL[entity] ?? entity}</div>
              <ul className="divide-y">
                {list.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="text-foreground bg-muted rounded px-1.5 py-0.5 font-mono text-xs">{t.from_key}</span>
                    <ArrowRight className="text-text-muted size-4" />
                    <span className="text-foreground bg-muted rounded px-1.5 py-0.5 font-mono text-xs">{t.to_key}</span>
                    {t.requires_reason && <span className="text-warning-foreground text-xs">gerekçe gerekli</span>}
                    {!t.is_active && <span className="text-text-muted text-xs">(pasif)</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-text-muted text-xs">
            Sert kapılar (kalemsiz teklif gönderilemez, müşterisiz operasyon açılamaz, iptal/red gerekçesiz olamaz)
            veritabanında zorlanır. Yumuşak kapılar (ör. numune onayı olmadan sipariş) uyarır, gerekçeyle geçilir ve
            zaman çizelgesine yazılır.
          </p>
        </div>
      )}
    </div>
  )
}
