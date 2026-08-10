import { useMemo } from 'react'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { Input } from '@/components/ui/input'
import { DIAL_CODES, DEFAULT_DIAL } from '@/reference/dial-codes'

/**
 * Ülke kodu + numara girişi. Varsayılan Türkiye (+90); seçilen koda göre biçim
 * uygulanır. Değer E.164 birleşik string olarak yayınlanır (ör. "+905321234567");
 * normalizePhone bunu olduğu gibi kabul eder. Numara boşsa değer boş string.
 */

// Prefix eşleştirme için kodları uzunluğa göre azalan sırala (+90, +971 gibi).
const BY_LEN = [...DIAL_CODES].sort((a, b) => b.code.length - a.code.length)

/** Birleşik değeri (arama kodu + ulusal numara) parçalarına ayırır. */
function splitValue(value: string | null | undefined): { dial: string; national: string } {
  const v = (value ?? '').trim()
  if (!v) return { dial: DEFAULT_DIAL, national: '' }
  if (v.startsWith('+')) {
    const digits = '+' + v.slice(1).replace(/\D/g, '')
    const match = BY_LEN.find((d) => digits.startsWith(d.code) && digits.length > d.code.length)
      ?? BY_LEN.find((d) => digits.startsWith(d.code))
    if (match) return { dial: match.code, national: digits.slice(match.code.length) }
    return { dial: DEFAULT_DIAL, national: digits.replace(/\D/g, '') }
  }
  // + yoksa: varsayılan kod altında ulusal haneler.
  return { dial: DEFAULT_DIAL, national: v.replace(/\D/g, '') }
}

/** Ulusal haneleri okunur gruplar (TR: 3-3-2-2; diğer: 3'er). */
function groupNational(dial: string, digits: string): string {
  if (dial === '+90') {
    const d = digits.slice(0, 10)
    return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean).join(' ')
  }
  return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim()
}

/** Girişten ulusal haneleri çıkarır (TR'de baştaki 0 atılır). */
function cleanNational(dial: string, raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (dial === '+90') {
    digits = digits.replace(/^0+/, '').slice(0, 10)
  } else {
    digits = digits.slice(0, 15)
  }
  return digits
}

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  id?: string
  disabled?: boolean
  placeholder?: string
  'aria-invalid'?: boolean
}

export function PhoneInput({
  value,
  onChange,
  id,
  disabled,
  placeholder = 'Telefon',
  'aria-invalid': ariaInvalid,
}: PhoneInputProps) {
  const { dial, national } = useMemo(() => splitValue(value), [value])

  // Arama kodu seçenekleri (aynı kod birden çok ülkede olabilir → koda göre birleştir).
  const dialOpts = useMemo(() => {
    const byCode = new Map<string, string[]>()
    for (const d of DIAL_CODES) {
      const arr = byCode.get(d.code) ?? []
      arr.push(d.name)
      byCode.set(d.code, arr)
    }
    return [...byCode.entries()].map(([code, names]) => ({
      value: code,
      label: `${code} · ${names[0]}`,
      keywords: `${code} ${names.join(' ')}`,
    }))
  }, [])

  const emit = (nextDial: string, nextNational: string) => {
    onChange(nextNational ? `${nextDial}${nextNational}` : '')
  }

  return (
    <div className="flex gap-2">
      <div className="w-32 shrink-0">
        <SearchableSelect
          options={dialOpts}
          value={dial}
          onChange={(v) => emit(v ?? DEFAULT_DIAL, national)}
          searchPlaceholder="Ülke / kod…"
          disabled={disabled}
        />
      </div>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        disabled={disabled}
        aria-invalid={ariaInvalid}
        placeholder={placeholder}
        value={groupNational(dial, national)}
        onChange={(e) => emit(dial, cleanNational(dial, e.target.value))}
      />
    </div>
  )
}
