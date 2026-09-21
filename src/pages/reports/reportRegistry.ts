import { Inbox, FileText, Workflow, Wallet, Users, LayoutDashboard } from 'lucide-react'
import type { ReportProps } from '@/components/reports/ReportKit'
import { TalepRaporu, TeklifRaporu, DonusumRaporu, FinansRaporu, EkipRaporu } from './ReportBodies'
import { GenelRaporu } from './GenelRaporu'

export interface ReportDef { key: string; label: string; icon: typeof Inbox; permission?: string; Component: (p: ReportProps) => React.ReactElement }

export const REPORTS: ReportDef[] = [
  { key: 'genel', label: 'Genel Rapor', icon: LayoutDashboard, Component: GenelRaporu },
  { key: 'talep', label: 'Talep', icon: Inbox, Component: TalepRaporu },
  { key: 'teklif', label: 'Teklif', icon: FileText, Component: TeklifRaporu },
  { key: 'donusum', label: 'Dönüşüm Hunisi', icon: Workflow, Component: DonusumRaporu },
  { key: 'finans', label: 'Finans', icon: Wallet, permission: 'finance.view', Component: FinansRaporu },
  { key: 'ekip', label: 'Ekip & Etkileşim', icon: Users, Component: EkipRaporu },
]
