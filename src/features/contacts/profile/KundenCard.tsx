import { Building2, ExternalLink } from 'lucide-react'
import type { Contact } from '@/domain/types'
import { safeHttpsUrl } from '@/domain/urls'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

export function KundenCard({ customers }: { customers: Contact['customers'] }) {
  const withUs = customers.filter((c) => c.withUs)
  const withoutUs = customers.filter((c) => !c.withUs)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Kunden</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <CustomerGroup title="Mit uns" customers={withUs} />
        <CustomerGroup title="Ohne uns (Potenzial)" customers={withoutUs} />
        {customers.length === 0 && (
          <p className="text-sm text-muted-foreground">Keine Kunden zugeordnet.</p>
        )}
      </CardContent>
    </Card>
  )
}

function CustomerGroup({
  title,
  customers,
}: {
  title: string
  customers: Contact['customers']
}) {
  if (customers.length === 0) return null
  return (
    <div className="space-y-1.5">
      <Label>{title}</Label>
      <div className="space-y-1.5">
        {customers.map((c) => {
          const sfUrl = safeHttpsUrl(c.salesforceUrl)
          return (
          <div
            key={c.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
          >
            <span className="inline-flex min-w-0 items-center gap-2 text-sm">
              <Building2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{c.name}</span>
            </span>
            {sfUrl && (
              <a
                href={sfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
              >
                Salesforce <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          )
        })}
      </div>
    </div>
  )
}
