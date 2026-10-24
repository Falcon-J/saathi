export function isAiWorkspaceEnabled(
  value: string | undefined = process.env.ENABLE_AI_WORKSPACE ?? process.env.NEXT_PUBLIC_ENABLE_AI_WORKSPACE,
): boolean {
  return value === "true"
}

export function resolveFeatureFlags(env: Record<string, string | undefined>): { aiWorkspace: boolean; csvImport: boolean } {
  return {
    aiWorkspace: (env.ENABLE_AI_WORKSPACE ?? env.NEXT_PUBLIC_ENABLE_AI_WORKSPACE) === "true",
    csvImport: env.ENABLE_CSV_IMPORT === undefined || env.ENABLE_CSV_IMPORT === "true",
  }
}
