type GroqStructuredResponseOptions<T> = {
  apiKey?: string
  model?: string
  name: string
  schema: object
  instructions: string
  input: string
  parse: (value: unknown) => T
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

type GroqResponseBody = {
  choices?: Array<{
    message?: {
      content?: string | null
      refusal?: string | null
    }
  }>
}

export async function requestGroqStructuredResponse<T>({
  apiKey = process.env.GROQ_API_KEY,
  model = process.env.GROQ_MODEL || "openai/gpt-oss-20b",
  name,
  schema,
  instructions,
  input,
  parse,
  fetchImpl = fetch,
  timeoutMs = 20000,
}: GroqStructuredResponseOptions<T>): Promise<T> {
  if (!apiKey?.trim()) {
    throw new Error("AI workspace creation is not configured yet.")
  }

  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  try {
    const response = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: input },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name,
            strict: true,
            schema,
          },
        },
      }),
    })

    if (response.status === 429) {
      throw new Error("AI planning is busy right now. Please try again shortly.")
    }
    if (!response.ok) {
      throw new Error("AI planning is temporarily unavailable. Please try again.")
    }

    let body: GroqResponseBody
    try {
      body = await response.json() as GroqResponseBody
    } catch {
      throw new Error("Saathi did not receive a valid response. Please try again.")
    }

    const message = body.choices?.[0]?.message
    if (message?.refusal) {
      throw new Error("Saathi could not understand that request. Please try a more specific description.")
    }
    if (!message?.content?.trim()) {
      throw new Error("Saathi did not receive a valid response. Please try again.")
    }

    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(message.content)
    } catch {
      throw new Error("Saathi did not receive a valid response. Please try again.")
    }

    try {
      return parse(parsedJson)
    } catch {
      throw new Error("Saathi did not receive a valid response. Please try again.")
    }
  } catch (error) {
    if (timedOut) {
      throw new Error("AI planning took too long. Please try again.")
    }
    if (error instanceof Error) throw error
    throw new Error("AI planning is temporarily unavailable. Please try again.")
  } finally {
    clearTimeout(timeout)
  }
}
