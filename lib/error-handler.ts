// Custom error types
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message)
    this.name = 'AppError'
    Error.captureStackTrace(this, this.constructor)
  }
}

export class ValidationError extends AppError {
  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', 400)
    this.name = 'ValidationError'
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTH_ERROR', 401)
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403)
    this.name = 'AuthorizationError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404)
    this.name = 'NotFoundError'
  }
}

export class RateLimitError extends AppError {
  constructor(message: string) {
    super(message, 'RATE_LIMIT', 429)
    this.name = 'RateLimitError'
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(message, 'DATABASE_ERROR', 500)
    this.name = 'DatabaseError'
    if (originalError) {
      this.stack = originalError.stack
    }
  }
}

// Error handler utility class
export class ErrorHandler {
  // Retry mechanism with exponential backoff
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
    maxDelay: number = 10000
  ): Promise<T> {
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error
        
        // Don't retry on certain errors
        if (error instanceof ValidationError || 
            error instanceof AuthenticationError || 
            error instanceof AuthorizationError ||
            error instanceof NotFoundError) {
          throw error
        }
        
        if (attempt < maxRetries) {
          const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)
          console.warn(`[Saathi] Operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`, error)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
    
    throw lastError || new Error('Operation failed after retries')
  }

  // Circuit breaker pattern
  static createCircuitBreaker<T extends any[], R>(
    operation: (...args: T) => Promise<R>,
    options: {
      failureThreshold: number
      resetTimeout: number
      monitoringPeriod: number
    } = {
      failureThreshold: 5,
      resetTimeout: 60000,
      monitoringPeriod: 60000
    }
  ) {
    let failures = 0
    let lastFailureTime = 0
    let state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'
    
    return async (...args: T): Promise<R> => {
      const now = Date.now()
      
      // Reset failure count if monitoring period has passed
      if (now - lastFailureTime > options.monitoringPeriod) {
        failures = 0
      }
      
      // Check circuit state
      if (state === 'OPEN') {
        if (now - lastFailureTime > options.resetTimeout) {
          state = 'HALF_OPEN'
        } else {
          throw new AppError('Circuit breaker is OPEN', 'CIRCUIT_BREAKER_OPEN', 503)
        }
      }
      
      try {
        const result = await operation(...args)
        
        // Success - reset circuit if it was half-open
        if (state === 'HALF_OPEN') {
          state = 'CLOSED'
          failures = 0
        }
        
        return result
      } catch (error) {
        failures++
        lastFailureTime = now
        
        // Open circuit if failure threshold reached
        if (failures >= options.failureThreshold) {
          state = 'OPEN'
        }
        
        throw error
      }
    }
  }

  // Safe async operation wrapper
  static async safeAsync<T>(
    operation: () => Promise<T>,
    fallback?: T,
    onError?: (error: Error) => void
  ): Promise<T | undefined> {
    try {
      return await operation()
    } catch (error) {
      const err = error as Error
      console.error('[Saathi] Safe async operation failed:', err)
      
      if (onError) {
        onError(err)
      }
      
      return fallback
    }
  }

  // Format error for client response
  static formatError(error: Error): { message: string; code?: string; statusCode?: number } {
    if (error instanceof AppError) {
      return {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode
      }
    }
    
    // Don't expose internal errors to client
    console.error('[Saathi] Unexpected error:', error)
    return {
      message: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
      statusCode: 500
    }
  }

  // Log error with context
  static logError(error: Error, context: Record<string, any> = {}) {
    const errorInfo = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      context
    }
    
    if (error instanceof AppError && error.isOperational) {
      console.warn('[Saathi] Operational error:', errorInfo)
    } else {
      console.error('[Saathi] System error:', errorInfo)
    }
  }
}

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Saathi] Unhandled Rejection at:', promise, 'reason:', reason)
  // In production, you might want to restart the process
})

process.on('uncaughtException', (error) => {
  console.error('[Saathi] Uncaught Exception:', error)
  // In production, you should restart the process
  process.exit(1)
})