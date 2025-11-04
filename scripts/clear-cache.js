const { Redis } = require("@upstash/redis");
const fs = require("fs");
const path = require("path");

async function clearCache() {
  try {
    console.log("[Saathi] Starting cache clear...");

    // Read environment variables from .env.local
    let url, token;
    try {
      const envPath = path.join(__dirname, "..", ".env.local");
      const envContent = fs.readFileSync(envPath, "utf8");

      const urlMatch = envContent.match(/UPSTASH_REDIS_REST_URL="([^"]+)"/);
      const tokenMatch = envContent.match(/UPSTASH_REDIS_REST_TOKEN="([^"]+)"/);

      url = urlMatch ? urlMatch[1].trim() : null;
      token = tokenMatch ? tokenMatch[1].trim() : null;
    } catch (error) {
      console.log("[Saathi] Could not read .env.local file");
    }

    if (!url || !token) {
      console.log(
        "[Saathi] No Redis credentials found, using mock storage (nothing to clear)"
      );
      return;
    }

    const redis = new Redis({ url, token });

    // Test connection
    await redis.ping();
    console.log("[Saathi] Connected to Redis");

    // Clear specific known keys
    const keysToDelete = [
      // Session keys
      "session:k5qtlg",
      "session:demo",
      // User data
      "user:demo@saathi.build:workspaces",
      "user:new5@mail.in:workspaces",
      "user:demo@saathi.build:invitations",
      "user:new5@mail.in:invitations",
      "user:demo@saathi.build:events",
      "user:new5@mail.in:events",
      // Workspace data
      "workspace:workspace_1761250780178_afvfznloj",
      "workspace:workspace_1761250780178_afvfznloj:tasks",
      "workspace:workspace_1761250780178_afvfznloj:events",
      // Tracking sets
      "active_sessions",
      "active_users",
      "active_workspaces",
      "active_invitations",
    ];

    let totalDeleted = 0;

    for (const key of keysToDelete) {
      try {
        const result = await redis.del(key);
        if (result > 0) {
          console.log(`[Saathi] Deleted key: ${key}`);
          totalDeleted++;
        }
      } catch (error) {
        console.warn(`[Saathi] Failed to delete ${key}:`, error.message);
      }
    }

    console.log(`[Saathi] Successfully cleared ${totalDeleted} cached entries`);
    console.log("[Saathi] Cache clearing complete!");
  } catch (error) {
    console.error("[Saathi] Error clearing cache:", error.message);
    process.exit(1);
  }
}

clearCache();
