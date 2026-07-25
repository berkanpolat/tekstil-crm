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
} as const

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES]
