import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useReferenceQuery } from '@/hooks/useReferenceQuery'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'

export interface ProductCategory {
  id: number
  key: string
  label: string
  parent_id: number | null
  color: string | null
  sort_order: number
  is_active: boolean
  is_system: boolean
}

/** Üst kategoriler (parent_id null), aktif, sıralı. */
export function useCategoryOptions() {
  return useReferenceQuery({
    queryKey: ['product-categories', 'top'],
    queryFn: async (): Promise<ProductCategory[]> => {
      const { data, error } = await supabase.from('product_categories')
        .select('id, key, label, parent_id, color, sort_order, is_active, is_system')
        .is('parent_id', null).eq('is_active', true).order('sort_order').order('label')
      if (error) throw error
      return (data ?? []) as ProductCategory[]
    },
  })
}

/** Bir kategorinin türleri (alt düğümler), aktif, sıralı. */
export function useTypeOptions(categoryId: number | null) {
  return useReferenceQuery({
    queryKey: ['product-categories', 'types', categoryId],
    enabled: categoryId != null,
    queryFn: async (): Promise<ProductCategory[]> => {
      const { data, error } = await supabase.from('product_categories')
        .select('id, key, label, parent_id, color, sort_order, is_active, is_system')
        .eq('parent_id', categoryId as number).eq('is_active', true).order('sort_order').order('label')
      if (error) throw error
      return (data ?? []) as ProductCategory[]
    },
  })
}

/** Ayarlar için tüm ağaç (aktif+pasif). */
export function useCategoryTree() {
  return useReferenceQuery({
    queryKey: ['product-categories', 'all'],
    queryFn: async (): Promise<ProductCategory[]> => {
      const { data, error } = await supabase.from('product_categories')
        .select('id, key, label, parent_id, color, sort_order, is_active, is_system')
        .order('sort_order').order('label')
      if (error) throw error
      return (data ?? []) as ProductCategory[]
    },
  })
}

function slugify(label: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', İ: 'i' }
  return label.toLocaleLowerCase('tr').replace(/[çğıöşüİ]/g, (c) => map[c] ?? c)
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'kayit'
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ label, parentId }: { label: string; parentId: number | null }): Promise<number> => {
      const base = slugify(label)
      const key = `${parentId ? 't' : 'c'}_${base}_${Math.floor(Date.now() % 100000)}`
      const rows = ensureRows(await supabase.from('product_categories')
        .insert({ key, label: label.trim(), parent_id: parentId } as never).select('id'))
      return (rows as { id: number }[])[0]!.id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-categories'] }),
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: number; label?: string; is_active?: boolean; sort_order?: number }) => {
      ensureRows(await supabase.from('product_categories').update(patch as never).eq('id', id).select('id'))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-categories'] }),
  })
}
