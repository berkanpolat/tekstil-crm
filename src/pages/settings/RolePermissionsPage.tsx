import { Lock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { toUserMessage } from '@/lib/errors'
import { PageHeader } from '@/components/shared/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { useHasPermission } from '@/hooks/useCatalog'
import { useReportPermissionMatrix, useSetRolePermission } from '@/hooks/useRolePermissions'

// Kısa sütun başlıkları (matris açıklamaları uzun)
const SHORT: Record<string, string> = {
  'reports.view': 'Raporları gör', 'reports.export': 'Dışa aktar', 'reports.finance': 'Finans raporu',
  'finance.view': 'Finans gör', 'finance.edit': 'Finans düzenle', 'finance.export': 'Finans dışa aktar',
}

/** P7.12 — Rol × rapor/finans yetki matrisi. Owner/Admin yönetir; Sahip satırı kilitli.
 *  "Sahip olmadığın yetkiyi veremezsin" kuralı sunucuda (guard_role_permission). */
export function RolePermissionsPage() {
  const canManage = useHasPermission('reports.view') // gerçek kapı sunucuda (owner/admin)
  const { data, isLoading, error } = useReportPermissionMatrix(canManage.data !== false)
  const setPerm = useSetRolePermission()

  async function toggle(roleKey: string, permKey: string, granted: boolean) {
    try { await setPerm.mutateAsync({ roleKey, permKey, granted }) }
    catch (e) { toast.error(await toUserMessage(e)) }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Roller & Yetkiler" description="Hangi rolün rapor ve finans yetkilerine sahip olduğunu yönetin. Sahip rolü tüm yetkilere sahiptir." />
      {isLoading ? <Skeleton className="h-64 w-full" />
        : error ? (
          <div className="bg-card text-text-secondary flex items-center gap-3 rounded-lg border border-border p-6">
            <Lock className="size-5" /> Yetki matrisini görüntülemek için Sahip veya Yönetici olmalısınız.
          </div>
        ) : !data ? null : (
          <div className="bg-card overflow-x-auto rounded-lg border border-border shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="text-text-secondary p-3 text-xs font-medium">Rol</th>
                  {data.permissions.map((p) => (
                    <th key={p.key} className="text-text-secondary p-3 text-center text-xs font-medium" title={p.label}>{SHORT[p.key] ?? p.key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.roles.map((r) => (
                  <tr key={r.key} className="border-b border-border/50 last:border-0">
                    <td className="text-foreground p-3 font-medium">
                      {r.name}{r.is_owner && <span className="text-text-muted ml-1 text-xs">(tüm yetkiler)</span>}
                    </td>
                    {data.permissions.map((p) => {
                      const on = r.is_owner || r.granted.includes(p.key)
                      return (
                        <td key={p.key} className={cn('p-3 text-center', r.is_owner && 'opacity-50')}>
                          <div className="flex justify-center">
                            {setPerm.isPending ? <Loader2 className="text-text-muted size-4 animate-spin" /> : (
                              <Checkbox checked={on} disabled={r.is_owner || setPerm.isPending}
                                onCheckedChange={(v) => void toggle(r.key, p.key, v === true)} />
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <p className="text-text-muted text-xs">Not: <span className="font-medium">reports.finance</span> raporları için ayrıca <span className="font-medium">finance.view</span> gerekir. Kendinizde olmayan bir yetkiyi başka role veremezsiniz.</p>
    </div>
  )
}
