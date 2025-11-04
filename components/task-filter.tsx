"use client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { X, Search } from "lucide-react"
import type { Member } from "@/app/actions/workspaces"

interface TaskFilterProps {
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
}: TaskFilterProps) {
  return (
    <div className="space-y-3 p-4 bg-card border border-border rounded-lg">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 bg-input border-border text-foreground placeholder:text-muted-foreground"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Status Filter */}
        <div className="flex gap-1">
          {(["all", "active", "completed"] as const).map((status) => (
            <Button
              key={status}
              size="sm"
              variant={selectedStatus === status ? "default" : "outline"}
              onClick={() => onFilterByStatus(status)}
              className={`capitalize text-xs ${selectedStatus === status
                ? "bg-primary text-primary-foreground"
                : "bg-transparent border-border hover:bg-secondary"
                }`}
            >
              {status}
            </Button>
          ))}
        </div>

        {/* Priority Filter */}
        <select
          value={selectedPriority}
          onChange={(e) => onFilterByPriority(e.target.value as "all" | "low" | "medium" | "high")}
          className="text-xs bg-input border border-border rounded px-2 py-1 text-foreground cursor-pointer hover:border-primary/50"
        >
          <option value="all">All priorities</option>
          <option value="high">🔴 High</option>
          <option value="medium">🟡 Medium</option>
          <option value="low">🟢 Low</option>
        </select>

        {/* Assignee Filter */}
        <select
          value={selectedAssignee || ""}
          onChange={(e) => onFilterByAssignee(e.target.value || null)}
          className="text-xs bg-input border border-border rounded px-2 py-1 text-foreground cursor-pointer hover:border-primary/50"
        >
          <option value="">All assignees</option>
          {members.map((member) => (
            <option key={member.id} value={member.email}>
              {member.username}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
