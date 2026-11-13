"use client"

import { useLayoutEffect } from "react"
import { installHistoryPositions } from "@/lib/browser-history"

export function HistoryPositionProvider() {
  useLayoutEffect(() => { installHistoryPositions(window) }, [])
  return null
}
