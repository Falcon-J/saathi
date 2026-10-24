"use server"

import { resolveFeatureFlags } from "@/lib/feature-flags"

export async function getFeatureCapabilities() {
  return resolveFeatureFlags(process.env)
}
