import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { useCurrentUser } from '@/hooks/useCurrentUser'

/**
 * Oturum HAZIR ve kullanıcı AKTİF mi?
 *
 * Yalnız `session` yetmez: soğuk açılışta `getSession()` süresi dolmuş bir
 * access token döndürebilir; token yenilenmeden giden ilk istek PostgREST'te
 * anon/expired olarak değerlendirilir → RLS `is_active_user()` false → 0 satır.
 * `useCurrentUser` içindeki `getUser()` token'ı sunucuda doğrular; kullanıcı
 * satırı non-null gelince token geçerli VE kullanıcı bilinir demektir.
 */
export function useSessionReady(): boolean {
  const { session, loading } = useAuth()
  const { data: user, isLoading } = useCurrentUser()
  return !loading && !!session && !isLoading && !!user
}

/**
 * RLS'e bağlı referans/lookup sorguları için ortak sarmalayıcı.
 *
 * Kök sorun (sınıf hatası): oturum kurulmadan çalışan bir referans sorgusu,
 * PAYLAŞILAN STATİK query key'e 0-satır sonucu yazar; `staleTime` penceresi
 * boyunca aynı key'i kullanan tüm tüketiciler o boşluğu alır (dropdown boş,
 * yeni istek gitmez). Çözüm: oturum hazır+kullanıcı aktif olana kadar sorguyu
 * GÖNDERME (`enabled=false`). Böylece boş sonuç hiç önbelleğe girmez.
 *
 * Var olan `enabled` ile AND'lenir (ör. `enabled: id != null`).
 */
export function useReferenceQuery<TQueryFnData = unknown, TError = Error, TData = TQueryFnData>(
  options: UseQueryOptions<TQueryFnData, TError, TData>,
): UseQueryResult<TData, TError> {
  const ready = useSessionReady()
  return useQuery({
    ...options,
    enabled: ready && (options.enabled ?? true),
  })
}
