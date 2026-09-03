// P4A.8 — Belge çeviri sözlüğü (TR → EN). Fiyat teklifinde native (tkS.dil='en').
// Diğer dört belgede (sipariş onay/formu, numune, koli) TR literalleri gömülü
// olduğundan, render sonrası HTML'de string ikamesiyle çevrilir. En uzun ifade
// önce uygulanır (kısmi çakışma olmasın). Tasarım bozulmaz — yalnızca metin değişir.
//
// NOT: Bu sözlük render'ın çalıştığı SERVİSTE yaşar (çeviri render sonrası uygulanır).
// Frontend'in ihtiyacı yoktur. Yeni etiket eklenirse buraya eklenir.

// [tr, en] — sıra önemsiz; uzunluğa göre otomatik sıralanır.
const PAIRS = [
  // Başlıklar
  ['SİPARİŞ ONAY FORMU', 'ORDER CONFIRMATION FORM'],
  ['SİPARİŞ FORMU', 'ORDER FORM'],
  ['ÜRETİM NUMUNESİ', 'PRODUCTION SAMPLE'],
  ['Üretim Sipariş Belgesi', 'Production Order Document'],
  ['ÜRETİM · QUOTATION', 'PRODUCTION · QUOTATION'],
  // Bölüm başlıkları
  ['Firma Bilgileri', 'Company Information'],
  ['Üretim Detayları', 'Production Details'],
  ['Fiyat ve Termin', 'Price & Lead Time'],
  ['Sipariş Künyesi', 'Order Summary'],
  ['Ürün Bilgileri', 'Product Information'],
  ['Bakım Talimatları', 'Care Instructions'],
  ['Barkod Listesi', 'Barcode List'],
  ['Fiyatlandırma', 'Pricing'],
  // İş akışı (sipariş onay) — kaynak KARIŞIK harf (CSS uppercase görsel)
  ['Üretim ve Onay İş Akışı (Lütfen Okuyunuz)', 'Production & Approval Workflow (Please Read)'],
  ['Değerli müşterimiz, üretim sürecinizi en hızlı ve kaliteli şekilde tamamlayabilmemiz için aşağıdaki standart iş akışımızı bilgilerinize sunarız:',
   'Dear customer, to complete your production process as fast and with the highest quality, we present our standard workflow below for your information:'],
  ['Öngörülen Teslimat Süresi', 'Estimated Lead Time'],
  ['(otomatik)', '(automatic)'],
  ['Teklif Geçerlilik Süresi:', 'Quotation Validity:'],
  ['Yukarıda belirtilen birim fiyat ve üretim termin süresi, formun düzenlendiği tarihten itibaren 7 gün boyunca geçerlidir.',
   'The unit price and production lead time stated above are valid for 7 days from the date this form was issued.'],
  ['Numune Değerlendirme:', 'Sample Review:'],
  ['Tarafınıza iletilen numunelerin değerlendirme ve revize dönüş süresi 3 iş günüdür. Zamanında ve eksiksiz üretim yapabilmemiz için bu süre zarfında geri dönüşünüzü rica ederiz.',
   'The review and revision turnaround time for the samples sent to you is 3 business days. To ensure timely and complete production, we kindly ask for your feedback within this period.'],
  ['Revize Standartları:', 'Revision Standards:'],
  ['Üretim takviminde sarkma olmaması ve istediğiniz sonuca en hızlı şekilde ulaşabilmemiz için ilk 2 numune revizesi standart akışımıza dahildir.',
   'To avoid delays in the production schedule and to reach your desired result as fast as possible, the first 2 sample revisions are included in our standard workflow.'],
  ['Teslimat Tarihinin Güncellenmesi:', 'Delivery Date Update:'],
  ['Numune onay sürecinde (revize talepleri, kargo süreleri veya geç dönüşler sebebiyle) yaşanabilecek uzamalar, yukarıda belirtilen teslimat tarihini doğrudan güncelleyecektir.',
   'Any extension during the sample approval process (due to revision requests, shipping times or late responses) will directly update the delivery date stated above.'],
  ['Seri Üretime Geçiş:', 'Bulk Production Start:'],
  ['Tüm detaylar içinize sindiğinde, tarafınıza iletilen son numune üzerindeki “Üretim Onay Kartı”nın onaylanması (imza/kaşe veya yazılı teyit) ile birlikte seri üretim sürecimiz resmen başlayacaktır. Onay kartı teyit edilmeden seri üretime başlanamamaktadır.',
   'Once you are fully satisfied with all details, bulk production officially begins upon approval of the “Production Approval Card” on the final sample sent to you (signature/stamp or written confirmation). Bulk production cannot start until the approval card is confirmed.'],
  ['İptal Durumu:', 'Cancellation:'],
  ['Sipariş sürecinde iptal edilen ürünler için hazırlanan numunelerin bedeli tahsil edilir.',
   'The cost of samples prepared for products cancelled during the order process will be charged.'],
  ['Üretim detaylarını ve iş akışını onaylıyorum.', 'I approve the production details and workflow.'],
  ['İmza / Marka Kaşesi · Tarih:', 'Signature / Brand Stamp · Date:'],
  ['Ad / Soyad:', 'Name / Surname:'],
  ['Unvan:', 'Title:'],
  ['E-posta:', 'E-mail:'],
  // Alan etiketleri (uzun → kısa)
  ['Toplam Sipariş Adedi', 'Total Order Qty'],
  ['Öngörülen Teslim Süresi', 'Estimated Lead Time'],
  ['Öngörülen Toplam Tutar', 'Estimated Total'],
  ['Müşteri / Marka Onayı', 'Customer / Brand Approval'],
  ['Ürün Cinsi / Modeli', 'Product Type / Model'],
  ['Beden Seti (Dağılımı)', 'Size Set (Distribution)'],
  ['Müşteri / Marka', 'Customer / Brand'],
  ['Kumaş Detayı', 'Fabric Details'],
  ['Yetkili Kişi', 'Contact Person'],
  ['Vergi Dairesi', 'Tax Office'],
  ['Belge / Form No', 'Document No'],
  ['Düzenleme Tarihi', 'Issue Date'],
  ['Değişiklik Tarihi', 'Revision Date'],
  ['Kaşe / İmza', 'Stamp / Signature'],
  ['Ad / Soyad', 'Name / Surname'],
  ['Beden Sistemi', 'Size System'],
  ['Ürün Grubu', 'Product Group'],
  ['Ürün Türü', 'Product Type'],
  ['Ürün Kodu', 'Product Code'],
  ['Genel Toplam', 'Grand Total'],
  ['Toplam Adet', 'Total Qty'],
  ['Birim Fiyat', 'Unit Price'],
  ['Ödeme Şekli', 'Payment Terms'],
  ['Renk / Kod', 'Color / Code'],
  ['Yorum / Not', 'Comment / Note'],
  ['Sipariş No', 'Order No'],
  ['Kompozisyon', 'Composition'],
  ['Vergi No', 'Tax ID'],
  ['Üretici', 'Manufacturer'],
  ['Alıcı', 'Buyer'],
  ['Renkler', 'Colors'],
  ['Renk / Beden', 'Color / Size'],
  ['Toplam', 'Total'],
  ['Adres', 'Address'],
  ['Tarih', 'Date'],
  ['Renk', 'Color'],
  ['Beden', 'Size'],
  // Koli etiketi (büyük harf)
  ['KOLİ NUMARASI', 'CARTON NO'],
  ['KOLİ İÇERİĞİ', 'CARTON CONTENTS'],
  ['KOLİ İÇİ ÜRÜN ADETİ', 'UNITS PER CARTON'],
  ['KOLİ AĞIRLIĞI', 'CARTON WEIGHT'],
  ['TESLİM ADRESİ', 'DELIVERY ADDRESS'],
  ['MÜŞTERİ ADI', 'CUSTOMER NAME'],
  ['MÜŞTERİ', 'CUSTOMER'],
  ['ÜRÜN KODU', 'PRODUCT CODE'],
  ['BEDEN', 'SIZE'],
  ['RENK', 'COLOR'],
  ['KOLİ', 'CARTON'],
  // Kalite/taşıma rozetleri (koli)
  ['KALİTE KONTROLÜ YAPILMIŞTIR', 'QUALITY CHECKED'],
  ['YERLİ ÜRETİM', 'LOCAL PRODUCTION'],
  ['TEKSTİL ÜRÜNÜDÜR', 'TEXTILE PRODUCT'],
  ['TEKSTİL A.Ş. GÜVENCESİYLE HAZIRLANDI', 'PREPARED WITH TEKSTİL A.Ş. ASSURANCE'],
  ['Her aşamada kalite, her detayda özen.', 'Quality at every step, care in every detail.'],
  ['Kaliteye Dokun,', 'Touch Quality,'],
  ['Güvene Taşı', 'Carry Trust'],
  ['YUKARI', 'THIS WAY UP'],
  ['KURU TUTUNUZ', 'KEEP DRY'],
  ['DİKKATLİ TAŞIYINIZ', 'HANDLE WITH CARE'],
  // Termin cümlesi (sipariş onay)
  ['Numune onayından itibaren', 'from sample approval,'],
  ['iş günü', 'business days'],
  // Numune etiketi (zaten MÜŞTERİ ADI/ÜRÜN KODU/BEDEN/RENK yukarıda)
]

// Uzun ifade önce (kısmi çakışma olmasın). render.mjs bunu tarayıcıya geçirir.
export const EN_PAIRS = [...PAIRS].sort((a, b) => b[0].length - a[0].length)

export function applyEnglish(html) {
  let out = html
  for (const [tr, en] of EN_PAIRS) out = out.split(tr).join(en)
  return out
}
