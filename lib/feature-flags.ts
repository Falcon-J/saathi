export function isAiWorkspaceEnabled(
  value: string | undefined = process.env.NEXT_PUBLIC_ENABLE_AI_WORKSPACE,
): boolean {
  return value === "true"
}
