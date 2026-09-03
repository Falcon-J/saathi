"use client"

import { useRef, useState } from "react"
import { FileUp, Loader2 } from "lucide-react"
import { importTasksFromCsv } from "@/app/actions/migration"
import { Button } from "@/components/ui/button"
import { useNotifications } from "@/hooks/use-notifications"

interface TaskImportProps {
  workspaceId: string
  onImported: () => Promise<void> | void
}

export function TaskImport({ workspaceId, onImported }: TaskImportProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)
  const { success, warning, error } = useNotifications()

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    setIsImporting(true)
    try {
      const result = await importTasksFromCsv(workspaceId, await file.text())
      if ("error" in result) {
        error("Import failed", result.error)
        return
      }

      if (result.imported > 0) {
        await onImported()
      }

      const failedMessage = result.failed > 0
        ? ` ${result.failed} row${result.failed === 1 ? "" : "s"} could not be imported.`
        : ""
      const description = `${failedMessage}${result.errors.slice(0, 3).map((rowError) => ` Row ${rowError.row}: ${rowError.message}`).join("")}`.trim()
      if (result.failed > 0) {
        warning(`${result.imported} task${result.imported === 1 ? "" : "s"} imported with warnings`, description || "Some rows could not be imported.")
      } else {
        success(`${result.imported} task${result.imported === 1 ? "" : "s"} imported`, description || "The board is up to date.")
      }
    } catch (caughtError) {
      error("Import failed", "The CSV could not be imported.")
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
        title="Import tasks from a CSV file"
        aria-describedby="task-import-help"
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
      <span id="task-import-help" className="sr-only">Import up to 100 tasks with title, description, priority, due date, due time, estimate in minutes, and assignee email columns.</span>
    </>
  )
}
