import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface CurrentUser {
  id: string
  email: string
  full_name: string
  phone: string | null
  department_name: string | null
  role_key: string | null
  must_change_password: boolean
  avatar_file_id: number | null
}

/**
 * Oturumdaki kullanıcıyı (public.users + departman + rol) döner. Oturum yoksa null.
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
        .select(
          'id, email, full_name, phone, avatar_file_id, must_change_password, departments(name), roles(key)',
        )
        .eq('id', user.id)
        .maybeSingle()
      if (error || !data) return null

      const dept = data.departments as { name: string } | null
      const role = data.roles as { key: string } | null
      return {
        id: data.id,
        email: data.email,
        full_name: data.full_name,
        phone: data.phone,
        department_name: dept?.name ?? null,
        role_key: role?.key ?? null,
        must_change_password: data.must_change_password,
        avatar_file_id: data.avatar_file_id,
      }
    },
  })
}
