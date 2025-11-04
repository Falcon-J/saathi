"use client"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

interface CategoryFilterProps {
  categories: string[]
  selectedCategories: string[]
  onCategoryToggle: (category: string) => void
}

export function CategoryFilter({ categories, selectedCategories, onCategoryToggle }: CategoryFilterProps) {
  if (categories.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-lg border border-border">
      <span className="text-sm font-medium text-muted-foreground self-center">Filter by category:</span>
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onCategoryToggle(cat)}
          className={`flex items-center gap-1 px-3 py-1 rounded text-sm transition-colors ${
            selectedCategories.includes(cat)
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {cat}
          {selectedCategories.includes(cat) && <X className="w-3 h-3" />}
        </button>
      ))}
      {selectedCategories.length > 0 && (
        <Button
          onClick={() => selectedCategories.forEach((cat) => onCategoryToggle(cat))}
          variant="ghost"
          size="sm"
          className="text-xs"
        >
          Clear all
        </Button>
      )}
    </div>
  )
}
