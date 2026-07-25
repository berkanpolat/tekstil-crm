import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface CurrentUser {
  id: string
  email: string
  full_name: string
  department_name: string | null
  avatar_file_id: number | null
}

/**
 * Oturumdaki kullanıcıyı (public.users + departman adı) döner. Oturum yoksa null.
 * Faz 0'da kimlik ekranları henüz bağlı değil; bu hook girişten sonra kullanılacak.
 */
export function useCurrentUser() {
  return useQuery<CurrentUser | null>({
    queryKey: ['current-user'],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return null

      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, avatar_file_id, departments(name)')
        .eq('id', user.id)
        .maybeSingle()
      if (error || !data) return null

      const dept = data.departments as { name: string } | null
      return {
        id: data.id,
        email: data.email,
        full_name: data.full_name,
        department_name: dept?.name ?? null,
        avatar_file_id: data.avatar_file_id,
      }
    },
  })
}
