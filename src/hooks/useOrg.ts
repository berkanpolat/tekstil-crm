import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useReferenceQuery } from '@/hooks/useReferenceQuery'
import { supabase } from '@/lib/supabase'
import { AppError, ensureRows } from '@/lib/errors'

export interface Department {
  id: number
  name: string
  code: string
  description: string | null
  sort_order: number
  is_active: boolean
}

export interface Position {
  id: number
  name: string
  code: string
  department_id: number | null
  department_name: string | null
  is_active: boolean
}

// ---------- Departmanlar ----------
export function useDepartments() {
  return useReferenceQuery({
    queryKey: ['departments'],
    queryFn: async (): Promise<Department[]> => {
      const { data, error } = await supabase
        .from('departments')
        .select('id, name, code, description, sort_order, is_active')
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export interface DepartmentInput {
  name: string
  code: string
  description?: string | null
  sort_order?: number
  is_active?: boolean
}

export function useSaveDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...fields }: DepartmentInput & { id?: number }) => {
      const res = id
        ? await supabase.from('departments').update(fields).eq('id', id).select('id')
        : await supabase.from('departments').insert(fields).select('id')
      if (res.error?.code === '23505') throw new AppError('Bu departman kodu zaten kullanılıyor.')
      ensureRows(res)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] })
      qc.invalidateQueries({ queryKey: ['department-options'] })
    },
  })
}

export function useSetDepartmentActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      ensureRows(await supabase.from('departments').update({ is_active }).eq('id', id).select('id'))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] })
      qc.invalidateQueries({ queryKey: ['department-options'] })
    },
  })
}

// ---------- Pozisyonlar ----------
export function usePositions() {
  return useReferenceQuery({
    queryKey: ['positions'],
    queryFn: async (): Promise<Position[]> => {
      const { data, error } = await supabase
        .from('positions')
        .select('id, name, code, department_id, is_active, departments(name)')
        .order('name')
      if (error) throw error
      return (data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        department_id: p.department_id,
        department_name: (p.departments as { name: string } | null)?.name ?? null,
        is_active: p.is_active,
      }))
    },
  })
}

export interface PositionInput {
  name: string
  code: string
  department_id?: number | null
  is_active?: boolean
}

export function useSavePosition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...fields }: PositionInput & { id?: number }) => {
      const res = id
        ? await supabase.from('positions').update(fields).eq('id', id).select('id')
        : await supabase.from('positions').insert(fields).select('id')
      // Departman-bazlı benzersizlik ihlali anlaşılır mesaja çevrilir.
      if (res.error?.code === '23505') {
        throw new AppError('Bu kod, seçilen departmanda (veya global düzlemde) zaten kullanılıyor.')
      }
      ensureRows(res)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['positions'] })
      qc.invalidateQueries({ queryKey: ['position-options'] })
    },
  })
}

export function useSetPositionActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      ensureRows(await supabase.from('positions').update({ is_active }).eq('id', id).select('id'))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['positions'] })
      qc.invalidateQueries({ queryKey: ['position-options'] })
    },
  })
}
