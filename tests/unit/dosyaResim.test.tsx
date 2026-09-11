import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DosyaResim } from '@/components/shared/DosyaResim'

// vi.mock hoist edilir; fabrikanın gördüğü değişken vi.hoisted ile kurulmalı.
const { tazele } = vi.hoisted(() => ({ tazele: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/dosyaOturum', () => ({ oturumTazele: tazele }))

beforeEach(() => tazele.mockClear())

describe('DosyaResim', () => {
  it('yol yoksa yer tutucu gösterir', () => {
    render(<DosyaResim path={null} alt="kumaş" />)
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('yol yoksa ve yerTutucu verilmemişse varsayılan ikonu gösterir', () => {
    const { container } = render(<DosyaResim path={null} alt="kumaş" />)
    expect(container.querySelector('.lucide-image-off')).not.toBeNull()
  })

  it('yol yoksa ve yerTutucu verilmişse onu gösterir', () => {
    render(<DosyaResim path={null} alt="kumaş" yerTutucu={<span data-testid="ozel-yer-tutucu">boş</span>} />)
    expect(screen.getByTestId('ozel-yer-tutucu')).not.toBeNull()
  })

  it('adresi genişlikle kurar', () => {
    render(<DosyaResim path="image/a.jpg" alt="kumaş" genislik={400} />)
    expect(screen.getByRole('img').getAttribute('src')).toContain('w=480')
  })

  it('ilk hatada oturumu tazeleyip bir kez daha dener', async () => {
    render(<DosyaResim path="image/a.jpg" alt="kumaş" />)
    fireEvent.error(screen.getByRole('img'))
    await waitFor(() => expect(tazele).toHaveBeenCalledTimes(1))
    // İkinci deneme adresi tazeleme damgasıyla ayrışır.
    expect(screen.getByRole('img').getAttribute('src')).toContain('tz=')
  })

  it('ikinci hatada pes eder ve tekrar tazelemez', async () => {
    render(<DosyaResim path="image/a.jpg" alt="kumaş" />)
    fireEvent.error(screen.getByRole('img'))
    await waitFor(() => expect(tazele).toHaveBeenCalledTimes(1))
    fireEvent.error(screen.getByRole('img'))
    await waitFor(() => expect(screen.queryByRole('img')).toBeNull())
    expect(tazele).toHaveBeenCalledTimes(1)
  })
})
