export type CsvRow = Record<string, string>

function parseRecords(input: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let value = ""
  let quoted = false

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]

    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          value += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        value += character
      }
      continue
    }

    if (character === '"' && value.length === 0) {
      quoted = true
    } else if (character === ',') {
      record.push(value)
      value = ""
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && input[index + 1] === '\n') index += 1
      record.push(value)
      if (record.some((cell) => cell.trim() !== "")) records.push(record)
      record = []
      value = ""
    } else {
      value += character
    }
  }

  if (quoted) {
    throw new Error("CSV contains an unclosed quoted value")
  }

  if (value.length > 0 || record.length > 0) {
    record.push(value)
    if (record.some((cell) => cell.trim() !== "")) records.push(record)
  }

  return records
}

export function parseCsv(input: string): CsvRow[] {
  const records = parseRecords(input)
  if (records.length < 2) return []

  const headers = records[0].map((header) => header.replace(/^\uFEFF/, "").trim().toLowerCase())
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw new Error("CSV headers must be non-empty and unique")
  }

  return records.slice(1).map((record) => headers.reduce<CsvRow>((row, header, index) => {
    row[header] = (record[index] ?? "").trim()
    return row
  }, {}))
}
