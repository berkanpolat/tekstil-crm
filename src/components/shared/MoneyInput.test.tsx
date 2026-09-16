import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MoneyInput } from './MoneyInput'

describe('MoneyInput', () => {
  it('harfleri reddeder (yalnız rakam + ayıraç kalır)', () => {
    const onValueChange = vi.fn()
    render(<MoneyInput value={null} onValueChange={onValueChange} />)
    const input = screen.getByRole('textbox') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'sdasd' } })
    expect(input.value).toBe('') // harfler ayıklandı
    expect(onValueChange).toHaveBeenLastCalledWith(null)
  })

  it('harf + sayı karışımından sayıyı çıkarır', () => {
    const onValueChange = vi.fn()
    render(<MoneyInput value={null} onValueChange={onValueChange} />)
    const input = screen.getByRole('textbox') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'abc12,50xyz' } })
    expect(input.value).toBe('12,50')
    expect(onValueChange).toHaveBeenLastCalledWith(12.5)
  })
})
