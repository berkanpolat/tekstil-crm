import { useState } from 'react'
import { Loader2, UserRoundCheck } from 'lucide-react'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormField } from '@/components/shared/FormField'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useConvertLead } from '@/hooks/useLeads'
import { useCustomerTypeOptions } from '@/hooks/useCustomers'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadId: number
  leadTitle: string
  onConverted: (customerId: number) => void
}

export function ConvertLeadDialog({ open, onOpenChange, leadId, leadTitle, onConverted }: Props) {
  const types = useCustomerTypeOptions()
  const convert = useConvertLead()
  const [typeId, setTypeId] = useState<string | null>(null)
  const [taxOffice, setTaxOffice] = useState('')
  const [taxNumber, setTaxNumber] = useState('')
  const [iban, setIban] = useState('')

  async function submit() {
    if (!typeId) {
      toast.error('Müşteri türü (Yurtiçi/İhracat) seçin.')
      return
    }
    try {
      const customerId = await convert.mutateAsync({
        leadId,
        customerTypeId: Number(typeId),
        taxOffice: taxOffice.trim() || null,
        taxNumber: taxNumber.trim() || null,
        iban: iban.trim() || null,
      })
      toast.success('Müşteriye dönüştürüldü.')
      onConverted(customerId)
    } catch (err) {
      toast.error(await toUserMessage(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Müşteriye dönüştür</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{leadTitle}</span> müşteriye dönüşecek. Tüm etkileşim,
            not, etiket, dosya ve zaman çizelgesi müşteriye taşınır; potansiyel arşiv kaydı olur.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FormField label="Müşteri türü" required hint="İhracat belgelerinde kullanılır; sonradan değiştirilebilir.">
            {(p) => (
              <SearchableSelect
                id={p.id}
                options={(types.data ?? []).map((t) => ({ value: String(t.id), label: t.label }))}
                value={typeId}
                onChange={setTypeId}
                placeholder="Yurtiçi / İhracat seç"
              />
            )}
          </FormField>

          <p className="text-text-muted text-xs">Ticari bilgiler (opsiyonel — şimdi ya da sonra):</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Vergi dairesi">
              {(p) => <Input {...p} value={taxOffice} onChange={(e) => setTaxOffice(e.target.value)} />}
            </FormField>
            <FormField label="Vergi numarası">
              {(p) => <Input {...p} value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} />}
            </FormField>
          </div>
          <FormField label="IBAN">
            {(p) => <Input {...p} value={iban} onChange={(e) => setIban(e.target.value)} />}
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={convert.isPending}>
            Vazgeç
          </Button>
          <Button onClick={() => void submit()} disabled={convert.isPending || !typeId}>
            {convert.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserRoundCheck className="size-4" />}
            Dönüştür
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
