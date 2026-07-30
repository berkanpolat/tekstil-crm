import type { ReferenceTable } from '@/hooks/useReference'

export interface ReferenceConfig {
  table: ReferenceTable
  title: string
  description: string
  addLabel: string
  hasColor?: boolean
  hasPositive?: boolean
  hasClosed?: boolean
}

/** Satış Tanımları alt sayfaları (slug → config). */
export const REFERENCE_CONFIGS: Record<string, ReferenceConfig> = {
  kanallar: {
    table: 'interaction_channels',
    title: 'İletişim Kanalları',
    description: 'Etkileşimlerde kullanılan kanallar.',
    addLabel: 'Kanal ekle',
    hasColor: true,
  },
  sonuclar: {
    table: 'interaction_outcomes',
    title: 'Etkileşim Sonuçları',
    description: 'Görüşme sonuçları (olumlu bayrağı raporlamada kullanılır).',
    addLabel: 'Sonuç ekle',
    hasColor: true,
    hasPositive: true,
  },
  kaynaklar: {
    table: 'lead_sources',
    title: 'Potansiyel Kaynakları',
    description: 'Potansiyellerin geldiği kaynaklar.',
    addLabel: 'Kaynak ekle',
  },
  durumlar: {
    table: 'lead_statuses',
    title: 'Potansiyel Durumları',
    description: 'Potansiyel yaşam döngüsü durumları.',
    addLabel: 'Durum ekle',
    hasColor: true,
    hasClosed: true,
  },
  etiketler: {
    table: 'tags',
    title: 'Etiketler',
    description: 'Potansiyel ve müşterilere eklenebilen etiketler.',
    addLabel: 'Etiket ekle',
    hasColor: true,
  },
  'musteri-turleri': {
    table: 'customer_types',
    title: 'Müşteri Türleri',
    description: 'Yurtiçi / İhracat gibi müşteri türleri.',
    addLabel: 'Tür ekle',
  },

  // --- Operasyon Tanımları (Faz 3) ---
  asamalar: { table: 'operation_stages', title: 'Operasyon Aşamaları', description: 'Boru hattı aşamaları (talep→teslimat). Sıra ve renk aşama göstergesini besler.', addLabel: 'Aşama ekle', hasColor: true },
  'talep-durumlari': { table: 'request_statuses', title: 'Talep Durumları', description: 'Talep yaşam döngüsü durumları.', addLabel: 'Durum ekle', hasColor: true, hasClosed: true },
  'teklif-durumlari': { table: 'quote_statuses', title: 'Teklif Durumları', description: 'Teklif yaşam döngüsü durumları.', addLabel: 'Durum ekle', hasColor: true, hasClosed: true },
  'numune-durumlari': { table: 'sample_statuses', title: 'Numune Durumları', description: 'Numune yaşam döngüsü durumları.', addLabel: 'Durum ekle', hasColor: true, hasClosed: true },
  'siparis-durumlari': { table: 'order_statuses', title: 'Sipariş Durumları', description: 'Sipariş yaşam döngüsü durumları.', addLabel: 'Durum ekle', hasColor: true, hasClosed: true },
  'talep-kanallari': { table: 'request_channels', title: 'Talep Kanalları', description: 'Taleplerin geldiği kanallar (rapor: kanal ağırlıkları).', addLabel: 'Kanal ekle', hasColor: true },
  'iptal-nedenleri': { table: 'cancellation_reasons', title: 'İptal Nedenleri', description: 'Operasyon iptal gerekçeleri.', addLabel: 'Neden ekle' },
  'red-nedenleri': { table: 'quote_rejection_reasons', title: 'Teklif Red Nedenleri', description: 'Teklif reddi gerekçeleri.', addLabel: 'Neden ekle' },
  'odeme-kosullari': { table: 'payment_terms', title: 'Ödeme Koşulları', description: 'Teklif ve siparişlerde ödeme koşulları.', addLabel: 'Koşul ekle' },
}
