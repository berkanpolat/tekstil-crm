/**
 * İş olayı tipleri — TEK doğruluk kaynağı. event_log.event_type ve log_event()
 * çağrıları serbest metin yerine bunları kullanır (P0.3). Yeni olay ekleyince
 * buraya ekleyin; kod tabanına string olarak dağıtmayın.
 *
 * Biçim: '<entity>.<action>' (küçük harf, nokta ile).
 */
export const EVENT_TYPES = {
  // Kullanıcı / çalışan
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_ACTIVATED: 'user.activated',
  USER_DEACTIVATED: 'user.deactivated',
  USER_PASSWORD_RESET: 'user.password_reset',
  USER_LOGGED_IN: 'user.logged_in',

  // Rol / yetki (P0.5)
  ROLE_ASSIGNED: 'role.assigned',
  PERMISSION_OVERRIDDEN: 'permission.overridden',

  // Organizasyon
  DEPARTMENT_CREATED: 'department.created',
  DEPARTMENT_UPDATED: 'department.updated',
  POSITION_CREATED: 'position.created',
  POSITION_UPDATED: 'position.updated',

  // Ayarlar (P0.6)
  SETTINGS_UPDATED: 'settings.updated',

  // Operasyon kodu (P0.8) — kod alanı doygunluğu erken uyarısı
  CODES_COLLISION_PRESSURE: 'codes.collision_pressure',

  // Potansiyel / Müşteri / Etkileşim (Faz 1) — timeline event_log'dan okur
  LEAD_CREATED: 'lead.created',
  LEAD_STATUS_CHANGED: 'lead.status_changed',
  LEAD_ASSIGNED: 'lead.assigned',
  LEAD_CONVERTED: 'lead.converted',
  CUSTOMER_CREATED: 'customer.created',
  CUSTOMER_STATUS_CHANGED: 'customer.status_changed',
  CUSTOMER_ASSIGNED: 'customer.assigned',
  INTERACTION_LOGGED: 'interaction.logged',
  INTERACTION_REMOVED: 'interaction.removed',
  TAG_ADDED: 'tag.added',
  TAG_REMOVED: 'tag.removed',
  NOTE_ADDED: 'note.added',
  NOTE_REMOVED: 'note.removed',
  FILE_ADDED: 'file.added',
  FILE_REMOVED: 'file.removed',
  // Mükerrer eşiği izleme: uyarıya rağmen kayıt oluşturuldu (Faz 7'de eşik ayarı)
  DEDUP_OVERRIDDEN: 'dedup.overridden',
} as const

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES]
