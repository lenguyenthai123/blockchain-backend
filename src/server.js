require("dotenv").config()
const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const winston = require("winston")

const UTXOBlockchain = require("./core/UTXOBlockchain")
const blockchainRoutes = require("./routes/blockchain")
const utxoRoutes = require("./routes/utxo-blockchain")
const mempoolRoutes = require("./routes/mempool")
const syncRoutes = require("./routes/sync")
const mineRoutes = require("./routes/mine")
const miningRoutes = require("./routes/mining")
const { generalLimit, transactionLimit, miningLimit } = require("./middleware/security")
const createTables = require("./database/migrate")
const { testConnection, isDbAvailable, startDbWatchdog } = require("./database/config")
const SyncService = require("./services/sync-service")

// Initialize blockchain
const sanCoinBlockchain = new UTXOBlockchain()

// Logger setup
global.logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: "sancoin-utxo-backend" },
  transports: [
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
})
if (process.env.NODE_ENV !== "production") {
  logger.add(new winston.transports.Console({ format: winston.format.simple() }))
}

const app = express()
const PORT = process.env.PORT || 3001

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }),
)

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
)

// Body parsing
app.use(express.json({ limit: "1mb" }))
app.use(express.urlencoded({ extended: true, limit: "1mb" }))

// Rate limiting
app.use("/api/", generalLimit)
app.use("/api/blockchain/transaction", transactionLimit)
app.use("/api/blockchain/utxo-transaction", transactionLimit)
app.use("/api/blockchain/mine", miningLimit)

// Attach blockchain and logger
app.use(async (req, _res, next) => {
  req.blockchain = sanCoinBlockchain
  if (!sanCoinBlockchain.initialized) {
    try {
      await sanCoinBlockchain.initialize()
    } catch (e) {
      console.error("Blockchain init error:", e.message)
    }
  }
  next()
})

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }))

// Routes
app.use("/api", mempoolRoutes)
app.use("/api", syncRoutes)
app.use("/api", mineRoutes)
app.use("/api/blockchain", blockchainRoutes)
app.use("/api/blockchain", utxoRoutes)
app.use("/api/blockchain", miningRoutes)

// Error handling
app.use((error, _req, res, _next) => {
  logger.error("Unhandled error:", error)
  res.status(500).json({ success: false, error: "Internal server error" })
})

// 404
app.use("*", (_req, res) => {
  res.status(404).json({ success: false, error: "Endpoint not found" })
})

async function startServer() {
  try {
    console.log("🚀 Starting SanCoin Backend...")
    // Try DB
    const dbConnected = await testConnection()
    if (dbConnected) {
      console.log("💾 Storage mode: Database")
      await createTables()
    } else {
      console.warn("⚠️ Database unavailable. Falling back to in-memory storage (RAM).")
      console.warn("   Data will be ephemeral until DB is restored.")
    }

    // Initialize blockchain (handles genesis in DB or memory via models)
    await sanCoinBlockchain.initialize()

    // Start sync service
    const syncService = new SyncService(`http://localhost:${PORT}`)
    syncService.start()
    // Attach to req for broadcasts in some routes
    app.use((req, _res, next) => {
      req.syncService = syncService
      next()
    })

    // Start DB watchdog to auto-retry connections
    startDbWatchdog();

    // Start server
    app.listen(PORT, () => {
      logger.info(`SanCoin Backend running on port ${PORT}`)
      console.log(`🎉 SanCoin Backend running on port ${PORT}`)
      console.log(`📊 Storage mode: ${isDbAvailable() ? "Database" : "Memory"}`)
      console.log(`🔗 API Base URL: http://localhost:${PORT}/api`)
    })
  } catch (error) {
    logger.error("Failed to start server:", error)
    console.error("❌ Failed to start server:", error.message)
    // In strict mode we still run in memory
    console.error("Attempting to start server in memory mode only...")
    await sanCoinBlockchain.initialize()
    app.listen(PORT, () => {
      console.log(`🧠 Memory-only mode server running on port ${PORT}`)
    })
  }
}

startServer()

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully")
  process.exit(0)
})
process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully")
  process.exit(0)
})

module.exports = app
