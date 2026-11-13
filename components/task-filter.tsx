"use client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { X, Search } from "lucide-react"
import type { Member } from "@/app/actions/workspaces"

interface TaskFilterProps {
  compactToolbar?: boolean
  onClearFilters?: () => void
  onSearchChange: (query: string) => void
  onFilterByAssignee: (memberId: string | null) => void
  onFilterByStatus: (status: "all" | "active" | "completed") => void
  onFilterByPriority: (priority: "all" | "low" | "medium" | "high") => void
  members: Member[]
  searchQuery: string
  selectedAssignee: string | null
  selectedStatus: "all" | "active" | "completed"
  selectedPriority: "all" | "low" | "medium" | "high"
}

export function TaskFilter({
  onSearchChange,
  onFilterByAssignee,
  onFilterByStatus,
  onFilterByPriority,
  members,
  searchQuery,
  selectedAssignee,
  selectedStatus,
  selectedPriority,
  compactToolbar = false,
  onClearFilters,
}: TaskFilterProps) {
  const activeCount = Number(selectedStatus !== "all") + Number(selectedPriority !== "all") + Number(Boolean(selectedAssignee))
  const filters = (
      <div className="flex flex-wrap gap-2">
        {/* Status Filter */}
        <div className="flex gap-1">
          {(["all", "active", "completed"] as const).map((status) => (
            <Button
              key={status}
              aria-pressed={selectedStatus === status}
              size="sm"
              variant={selectedStatus === status ? "default" : "outline"}
              onClick={() => onFilterByStatus(status)}
              className={`capitalize text-xs ${selectedStatus === status
                ? "bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-secondary"
                }`}
            >
              {status}
            </Button>
          ))}
        </div>

        {/* Priority Filter */}
        <select
          aria-label="Task priority filter"
          value={selectedPriority}
          onChange={(e) => onFilterByPriority(e.target.value as "all" | "low" | "medium" | "high")}
          className="cursor-pointer rounded-[var(--saathi-radius-control)] border border-border bg-card px-2 py-1 text-xs text-foreground hover:border-primary/40"
        >
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Assignee Filter */}
        <select
          aria-label="Task assignee filter"
          value={selectedAssignee || ""}
          onChange={(e) => onFilterByAssignee(e.target.value || null)}
          className="cursor-pointer rounded-[var(--saathi-radius-control)] border border-border bg-card px-2 py-1 text-xs text-foreground hover:border-primary/40"
        >
          <option value="">All assignees</option>
          {members.map((member) => (
            <option key={member.id} value={member.email}>
              {member.username}
            </option>
          ))}
        </select>
      </div>
  )
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          aria-label="Search tasks"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="border-border bg-card pl-10 text-foreground placeholder:text-muted-foreground"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Clear task search"
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {compactToolbar ? (
        <div className="flex items-start gap-2">
          <details className="min-w-0 flex-1">
            <summary aria-label={activeCount ? `Filters, ${activeCount} active` : "Filters"} className="cursor-pointer rounded-[var(--saathi-radius-control)] py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
              Filters{activeCount > 0 && <span className="ml-2 text-muted-foreground">{activeCount}</span>}
            </summary>
            <div className="pt-2">{filters}</div>
          </details>
          {activeCount > 0 && <Button variant="ghost" size="sm" onClick={() => {
            if (onClearFilters) onClearFilters()
            else { onFilterByStatus("all"); onFilterByPriority("all"); onFilterByAssignee(null) }
          }}>Clear filters</Button>}
        </div>
      ) : filters}
    </div>
  )
}
