import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { parseDecimal, decimalToText } from '@/lib/money'

interface MoneyInputProps {
  /** Sayısal değer (dışarıdan). Kullanıcı yazarken iç tampon kullanılır. */
  value: number | null | undefined
  /** Her değişimde ayrıştırılmış sayı (veya null). */
  onValueChange: (n: number | null) => void
  placeholder?: string
  className?: string
  id?: string
  disabled?: boolean
}

/**
 * Para/ondalık girişi — hem virgül hem nokta kabul eder (TR klavye uyumlu).
 * `type="number"` YERİNE metin + inputMode=decimal: tarayıcı virgülü reddetmez.
 * İç metin tamponu kullanıcı serbestçe yazsın diye; onValueChange ayrıştırılmış
 * sayıyı verir, blur'da metni normalize eder.
 */
export function MoneyInput({ value, onValueChange, placeholder, className, id, disabled }: MoneyInputProps) {
  const [text, setText] = useState<string>(() => decimalToText(value ?? null))
  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      className={className}
      disabled={disabled}
      value={text}
      placeholder={placeholder ?? '0,00'}
      onChange={(e) => {
        // Yalnız rakam, ayıraç, işaret; gerisini yok say (harf vs.).
        const cleaned = e.target.value.replace(/[^\d.,-]/g, '')
        setText(cleaned)
        onValueChange(parseDecimal(cleaned))
      }}
      onBlur={() => setText(decimalToText(parseDecimal(text)))}
    />
  )
}
