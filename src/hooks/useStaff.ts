import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { SortState } from '@/components/shared/DataTable'

export interface StaffRow {
  id: string
  email: string
  full_name: string
  phone: string | null
  is_active: boolean
  department_name: string | null
  position_name: string | null
  role_name: string | null
  role_key: string | null
  created_at: string
}

export interface StaffFilters {
  search?: string
  departmentId?: number | null
  positionId?: number | null
  status?: 'active' | 'inactive' | null
  page: number
  pageSize: number
  sort?: SortState | null
}

const SORT_COLUMN: Record<string, string> = {
  full_name: 'full_name',
  email: 'email',
  created_at: 'created_at',
}

export function useStaffList(filters: StaffFilters) {
  return useQuery({
    queryKey: ['staff', filters],
    queryFn: async (): Promise<{ rows: StaffRow[]; total: number }> => {
      let query = supabase
        .from('users')
        .select(
          'id, email, full_name, phone, is_active, created_at, departments(name), positions(name), roles(key, name)',
          { count: 'exact' },
        )
        .is('deleted_at', null)

      if (filters.search) {
        const q = filters.search.replace(/[%,]/g, '')
        query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      }
      if (filters.departmentId != null) query = query.eq('department_id', filters.departmentId)
      if (filters.positionId != null) query = query.eq('position_id', filters.positionId)
      if (filters.status === 'active') query = query.eq('is_active', true)
      if (filters.status === 'inactive') query = query.eq('is_active', false)

      const col = SORT_COLUMN[filters.sort?.key ?? 'full_name'] ?? 'full_name'
      query = query.order(col, { ascending: filters.sort?.dir !== 'desc' })

      const from = (filters.page - 1) * filters.pageSize
      query = query.range(from, from + filters.pageSize - 1)

      const { data, error, count } = await query
      if (error) throw error
      const rows: StaffRow[] = (data ?? []).map((u) => {
        const dept = u.departments as { name: string } | null
        const pos = u.positions as { name: string } | null
        const role = u.roles as { key: string; name: string } | null
        return {
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          phone: u.phone,
          is_active: u.is_active,
          department_name: dept?.name ?? null,
          position_name: pos?.name ?? null,
          role_name: role?.name ?? null,
          role_key: role?.key ?? null,
          created_at: u.created_at,
        }
      })
      return { rows, total: count ?? 0 }
    },
  })
}

// --- Form seçenekleri (aktif kayıtlar) ---
export function useRoleOptions() {
  return useQuery({
    queryKey: ['role-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('id, key, name')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export function useDepartmentOptions() {
  return useQuery({
    queryKey: ['department-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export function usePositionOptions(departmentId?: number | null) {
  return useQuery({
    queryKey: ['position-options', departmentId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('positions').select('id, name, department_id').eq('is_active', true)
      if (departmentId != null) q = q.or(`department_id.eq.${departmentId},department_id.is.null`)
      const { data, error } = await q.order('name')
      if (error) throw error
      return data
    },
  })
}

// --- Mutasyonlar ---
export interface CreateStaffInput {
  email: string
  password: string
  full_name: string
  role_id?: number | null
  department_id?: number | null
  position_id?: number | null
  phone?: string | null
}

export function useCreateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateStaffInput) => {
      const { data, error } = await supabase.functions.invoke('create-user', { body: input })
      if (error) throw new Error((await extractError(error)) || 'Çalışan oluşturulamadı.')
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  })
}

export interface UpdateStaffInput {
  id: string
  full_name?: string
  phone?: string | null
  department_id?: number | null
  position_id?: number | null
  role_id?: number | null
}

export function useUpdateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...fields }: UpdateStaffInput) => {
      const { error } = await supabase.from('users').update(fields).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  })
}

export function useResetStaffPassword() {
  return useMutation({
    mutationFn: async (input: { user_id: string; new_password: string }) => {
      const { error } = await supabase.functions.invoke('reset-user-password', { body: input })
      if (error) throw new Error((await extractError(error)) || 'Şifre sıfırlanamadı.')
    },
  })
}

export function useSetStaffActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { user_id: string; is_active: boolean }) => {
      const { error } = await supabase.functions.invoke('set-user-active', { body: input })
      if (error) throw new Error((await extractError(error)) || 'İşlem gerçekleştirilemedi.')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  })
}

/** Edge Function hata gövdesinden kullanıcı mesajını çıkarır. */
async function extractError(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.text === 'function') {
    try {
      const body = JSON.parse(await ctx.text()) as { error?: string }
      return body.error ?? null
    } catch {
      return null
    }
  }
  return (error as Error).message ?? null
}
