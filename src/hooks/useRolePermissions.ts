import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PermDef { key: string; label: string; module: string }
export interface RoleRow { key: string; name: string; is_owner: boolean; granted: string[] }
export interface PermMatrix { permissions: PermDef[]; roles: RoleRow[] }

/** P7.12 — Rapor/finans yetki matrisi (owner/admin görebilir). */
export function useReportPermissionMatrix(enabled = true) {
  return useQuery({
    queryKey: ['report-permission-matrix'],
    enabled,
    queryFn: async (): Promise<PermMatrix> => {
      const { data, error } = await supabase.rpc('report_permission_matrix' as never)
      if (error) throw error
      return data as unknown as PermMatrix
    },
  })
}

export function useSetRolePermission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ roleKey, permKey, granted }: { roleKey: string; permKey: string; granted: boolean }) => {
      const { error } = await supabase.rpc('set_role_permission' as never, { p_role_key: roleKey, p_perm_key: permKey, p_granted: granted } as never)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report-permission-matrix'] }),
  })
}
