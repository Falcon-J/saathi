import { z } from "zod"

// Environment variable schema
const envSchema = z.object({
    // Node environment
    NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),

    // Redis configuration
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    KV_REST_API_URL: z.string().url().optional(),
    KV_REST_API_TOKEN: z.string().optional(),
    KV_URL: z.string().url().optional(),

    // Authentication
    NEXTAUTH_SECRET: z.string().min(32).default('dev-secret-key-change-in-production-please'),
    NEXTAUTH_URL: z.string().url().default('http://localhost:3000'),
    SESSION_MAX_AGE: z.string().transform(Number).default('86400'),

    // Rate limiting
    RATE_LIMIT_INVITATIONS_MAX: z.string().transform(Number).default('10'),
    RATE_LIMIT_INVITATIONS_WINDOW: z.string().transform(Number).default('3600000'),
    RATE_LIMIT_LOGIN_MAX: z.string().transform(Number).default('5'),
    RATE_LIMIT_LOGIN_WINDOW: z.string().transform(Number).default('900000'),
    RATE_LIMIT_SIGNUP_MAX: z.string().transform(Number).default('3'),
    RATE_LIMIT_SIGNUP_WINDOW: z.string().transform(Number).default('3600000'),
    RATE_LIMIT_TASKS_MAX: z.string().transform(Number).default('100'),
    RATE_LIMIT_TASKS_WINDOW: z.string().transform(Number).default('60000'),

    // Application
    APP_NAME: z.string().default('Saathi'),
    APP_VERSION: z.string().default('1.0.0'),

    // Features
    ENABLE_REAL_TIME: z.string().transform(val => val === 'true').default('true'),
    ENABLE_RATE_LIMITING: z.string().transform(val => val === 'true').default('true'),
    ENABLE_ANALYTICS: z.string().transform(val => val === 'true').default('false'),
    ENABLE_ERROR_REPORTING: z.string().transform(val => val === 'true').default('false'),

    // Logging
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    DEBUG: z.string().transform(val => val === 'true').default('false'),

    // Development
    DISABLE_HTTPS: z.string().transform(val => val === 'true').default('false'),
    USE_MOCK_REDIS: z.string().default('auto'),

    // Optional: Email
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().transform(Number).optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().email().optional(),

    // Optional: Analytics
    VERCEL_ANALYTICS_ID: z.string().optional(),
    GOOGLE_ANALYTICS_ID: z.string().optional(),

    // Optional: Error reporting
    SENTRY_DSN: z.string().url().optional(),
})

// Parse and validate environment variables
function parseEnv() {
    try {
        return envSchema.parse(process.env)
    } catch (error) {
        if (error instanceof z.ZodError) {
            const missingVars = error.errors
                .filter(err => err.code === 'invalid_type' && err.received === 'undefined')
                .map(err => err.path.join('.'))

            const invalidVars = error.errors
                .filter(err => err.code !== 'invalid_type' || err.received !== 'undefined')
                .map(err => `${err.path.join('.')}: ${err.message}`)

            console.error('❌ Environment configuration error:')

            if (missingVars.length > 0) {
                console.error('Missing required environment variables:')
                missingVars.forEach(varName => console.error(`  - ${varName}`))
            }

            if (invalidVars.length > 0) {
                console.error('Invalid environment variables:')
                invalidVars.forEach(error => console.error(`  - ${error}`))
            }

            console.error('\n📝 Please check your .env files and ensure all required variables are set.')
            console.error('📖 See .env.example for reference.')

            process.exit(1)
        }

        throw error
    }
}

// Export parsed environment
export const env = parseEnv()

// Environment utilities
export const isDevelopment = env.NODE_ENV === 'development'
export const isProduction = env.NODE_ENV === 'production'
export const isStaging = env.NODE_ENV === 'staging'

// Redis configuration helper
export const getRedisConfig = () => {
    const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || env.KV_URL
    const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN

    return { url, token }
}

// Rate limiting configuration
export const getRateLimits = () => ({
    invitations: {
        maxRequests: env.RATE_LIMIT_INVITATIONS_MAX,
        windowMs: env.RATE_LIMIT_INVITATIONS_WINDOW
    },
    login: {
        maxRequests: env.RATE_LIMIT_LOGIN_MAX,
        windowMs: env.RATE_LIMIT_LOGIN_WINDOW
    },
    signup: {
        maxRequests: env.RATE_LIMIT_SIGNUP_MAX,
        windowMs: env.RATE_LIMIT_SIGNUP_WINDOW
    },
    tasks: {
        maxRequests: env.RATE_LIMIT_TASKS_MAX,
        windowMs: env.RATE_LIMIT_TASKS_WINDOW
    }
})

// SMTP configuration helper
export const getSmtpConfig = () => {
    if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS) {
        return null
    }

    return {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS
        },
        from: env.SMTP_FROM || env.SMTP_USER
    }
}

// Validation for production
if (isProduction) {
    const { url, token } = getRedisConfig()

    if (!url || !token) {
        console.error('❌ Production Error: Redis configuration is required in production')
        console.error('Please set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN')
        process.exit(1)
    }

    if (env.NEXTAUTH_SECRET === 'dev-secret-key-change-in-production-please') {
        console.error('❌ Production Error: Please change NEXTAUTH_SECRET in production')
        console.error('Generate a secure secret with: openssl rand -base64 32')
        process.exit(1)
    }
}

// Log configuration on startup
console.log(`🚀 Saathi ${env.APP_VERSION} starting in ${env.NODE_ENV} mode`)
if (isDevelopment) {
    console.log('🔧 Development features enabled:')
    console.log(`   - Debug: ${env.DEBUG}`)
    console.log(`   - Mock Redis: ${!getRedisConfig().url ? 'Yes' : 'No'}`)
    console.log(`   - HTTPS: ${env.DISABLE_HTTPS ? 'Disabled' : 'Enabled'}`)
}

export default env