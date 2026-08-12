import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useSession } from '@/app/SessionContext'
import { canApprove, ROLE_LABEL } from '@/domain/roles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { ChangePasswordCard } from './ChangePasswordCard'
import { RegionManagementCard } from './RegionManagementCard'

/** Eigenes Konto: Stammdaten der Anmeldung und Passwortwechsel. */
export function AccountPage() {
  const { user, email, canSwitchUser } = useSession()

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Übersicht
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Mein Konto</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Anmeldung</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-0.5">
            <Label>Name</Label>
            <p className="text-sm">{user.name}</p>
          </div>
          <div className="space-y-0.5">
            <Label>Rolle</Label>
            <p className="text-sm">{ROLE_LABEL[user.role]}</p>
          </div>
          <div className="space-y-0.5 sm:col-span-2">
            <Label>E-Mail</Label>
            <p className="text-sm">{email ?? '— (Demo-Modus ohne Anmeldung)'}</p>
          </div>
        </CardContent>
      </Card>

      {canSwitchUser ? (
        <Card>
          <CardContent className="pt-5 sm:pt-5">
            <p className="text-sm text-muted-foreground">
              Im Demo-Modus gibt es keine echte Anmeldung — ein Passwortwechsel ist deshalb nur in
              der angebundenen Installation möglich.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ChangePasswordCard email={email} />
      )}

      {/* Regionen-Selbstverwaltung — nur RM+ (canApprove). Serverseitig zusätzlich
          über RLS abgesichert (Migration 0029). */}
      {canApprove(user.role) && <RegionManagementCard />}
    </div>
  )
}
