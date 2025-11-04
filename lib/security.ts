import { z } from "zod"
import crypto from "crypto"

// Rate limiting store (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// Input validation schemas
export const schemas = {
  email: z.string().email().max(255).trim().toLowerCase(),
  username: z.string().min(2).max(50).regex(/^[a-zA-Z0-9_\s-]+$/).trim(),
  password: z.string().min(6).max(128),
  workspaceName: z.string().min(1).max(100).trim(),
  taskTitle: z.string().min(1).max(500).trim(),
  workspaceId: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
  taskId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  invitationId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
}

import { getRateLimits } from "./env"

// Rate limiting configuration from environment
const RATE_LIMITS = getRateLimits()

export class SecurityService {
  // Input validation
  static validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
    try {
      return schema.parse(data)
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        throw new Error(`Validation failed: ${messages}`)
      }
      throw new Error('Invalid input data')
    }
  }

  // Rate limiting
  static checkRateLimit(key: string, type: keyof typeof RATE_LIMITS): boolean {
    const limit = RATE_LIMITS[type]
    const now = Date.now()
    const userKey = `${type}:${key}`

    const current = rateLimitStore.get(userKey)

    if (!current || now > current.resetTime) {
      // Reset or initialize
      rateLimitStore.set(userKey, {
        count: 1,
        resetTime: now + limit.windowMs
      })
      return true
    }

    if (current.count >= limit.maxRequests) {
      return false
    }

    current.count++
    return true
  }

  // Generate secure session token
  static generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  // Generate secure ID
  static generateSecureId(prefix: string): string {
    const timestamp = Date.now().toString(36)
    const random = crypto.randomBytes(8).toString('hex')
    return `${prefix}_${timestamp}_${random}`
  }

  // Sanitize HTML content (basic)
  static sanitizeHtml(input: string): string {
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
  }

  // Hash sensitive data (for logging)
  static hashForLogging(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 8)
  }

  // Validate workspace access
  static validateWorkspaceAccess(userEmail: string, workspace: any): boolean {
    if (!workspace || !workspace.members) {
      return false
    }

    return workspace.members.some((member: any) =>
      member.email === userEmail &&
      (member.role === 'owner' || member.role === 'member')
    )
  }

  // Clean expired rate limit entries (call periodically)
  static cleanupRateLimit(): void {
    const now = Date.now()
    for (const [key, value] of rateLimitStore.entries()) {
      if (now > value.resetTime) {
        rateLimitStore.delete(key)
      }
    }
  }
}

// Middleware for rate limiting
export function withRateLimit(type: keyof typeof RATE_LIMITS) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value

    descriptor.value = async function (...args: any[]) {
      // Extract user identifier (email) from session or args
      const userEmail = this.session?.email || args[0] // Adjust based on your method signatures

      if (!userEmail) {
        throw new Error('Authentication required')
      }

      if (!SecurityService.checkRateLimit(userEmail, type)) {
        const limit = RATE_LIMITS[type]
        throw new Error(`Rate limit exceeded. Max ${limit.maxRequests} requests per ${Math.floor(limit.windowMs / 60000)} minutes`)
      }

      return method.apply(this, args)
    }
  }
}

// Input validation decorator
export function validateInput(schema: z.ZodSchema) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value

    descriptor.value = async function (...args: any[]) {
      // Validate the first argument (adjust based on your needs)
      if (args.length > 0) {
        args[0] = SecurityService.validateInput(schema, args[0])
      }

      return method.apply(this, args)
    }
  }
}

// Clean up rate limits every hour
setInterval(() => {
  SecurityService.cleanupRateLimit()
}, 60 * 60 * 1000)