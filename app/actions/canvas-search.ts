"use server"

import { getSession } from "@/lib/auth-simple"
import { searchCanvasRecords } from "@/features/canvas/search-data"
import type { CanvasSearchResult } from "@/features/canvas/search"

export async function searchCanvas(input: unknown): Promise<{ items: CanvasSearchResult[] } | { error: string }> {
  try {
    const session = await getSession()
    if (!session) return { error: "Sign in to search your canvas." }
    return { items: await searchCanvasRecords(session.id, input) }
  } catch { return { error: "Search unavailable. Try again." } }
}
