"use client"

import { useRef, useState } from "react"
import { FileUp, Loader2 } from "lucide-react"
import { importTasksFromCsv } from "@/app/actions/migration"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

interface TaskImportProps {
  workspaceId: string
  onImported: () => Promise<void> | void
}

export function TaskImport({ workspaceId, onImported }: TaskImportProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)
  const { toast } = useToast()

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    setIsImporting(true)
    try {
      const result = await importTasksFromCsv(workspaceId, await file.text())
      if ("error" in result) {
        toast({ title: "Import failed", description: result.error, variant: "destructive" })
        return
      }

      if (result.imported > 0) {
        await onImported()
      }

      const failedMessage = result.failed > 0
        ? ` ${result.failed} row${result.failed === 1 ? "" : "s"} could not be imported.`
        : ""
      toast({
        title: `${result.imported} task${result.imported === 1 ? "" : "s"} imported`,
        description: `${failedMessage}${result.errors.slice(0, 3).map((error) => ` Row ${error.row}: ${error.message}`).join("")}`.trim(),
        variant: result.failed > 0 ? "destructive" : undefined,
      })
    } catch (error) {
      toast({ title: "Import failed", description: "The CSV could not be imported.", variant: "destructive" })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={isImporting}
        className="w-full sm:w-auto"
      >
        {isImporting ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
        Import CSV
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileChange}
        className="sr-only"
        tabIndex={-1}
        aria-label="Import tasks from CSV"
      />
    </>
  )
}
