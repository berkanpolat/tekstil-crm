import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'

export interface CatalogItem {
  id: number
  operation_id: number
  catalog_product_id: number | null   // null = eşleşmemiş (kartta çözülür)
  catalog_product_code: string
  label: string | null
  sort_order: number
}

/** Talepte katalogdan seçilen ürünler. catalog_product_id null → eşleşmeyen (siteden geldi). */
export function useOperationCatalogItems(operationId: number | null) {
  return useQuery({
    queryKey: ['operation-catalog-items', operationId],
    enabled: operationId != null,
    queryFn: async (): Promise<CatalogItem[]> => {
      const { data, error } = await supabase.from('operation_catalog_items')
        .select('id, operation_id, catalog_product_id, catalog_product_code, label, sort_order')
        .eq('operation_id', operationId as number).order('sort_order').order('id')
      if (error) throw error
      return (data ?? []) as unknown as CatalogItem[]
    },
  })
}

/** Katalog ürün arama (eşleştirme seçicisi) — kod/ad. */
export function useCatalogProductSearch(query: string) {
  return useQuery({
    queryKey: ['catalog-product-search', query],
    enabled: query.trim().length >= 2,
    queryFn: async () => {
      const q = query.trim()
      const { data } = await supabase.from('catalog_products')
        .select('id, code, name').is('deleted_at', null).or(`code.ilike.%${q}%,name.ilike.%${q}%`).limit(20)
      return (data ?? []) as { id: number; code: string; name: string }[]
    },
  })
}

/** Koleksiyonlar — yeni ürün eklerken kategori seçimi. */
export function useCatalogCollections() {
  return useQuery({
    queryKey: ['catalog-collections'],
    staleTime: 600_000,
    queryFn: async () => {
      const { data } = await supabase.from('catalog_collections').select('id, name').order('name')
      return (data ?? []) as { id: number; name: string }[]
    },
  })
}

/** Eşleşmeyen kalemi mevcut bir katalog ürününe bağla. */
export function useResolveCatalogItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, productId }: { itemId: number; productId: number; operationId: number }) => {
      const { error } = await supabase.rpc('resolve_catalog_item' as never, { p_item_id: itemId, p_product_id: productId } as never)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['operation-catalog-items', v.operationId] }),
  })
}

/** Koddan yeni katalog ürünü oluştur + kaleme bağla. */
export function useCreateCatalogProductAndLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, code, name, collectionId }: { itemId: number; code: string; name: string; collectionId: number | null; operationId: number }) => {
      const { error } = await supabase.rpc('create_catalog_product_and_link' as never,
        { p_item_id: itemId, p_code: code, p_name: name, p_collection_id: collectionId } as never)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['operation-catalog-items', v.operationId] }),
  })
}

export function useAddCatalogItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { operation_id: number; catalog_product_code: string; label?: string | null; sort_order?: number }) => {
      const { data: { user } } = await supabase.auth.getUser()
      ensureRows(await supabase.from('operation_catalog_items')
        .insert({ ...input, created_by: user?.id ?? null } as never).select('id'))
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['operation-catalog-items', v.operation_id] }),
  })
}

export function useDeleteCatalogItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: number; operation_id: number }) => {
      const { error } = await supabase.from('operation_catalog_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['operation-catalog-items', v.operation_id] }),
  })
}
