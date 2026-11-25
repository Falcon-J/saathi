"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Monitor, Moon, Sun } from "lucide-react"
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu"

const THEMES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "Match system", Icon: Monitor },
] as const

/** Theme choice for any dropdown menu. Stored by next-themes in localStorage. */
export function ThemeMenuItems() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return (
    <>
      <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Theme</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={mounted ? theme ?? "system" : undefined} onValueChange={setTheme} aria-label="Theme">
        {THEMES.map(({ value, label, Icon }) => (
          <DropdownMenuRadioItem key={value} value={value} className="min-h-11" onSelect={event => event.preventDefault()}>
            <Icon className="size-4" aria-hidden="true" />{label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  )
}
