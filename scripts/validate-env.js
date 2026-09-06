#!/usr/bin/env node

/**
 * Environment Validation Script
 * Validates environment configuration before deployment
 */

const fs = require("fs");
const path = require("path");

// Colors for console output
const colors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function validateEnvironment() {
  log("🔍 Validating Saathi Environment Configuration...", "blue");
  console.log();

  const errors = [];
  const warnings = [];
  const env = process.env;

  // Check Node environment
  const nodeEnv = env.NODE_ENV || "development";
  log(`📍 Environment: ${nodeEnv}`, nodeEnv === "production" ? "red" : "green");

  // Production-specific validations
  if (nodeEnv === "production") {
    log("🔒 Running production validations...", "yellow");

    // Redis configuration
    if (!env.UPSTASH_REDIS_REST_URL && !env.KV_REST_API_URL && !env.KV_URL) {
      errors.push(
        "Redis URL is required in production (UPSTASH_REDIS_REST_URL)"
      );
    }

    if (!env.UPSTASH_REDIS_REST_TOKEN && !env.KV_REST_API_TOKEN) {
      errors.push(
        "Redis token is required in production (UPSTASH_REDIS_REST_TOKEN)"
      );
    }

    for (const name of ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_APP_URL", "CRON_SECRET"]) {
      if (!env[name]) errors.push(`${name} is required in production`);
    }
    if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) errors.push("Supabase publishable key is required");
    if (env.CRON_SECRET && env.CRON_SECRET.length < 32) errors.push("CRON_SECRET must be at least 32 characters");
    for (const name of ["RESEND_API_KEY", "EMAIL_FROM", "RESEND_WEBHOOK_SECRET"]) {
      if (!env[name]) errors.push(`${name} is required in production for invitation delivery`);
    }

    // Security checks
    if (env.DEBUG === "true") {
      warnings.push("DEBUG mode is enabled in production");
    }

    if (env.DISABLE_HTTPS === "true") {
      warnings.push("HTTPS is disabled in production");
    }
  }

  // General validations - no required vars for simple auth system
  const requiredForAllEnvs = [];

  requiredForAllEnvs.forEach((varName) => {
    if (!env[varName]) {
      errors.push(`${varName} is required`);
    }
  });

  // URL validations
  const urlVars = ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "KV_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_APP_URL"];
  urlVars.forEach((varName) => {
    if (env[varName] && !isValidUrl(env[varName])) {
      errors.push(`${varName} must be a valid URL`);
    }
  });

  // Email validations
  const emailVars = ["SMTP_FROM"];
  emailVars.forEach((varName) => {
    if (env[varName] && !isValidEmail(env[varName])) {
      errors.push(`${varName} must be a valid email address`);
    }
  });

  // Numeric validations
  const numericVars = [
    "SESSION_MAX_AGE",
    "RATE_LIMIT_INVITATIONS_MAX",
    "RATE_LIMIT_LOGIN_MAX",
    "RATE_LIMIT_SIGNUP_MAX",
    "RATE_LIMIT_TASKS_MAX",
    "SMTP_PORT",
  ];

  numericVars.forEach((varName) => {
    if (env[varName] && isNaN(Number(env[varName]))) {
      errors.push(`${varName} must be a valid number`);
    }
  });

  // Check for .env files
  const envFiles = [".env.local", ".env.production", ".env.development"];
  const existingEnvFiles = envFiles.filter((file) =>
    fs.existsSync(path.join(process.cwd(), file))
  );

  if (existingEnvFiles.length === 0 && nodeEnv !== "test") {
    warnings.push(
      "No .env files found. Using system environment variables only."
    );
  }

  // Display results
  console.log();
  log("📊 Validation Results:", "bold");
  console.log();

  if (errors.length === 0) {
    log("✅ All validations passed!", "green");
  } else {
    log(`❌ ${errors.length} error(s) found:`, "red");
    errors.forEach((error) => log(`   • ${error}`, "red"));
  }

  if (warnings.length > 0) {
    console.log();
    log(`⚠️  ${warnings.length} warning(s):`, "yellow");
    warnings.forEach((warning) => log(`   • ${warning}`, "yellow"));
  }

  // Configuration summary
  console.log();
  log("🔧 Configuration Summary:", "bold");
  log(`   • Environment: ${nodeEnv}`);
  log(
    `   • Redis: ${
      env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || env.KV_URL
        ? "Configured"
        : "Mock (development only)"
    }`
  );
  log(
    `   • Real-time: ${
      env.ENABLE_REAL_TIME !== "false" ? "Enabled" : "Disabled"
    }`
  );
  log(
    `   • Rate Limiting: ${
      env.ENABLE_RATE_LIMITING !== "false" ? "Enabled" : "Disabled"
    }`
  );
  log(
    `   • Analytics: ${
      env.ENABLE_ANALYTICS === "true" ? "Enabled" : "Disabled"
    }`
  );

  if (existingEnvFiles.length > 0) {
    console.log();
    log("📁 Environment Files Found:", "blue");
    existingEnvFiles.forEach((file) => log(`   • ${file}`, "blue"));
  }

  // Exit with error code if validation failed
  if (errors.length > 0) {
    console.log();
    log("💡 Tips:", "blue");
    log("   • Copy .env.example to .env.local for development");
    log("   • Configure Supabase Auth and PostgreSQL; keep credentials outside source control");
    log("   • Set up Redis at https://upstash.com/ for production");
    log("   • See DEPLOYMENT.md for detailed setup instructions");
    console.log();
    process.exit(1);
  }

  console.log();
  log("Configuration shape checked. Runtime and deployment verification are separate.", "green");
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Run validation
validateEnvironment();
