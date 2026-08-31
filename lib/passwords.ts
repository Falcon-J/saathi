import crypto from "node:crypto"

const HASH_SCHEME = "scrypt"
const KEY_LENGTH = 64

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, (error, derivedKey) => {
      if (error) {
        reject(error)
        return
      }
      resolve(derivedKey as Buffer)
    })
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  const derivedKey = await deriveKey(password, salt)
  return `${HASH_SCHEME}:${salt.toString("hex")}:${derivedKey.toString("hex")}`
}

export async function verifyPassword(
  password: string,
  storedPassword: unknown,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (typeof storedPassword !== "string") {
    return { valid: false, needsRehash: false }
  }

  const [scheme, saltHex, hashHex] = storedPassword.split(":")
  if (scheme !== HASH_SCHEME || !saltHex || !hashHex) {
    return {
      valid: password === storedPassword,
      needsRehash: true,
    }
  }

  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) {
    return { valid: false, needsRehash: false }
  }

  try {
    const expected = Buffer.from(hashHex, "hex")
    const actual = await deriveKey(password, Buffer.from(saltHex, "hex"))
    const valid = expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
    return { valid, needsRehash: false }
  } catch {
    return { valid: false, needsRehash: false }
  }
}
