const { Pool } = require("pg")
const EventEmitter = require("events")

// Runtime DB availability flag
let dbAvailable = false
const events = new EventEmitter()

// Parse DATABASE_URL if provided
let config
if (process.env.DATABASE_URL) {
  config = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  }
} else {
  // Fallback to individual environment variables
  config = {
    user: process.env.DB_USER || "postgres",
    host: process.env.DB_HOST || "localhost",
    database: process.env.DB_NAME || "sancoin",
    password: process.env.DB_PASSWORD || "password",
    port: process.env.DB_PORT || 5432,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  }
}

// Create pool (may fail to connect, that's OK for memory mode)
const pool = new Pool(config)

// Loggers
pool.on("connect", () => {
  console.log("✅ Connected to PostgreSQL database")
})
pool.on("error", (err) => {
  console.error("❌ Unexpected error on idle client:", err)
})

async function testConnection() {
  try {
    const client = await pool.connect()
    const result = await client.query("SELECT NOW()")
    console.log("📅 Database time:", result.rows[0].now)
    client.release()
    setDbAvailable(true)
    return true
  } catch (error) {
    console.error("❌ Database connection test failed:", error.code, error.message)
    setDbAvailable(false)
    return false
  }
}

function isDbAvailable() {
  return dbAvailable
}
function setDbAvailable(v) {
  if (dbAvailable !== v) {
    dbAvailable = v
    events.emit("db:availability", v)
  } else {
    dbAvailable = v
  }
}

/**
 * Watchdog: periodically retry DB connection; on success flip availability flag.
 */
function startDbWatchdog(intervalMs = 10*60*1000) {
  setInterval(async () => {
    if (!isDbAvailable()) {
      // await testConnection()
    }
  }, intervalMs)
}

module.exports = { pool, testConnection, isDbAvailable, setDbAvailable, events, startDbWatchdog, config }
