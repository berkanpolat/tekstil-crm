// Tekstil A.Ş. — Dosya Servisi (Cloudflare Worker + R2).
// Uçlar Görev 2 ve 3'te eklenir.
export default {
  async fetch() {
    return new Response('tekstil-dosya', { status: 200 })
  },
}
