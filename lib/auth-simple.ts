"use server"

import { cookies } from "next/headers"
import { redis } from "./redis"
import crypto from "crypto"
import { hashPassword, verifyPassword } from "./passwords"
import { normalizeEmail } from "./identity"

// Simple session configuration
const SESSION_DURATION = 24 * 60 * 60 // 24 hours in seconds

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email) && email.length <= 255
}

function validatePassword(password: string): boolean {
  return password.length >= 6 && password.length <= 128
}

function validateUsername(username: string): boolean {
  return username.length >= 2 && username.length <= 50 && /^[a-zA-Z0-9_\s-]+$/.test(username)
}

function generateSessionId(): string {
  return crypto.randomBytes(32).toString('hex')
}

export async function signup(email: string, username: string, password: string) {
  try {
    const normalizedEmail = normalizeEmail(email)
    const normalizedUsername = username.trim()
    console.log("[Saathi] Signup attempt for:", normalizedEmail)

    // Validate inputs
    if (!validateEmail(normalizedEmail)) {
      return { error: "Please enter a valid email address" }
    }

    if (!validateUsername(normalizedUsername)) {
      return { error: "Username must be 2-50 characters, letters, numbers, spaces, hyphens, or underscores only" }
    }

    if (!validatePassword(password)) {
      return { error: "Password must be 6-128 characters" }
    }

    // Check if user already exists
    const existingUser = await redis.get(`user:${normalizedEmail}`)
    if (existingUser) {
      return { error: "Email already registered" }
    }

    // Store user with plain password (simplified for now)
    const userData = {
      email: normalizedEmail,
      username: normalizedUsername,
      password: await hashPassword(password),
      createdAt: new Date().toISOString()
    }
    await redis.set(`user:${normalizedEmail}`, JSON.stringify(userData))

    // Create session and auto-login
    const sessionId = generateSessionId()
    const sessionData = { email: normalizedEmail, username: normalizedUsername }
    await redis.set(`session:${sessionId}`, JSON.stringify(sessionData), { ex: SESSION_DURATION })

    // Set cookie
    const cookieStore = await cookies()
    cookieStore.set("auth-session", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_DURATION,
      path: "/",
    })

    console.log("[Saathi] Signup successful for:", normalizedEmail)
    return { success: true, email: normalizedEmail, username: normalizedUsername }
  } catch (error) {
    console.error("[Saathi] Signup error:", error)
    return { error: "Signup failed" }
  }
}

export async function login(email: string, password: string) {
  try {
    const normalizedEmail = normalizeEmail(email)
    console.log("[Saathi] Login attempt for:", normalizedEmail)

    // Validate inputs
    if (!validateEmail(normalizedEmail)) {
      return { error: "Please enter a valid email address" }
    }

    if (!password) {
      return { error: "Password is required" }
    }

    // Get user data
    const userData = await redis.get(`user:${normalizedEmail}`)

    // Create test user for development if needed
    if (!userData && normalizedEmail === "test@saathi.build") {
      console.log("[Saathi] Creating test user for development")
      const testUser = { email, username: "Test User", password: await hashPassword("test123"), createdAt: new Date().toISOString() }
      await redis.set(`user:${email}`, JSON.stringify(testUser))

      if (password === "test123") {
        const sessionId = generateSessionId()
        const sessionData = { email: normalizedEmail, username: testUser.username }
        await redis.set(`session:${sessionId}`, JSON.stringify(sessionData), { ex: SESSION_DURATION })

        const cookieStore = await cookies()
        cookieStore.set("auth-session", sessionId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: SESSION_DURATION,
          path: "/",
        })

        console.log("[Saathi] Test user login successful")
        return { success: true, email, username: testUser.username }
      }
    }

    if (!userData) {
      return { error: "Invalid email or password" }
    }

    // Parse user data
    const user = typeof userData === "string" ? JSON.parse(userData) : userData

    // Check password and upgrade legacy plaintext records after a valid login.
    const passwordCheck = await verifyPassword(password, user.password)
    if (!passwordCheck.valid) {
      return { error: "Invalid email or password" }
    }

    if (passwordCheck.needsRehash) {
      await redis.set(`user:${normalizedEmail}`, JSON.stringify({
        ...user,
        password: await hashPassword(password),
      }))
    }

    // Create session
    const sessionId = generateSessionId()
    const sessionData = { email: normalizedEmail, username: user.username }
    await redis.set(`session:${sessionId}`, JSON.stringify(sessionData), { ex: SESSION_DURATION })

    // Set cookie
    const cookieStore = await cookies()
    cookieStore.set("auth-session", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_DURATION,
      path: "/",
    })

    console.log("[Saathi] Login successful for:", normalizedEmail)
    return { success: true, email: normalizedEmail, username: user.username }
  } catch (error) {
    console.error("[Saathi] Login error:", error)
    return { error: "Login failed. Please try again." }
  }
}

export async function logout() {
  try {
    const cookieStore = await cookies()
    const sessionId = cookieStore.get("auth-session")?.value

    // Delete session from Redis if it exists
    if (sessionId) {
      await redis.del(`session:${sessionId}`)
    }

    // Clear the cookie
    cookieStore.set("auth-session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    })

    console.log("[Saathi] Logout successful")
    return { success: true }
  } catch (error) {
    console.error("[Saathi] Logout error:", error)
    return { error: "Logout failed" }
  }
}

export async function getSession() {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get("auth-session")?.value

  if (!sessionId) {
    return null
  }

  const sessionData = await redis.get(`session:${sessionId}`)

  if (!sessionData) {
    return null
  }

  // Parse session data
  return typeof sessionData === "string" ? JSON.parse(sessionData) : sessionData
}
