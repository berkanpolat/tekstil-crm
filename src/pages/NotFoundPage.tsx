import { useNavigate } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'

/** 404 — bilinmeyen ya da (özellik bayrağıyla) kapalı bir rota. "Hazırlanıyor" yer tutucusu değil. */
export function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <EmptyState
      icon={FileQuestion}
      title="Sayfa bulunamadı"
      description="Aradığınız sayfa taşınmış, kaldırılmış ya da bu adres geçerli değil."
      action={<Button onClick={() => navigate('/')}>Gösterge paneline dön</Button>}
    />
  )
}
