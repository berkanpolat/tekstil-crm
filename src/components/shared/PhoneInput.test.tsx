import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PhoneInput } from './PhoneInput'

describe('PhoneInput', () => {
  it('harf girişini reddeder (onChange harf yaymaz)', () => {
    const onChange = vi.fn()
    render(<PhoneInput value="" onChange={onChange} />)
    const input = screen.getByPlaceholderText('Telefon') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'sdasd' } })
    // Harfler ayıklandığı için ulusal numara boş → onChange boş string alır.
    expect(onChange).toHaveBeenLastCalledWith('')
    expect(input.value).not.toMatch(/[a-z]/i)
  })

  it('TR numarasını E.164 olarak yayar ve maskeler', () => {
    const onChange = vi.fn()
    const { rerender } = render(<PhoneInput value="" onChange={onChange} />)
    const input = screen.getByPlaceholderText('Telefon') as HTMLInputElement

    fireEvent.change(input, { target: { value: '5321234567' } })
    expect(onChange).toHaveBeenLastCalledWith('+905321234567')

    // Yayılan değeri geri besleyince okunur biçimde maskelenir.
    rerender(<PhoneInput value="+905321234567" onChange={onChange} />)
    expect((screen.getByPlaceholderText('Telefon') as HTMLInputElement).value).toBe('532 123 45 67')
  })
})
