export type MutationErrorResult = { error: string }

export function getMutationError(result: unknown): string | undefined {
  if (
    result
    && typeof result === "object"
    && "error" in result
    && typeof result.error === "string"
  ) {
    return result.error
  }

  return undefined
}

export function getThrownErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
