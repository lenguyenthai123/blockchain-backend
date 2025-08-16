/**
 * SanCoin Miner
 * - Periodically checks for pending transactions and mines a block when available.
 *
 * Env:
 *   MINER_ADDRESS=san1yourmineraddress   (REQUIRED for payouts)
 *   MINER_INTERVAL_MS=15000              (optional, default 15000)
 *   MINER_ONCE=true                      (optional, run one cycle then exit)
 *   NODE_ENV=development|production      (optional)
 */
require("dotenv").config({ path: process.env.ENV_FILE || ".env" });

// Support both default and commonjs export shapes.
const ChainModule = require("./core/UTXOBlockchain")
const UTXOBlockchain = ChainModule?.default || ChainModule

const MINER_ADDRESS = process.env.MINER_ADDRESS || "san1miner000000000000000000000000000000000"
const INTERVAL = Number.parseInt(process.env.MINER_INTERVAL_MS || "15000", 10)
const RUN_ONCE = String(process.env.MINER_ONCE || "").toLowerCase() === "true"

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function attemptMine(blockchain, minerAddress) {
  try {
    // Some implementations throw if no pending txs; others just mine an empty block.
    const block = await blockchain.minePendingTransactions(minerAddress)

    // If block has no transactions, consider it a no-op.
    const txCount = Array.isArray(block?.transactions) ? block.transactions.length : 0

    if (txCount === 0) {
      console.log(`🕒 No pending transactions. Checking again in ${INTERVAL}ms.`)
      return { mined: false }
    }

    console.log(
      `✅ Mined block #${block.index} | hash=${String(block.hash).slice(
        0,
        16,
      )}… | txs=${txCount} | time=${new Date(block.timestamp).toISOString()}`,
    )
    return { mined: true, block }
  } catch (err) {
    const msg = (err && err.message) || String(err)
    if (msg.toLowerCase().includes("no pending transactions")) {
      console.log(`🕒 ${msg}. Checking again in ${INTERVAL}ms.`)
      return { mined: false }
    }
    console.error("❌ Miner error:", err)
    return { mined: false, error: err }
  }
}

async function main() {
  if (!MINER_ADDRESS?.startsWith("SNC")) {
    console.error("❌ MINER_ADDRESS is required and must look like a San address (e.g., SNC...)")
    process.exit(1)
  }

  console.log("🚀 Starting SanCoin Miner")
  console.log("🔧 Config:", {
    env: process.env.NODE_ENV || "development",
    minerAddress: MINER_ADDRESS,
    intervalMs: INTERVAL,
    once: RUN_ONCE,
  })

  const blockchain = new UTXOBlockchain()
  // await blockchain.initialize()

  const run = async () => {
    await attemptMine(blockchain, MINER_ADDRESS)
    if (RUN_ONCE) {
      console.log("🛑 MINER_ONCE=true — exiting after one cycle.")
      process.exit(0)
    }
  }

  // First attempt immediately, then on an interval
  await run()
  const timer = setInterval(run, INTERVAL)

  const shutdown = () => {
    console.log("🧹 Shutting down miner...")
    clearInterval(timer)
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

main().catch((e) => {
  console.error("❌ Miner failed to start:", e)
  process.exit(1)
})
