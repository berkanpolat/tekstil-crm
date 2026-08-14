import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useReferenceQuery } from '@/hooks/useReferenceQuery'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'
import { normalizeTr } from '@/lib/normalize'
import { fetchRates } from './useDocuments'
import { buildRates, type Rates, type MarginTier } from '@/lib/pricing'
import type { SortState } from '@/components/shared/DataTable'

// ── Yetki ───────────────────────────────────────────────────────────────────
export function useHasPermission(key: string) {
  return useQuery({
    queryKey: ['has-permission', key],
    staleTime: 300_000,
    queryFn: async (): Promise<boolean> => (await supabase.rpc('has_permission', { permission_key: key })).data ?? false,
  })
}

// ── Döviz kuru (P4B.5) ──────────────────────────────────────────────────────
export interface RateInfo { USD: number | null; EUR: number | null; GBP: number | null; source: string; fetched_at: string | null; age_hours: number; safety_percent: number; refresh_hours: number; stale: boolean; blocked: boolean }

/** Güncel kur + yaş + engel. stale ise arka planda TCMB'den tazeler (cron yok). */
export function useExchangeRates() {
  const qc = useQueryClient()
  const refresh = useRefreshRates()
  return useQuery({
    queryKey: ['exchange-rates'],
    refetchInterval: 300_000,
    queryFn: async (): Promise<RateInfo> => {
      const { data } = await supabase.rpc('current_rates')
      const info = data as unknown as RateInfo
      if (info?.stale && !refresh.isPending) refresh.mutate(undefined, { onSuccess: () => qc.invalidateQueries({ queryKey: ['exchange-rates'] }) })
      return info
    },
  })
}
/** TCMB kurunu PDF servisi /rates üzerinden çekip exchange_rates'e yazar (set_exchange_rate). */
export function useRefreshRates() {
  return useMutation({
    mutationFn: async () => {
      const r = await fetchRates()
      if (!r) throw new Error('Kur alınamadı (PDF servisi /rates).')
      for (const cur of ['USD', 'EUR', 'GBP'] as const) if (r[cur]) await supabase.rpc('set_exchange_rate', { p_currency: cur, p_rate: r[cur] as number, p_source: r.source || 'TCMB' })
    },
  })
}
/** RateInfo → pricing.ts için efektif (güvenlik paylı) kur haritası. */
export function ratesToMap(info: RateInfo | undefined): Rates {
  return buildRates({ USD: info?.USD, EUR: info?.EUR, GBP: info?.GBP }, info?.safety_percent ?? 0)
}

// ── Marj kademeleri (P4B.6) ─────────────────────────────────────────────────
export function useMarginTiers() {
  return useReferenceQuery({
    queryKey: ['margin-tiers'],
    staleTime: 300_000,
    queryFn: async (): Promise<MarginTier[]> => {
      const { data } = await supabase.from('margin_tiers').select('min_quantity, margin_percent').eq('is_active', true).order('min_quantity')
      return (data ?? []) as MarginTier[]
    },
  })
}

// ── Kataloglar / koleksiyonlar ──────────────────────────────────────────────
export function useCatalogs() {
  return useReferenceQuery({ queryKey: ['catalogs'], queryFn: async () => (await supabase.from('catalogs').select('id, name, season, year, is_active').is('deleted_at', null).order('created_at', { ascending: false })).data ?? [] })
}
export function useCollections(catalogId: number | null) {
  return useQuery({
    queryKey: ['collections', catalogId], enabled: catalogId != null,
    queryFn: async () => (await supabase.from('catalog_collections').select('id, name, catalog_id').eq('catalog_id', catalogId as number).order('sort_order')).data ?? [],
  })
}

// ── Ürün listesi ────────────────────────────────────────────────────────────
export interface CatalogFilters { search?: string; catalogId?: number | null; collectionId?: number | null; categoryId?: number | null; hasCost?: 'yes' | 'no' | null; active?: boolean | null; page: number; pageSize: number; sort?: SortState | null }
export interface CatalogRow { id: number; code: string; name: string; category_label: string | null; type_label: string | null; collection_name: string | null; moq: number; is_active: boolean; image_path: string | null }

const LIST_SELECT = 'id, code, name, moq, is_active, category:product_categories!catalog_products_category_id_fkey(label), type:product_categories!catalog_products_type_id_fkey(label), collection:catalog_collections(name), images:catalog_product_images(sort_order, files(storage_path))'

export interface CatalogPick { id: number; code: string; name: string; category_id: number | null; type_id: number | null; composition: string | null }
/** 1.12 — Talep formunda katalog ürünü seçici için hafif liste (kod/ad + oto-doldur alanları). */
export function useCatalogPickList() {
  return useQuery({
    queryKey: ['catalog-pick-list'],
    staleTime: 300_000,
    queryFn: async (): Promise<CatalogPick[]> => {
      const { data, error } = await supabase.from('catalog_products')
        .select('id, code, name, category_id, type_id, composition')
        .is('deleted_at', null).eq('is_active', true).order('code').limit(2000)
      if (error) throw error
      return (data ?? []) as CatalogPick[]
    },
  })
}

export function useCatalogProducts(f: CatalogFilters) {
  return useQuery({
    queryKey: ['catalog-products', f],
    queryFn: async (): Promise<{ rows: CatalogRow[]; total: number }> => {
      let q = supabase.from('catalog_products').select(LIST_SELECT, { count: 'exact' }).is('deleted_at', null)
      if (f.catalogId != null) q = q.eq('catalog_id', f.catalogId)
      if (f.collectionId != null) q = q.eq('collection_id', f.collectionId)
      if (f.categoryId != null) q = q.or(`category_id.eq.${f.categoryId},type_id.eq.${f.categoryId}`)
      if (f.active != null) q = q.eq('is_active', f.active)
      if (f.search) { const n = normalizeTr(f.search); const up = f.search.replace(/[^A-Za-z0-9-]/g, '').toUpperCase()
        q = q.or([n && `name_normalized.ilike.%${n}%`, n && `composition.ilike.%${f.search}%`, up && `code.ilike.%${up}%`].filter(Boolean).join(',')) }
      const col = f.sort?.key === 'code' ? 'code' : f.sort?.key === 'name' ? 'name' : 'sort_order'
      q = q.order(col, { ascending: f.sort?.dir !== 'desc' })
      const from = (f.page - 1) * f.pageSize
      const { data, error, count } = await q.range(from, from + f.pageSize - 1)
      if (error) throw error
      let rows: CatalogRow[] = ((data ?? []) as unknown as RawCat[]).map((d) => ({
        id: d.id, code: d.code, name: d.name, moq: d.moq, is_active: d.is_active,
        category_label: d.category?.label ?? null, type_label: d.type?.label ?? null, collection_name: d.collection?.name ?? null,
        image_path: (d.images ?? []).sort((a, b) => a.sort_order - b.sort_order)[0]?.files?.storage_path ?? null,
      }))
      // Maliyet var/yok filtresi (costs.view yoksa RLS boş döner → filtre etkisiz kalır)
      if (f.hasCost) {
        const { data: withCost } = await supabase.from('product_costs').select('product_id').eq('is_current', true)
        const set = new Set((withCost ?? []).map((r) => r.product_id))
        rows = rows.filter((r) => f.hasCost === 'yes' ? set.has(r.id) : !set.has(r.id))
      }
      return { rows, total: count ?? 0 }
    },
  })
}
interface RawCat { id: number; code: string; name: string; moq: number; is_active: boolean; category: { label: string } | null; type: { label: string } | null; collection: { name: string } | null; images: { sort_order: number; files: { storage_path: string } | null }[] }

// ── Ürün detay ──────────────────────────────────────────────────────────────
export function useCatalogProduct(id: number | null) {
  return useQuery({
    queryKey: ['catalog-product', id], enabled: id != null,
    queryFn: async () => {
      const { data, error } = await supabase.from('catalog_products')
        .select('*, category:product_categories!catalog_products_category_id_fkey(label), type:product_categories!catalog_products_type_id_fkey(label), collection:catalog_collections(name), catalog:catalogs(name), images:catalog_product_images(id, image_type, sort_order, files(storage_path))')
        .eq('id', id as number).single()
      if (error) throw error
      return data as unknown as CatalogProductDetail
    },
  })
}
export interface CatalogProductDetail { id: number; code: string; name: string; composition: string | null; description: string | null; moq: number; size_system: string | null; sizes: string[]; colors: unknown; custom_margin_percent: number | null; is_active: boolean; catalog_id: number; collection_id: number | null; category_id: number | null; type_id: number | null; category: { label: string } | null; type: { label: string } | null; collection: { name: string } | null; catalog: { name: string } | null; images: { id: number; image_type: string; sort_order: number; files: { storage_path: string } | null }[] }

// ── Maliyet reçetesi (P4B.4) ────────────────────────────────────────────────
export interface CostRow { id: number; version: number; total_cost_try: number; total_cost_usd: number; rate_snapshot: unknown; notes: string | null; created_at: string; items: CostItemRow[] }
export interface CostItemRow { id: number; item_type: string; name: string; calculation_type: string; quantity: number | null; unit_price: number | null; amount: number | null; currency: string; fabric_name: string | null; sort_order: number }

/** Güncel maliyet + kalemler (costs.view yoksa RLS boş döner → null). */
export function useProductCost(productId: number | null) {
  return useQuery({
    queryKey: ['product-cost', productId], enabled: productId != null,
    queryFn: async (): Promise<CostRow | null> => {
      const { data } = await supabase.from('product_costs')
        .select('id, version, total_cost_try, total_cost_usd, rate_snapshot, notes, created_at, items:product_cost_items(id, item_type, name, calculation_type, quantity, unit_price, amount, currency, fabric_name, sort_order)')
        .eq('product_id', productId as number).eq('is_current', true).maybeSingle()
      if (!data) return null
      const c = data as unknown as CostRow
      c.items = (c.items ?? []).sort((a, b) => a.sort_order - b.sort_order)
      return c
    },
  })
}

export function useSaveProductCost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ productId, items, totalTry, totalUsd, rates, notes }:
      { productId: number; items: unknown[]; totalTry: number; totalUsd: number; rates: unknown; notes: string | null }) => {
      const { error } = await supabase.rpc('save_product_cost', { p_product_id: productId, p_items: items as never, p_total_try: totalTry, p_total_usd: totalUsd, p_rates: rates as never, p_notes: notes })
      if (error) throw error
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['product-cost', v.productId] }); qc.invalidateQueries({ queryKey: ['catalog-products'] }) },
  })
}

// ── Ürün ekle/düzenle (elle) ────────────────────────────────────────────────
export function useSaveCatalogProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...fields }: Record<string, unknown> & { id?: number }) => {
      if (id) ensureRows(await supabase.from('catalog_products').update(fields as never).eq('id', id).select('id'))
      else ensureRows(await supabase.from('catalog_products').insert(fields as never).select('id'))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog-products'] }),
  })
}

// ── Silme (yumuşak: deleted_at/by; fiziksel silme yok) ───────────────────────
/** Ürünü yumuşak siler; ilişkili maliyet/görsel korunur (listeden düşer). */
export function useDeleteCatalogProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data: { user } } = await supabase.auth.getUser()
      ensureRows(
        await supabase.from('catalog_products')
          .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
          .eq('id', id).is('deleted_at', null).select('id'),
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog-products'] })
      qc.invalidateQueries({ queryKey: ['catalog-pick-list'] })
    },
  })
}

/** Kataloğu yumuşak siler; ürünler DB'de kalır ama katalog listesinden düşer. */
export function useDeleteCatalog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data: { user } } = await supabase.auth.getUser()
      ensureRows(
        await supabase.from('catalogs')
          .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null } as never)
          .eq('id', id).is('deleted_at', null).select('id'),
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogs'] })
      qc.invalidateQueries({ queryKey: ['catalog-products'] })
    },
  })
}
