"use client"

import { useCallback, useEffect, useState } from "react"
import { BarChart3, RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { WorkspaceUsage } from "@/lib/usage"

interface UsageSummaryProps {
  workspaceId: string
  refreshToken: string
}

export function UsageSummary({ workspaceId, refreshToken }: UsageSummaryProps) {
  const [usage, setUsage] = useState<WorkspaceUsage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadUsage = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/usage?workspaceId=${encodeURIComponent(workspaceId)}`, {
        credentials: "include",
        cache: "no-store",
      })
      const result = await response.json() as { usage?: WorkspaceUsage; error?: string }
      if (!response.ok || !result.usage) {
        throw new Error(result.error || "Unable to load usage")
      }
      setUsage(result.usage)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load usage")
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void loadUsage()
  }, [loadUsage, refreshToken])

  return (
    <Card className="saathi-panel rounded-[var(--saathi-radius-card)] border-border">
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart3 className="size-5 text-primary" />
          Usage
        </CardTitle>
        <CardDescription>Small signals for team activation.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading usage...</p>
        ) : error ? (
          <div role="alert">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => void loadUsage()} variant="outline" size="sm" className="mt-3">
              <RefreshCw className="size-4" />
              Try again
            </Button>
          </div>
        ) : usage ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-[var(--saathi-radius-card)] border border-border p-3">
              <dt className="text-muted-foreground">Tasks created</dt>
              <dd className="mt-1 text-xl font-semibold">{usage.taskCreated}</dd>
            </div>
            <div className="rounded-[var(--saathi-radius-card)] border border-border p-3">
              <dt className="text-muted-foreground">Tasks completed</dt>
              <dd className="mt-1 text-xl font-semibold">{usage.taskCompleted}</dd>
            </div>
            <div className="rounded-[var(--saathi-radius-card)] border border-border p-3">
              <dt className="text-muted-foreground">Members added</dt>
              <dd className="mt-1 text-xl font-semibold">{usage.memberAdded}</dd>
            </div>
            <div className="rounded-[var(--saathi-radius-card)] border border-border p-3">
              <dt className="text-muted-foreground">Contributors</dt>
              <dd className="mt-1 text-xl font-semibold">{usage.contributors}</dd>
            </div>
          </dl>
        ) : null}
      </CardContent>
    </Card>
  )
}
