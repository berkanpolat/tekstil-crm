import { describe, it, expect } from 'vitest'
import { SELF } from 'cloudflare:test'

describe('POST /oturum', () => {
  it('jetonsuz isteği 401 ile reddeder', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/oturum', { method: 'POST' })
    expect(r.status).toBe(401)
    expect(r.headers.get('set-cookie')).toBeNull()
  })

  it('Bearer olmayan başlığı reddeder', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/oturum', {
      method: 'POST',
      headers: { authorization: 'Basic abc' },
    })
    expect(r.status).toBe(401)
  })

  it('bilinmeyen yolu 404 verir', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/olmayan')
    expect(r.status).toBe(404)
  })

  it('OPTIONS ön uçuşuna izinli kökeni yansıtır', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/oturum', {
      method: 'OPTIONS',
      headers: { origin: 'https://crm.tekstilas.com' },
    })
    expect(r.status).toBe(204)
    expect(r.headers.get('access-control-allow-origin')).toBe('https://crm.tekstilas.com')
    expect(r.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('izinsiz kökene CORS başlığı VERMEZ', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/oturum', {
      method: 'OPTIONS',
      headers: { origin: 'https://kotu.example' },
    })
    expect(r.headers.get('access-control-allow-origin')).toBeNull()
  })
})
