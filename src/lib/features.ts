/**
 * Özellik bayrakları — UI SADELEŞTİRME (PAKET G). "Gizle, silme" ilkesi.
 *
 * false → ilgili menü/rota/bileşen render EDİLMEZ; tablolar/RPC/trigger/veri OLDUĞU GİBİ kalır,
 * arka plan (auto-task, debt/status sync, account_transactions/payments) çalışmaya devam eder,
 * yetkiler (finance.view/goals/tasks) kaldırılmaz. true yapınca her şey aynen geri gelir.
 *
 * Tek aç/kapa noktası burasıdır.
 */
export const features = {
  goals: false,    // Hedefler
  tasks: false,    // Görevler (menü + ekranlar; otomatik görev motoru + "Sıradaki aksiyon" bağımsız çalışır)
  finance: false,  // Finans: cari hesap, ödemeler, ekstre, finans raporu, ön-ödeme paneli
  // PAKET H — Süreç sadeleştirme: ayrı Teklifler/Numuneler/Siparişler modülleri gizli.
  // Tüm süreç tek "Talepler" listesi + talep içi "Süreç" panelinden yürür. Tablolar/RPC/veri durur.
  quotesPanel: false,   // Teklifler menüsü + /teklifler
  samplesPanel: false,  // Numuneler menüsü + /numuneler
  ordersPanel: false,   // Siparişler menüsü + /siparisler
} as const

export type FeatureKey = keyof typeof features
