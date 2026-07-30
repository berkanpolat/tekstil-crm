import { FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import type { DocumentTypeKey } from '@/hooks/useDocuments'

const LABEL: Record<DocumentTypeKey, string> = {
  fiyat_teklifi: 'Fiyat teklifi hazırla', siparis_onay: 'Sipariş onay formu hazırla',
  numune_etiketi: 'Numune etiketi hazırla', siparis_formu: 'Sipariş formu hazırla', koli_ustu: 'Koli üstü etiketi hazırla',
}

/**
 * Tam sayfa belge editörünü açar (P4A.4): /belgeler/yeni/:tip?op=<operasyon>.
 * Editörde sistem bilinen alanları doldurur → kullanıcı tamamlar → canlı önizleme →
 * onayda sunucuda birebir PDF üretilir.
 */
export function GenerateDocButton({ operationId, typeKey, variant = 'default', size = 'sm' }:
  { operationId: number; typeKey: DocumentTypeKey; variant?: 'default' | 'outline'; size?: 'sm' | 'default' }) {
  const navigate = useNavigate()
  return (
    <Button variant={variant} size={size} onClick={() => navigate(`/belgeler/yeni/${typeKey}?op=${operationId}`)}>
      <FileText className="size-4" /> {LABEL[typeKey]}
    </Button>
  )
}
