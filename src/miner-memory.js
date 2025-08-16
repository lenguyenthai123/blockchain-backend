/**
 * RAM-based Miner (cron-like loop)
 * - Fetches transactions from the server's in-memory mempool via HTTP
 *   or directly from local MemoryMempool when MEMPOOL_MODE=local.
 * - Mines ONE transaction per block using UTXOBlockchain.processSignedTransaction
 *   to keep logic simple and robust.
 *
 * Env:
 *   NODE_ROLE=miner
 *   MINER_ADDRESS=san1yourmineraddress   (required)
 *   BACKEND_URL=http://localhost:4000    (server URL when MEMPOOL_MODE=remote)
 *   MEMPOOL_MODE=remote|local            (default: remote)
 *   MINER_INTERVAL_MS=3000               (poll interval when mempool empty)
 *   MINER_ONCE=true                      (optional: run one cycle then exit)
 */

require("dotenv").config({ path: process.env.ENV_FILE || ".env" });

const ChainModule = require("./core/UTXOBlockchain")
const { UTXOTransaction, TransactionInput, TransactionOutput } = require("./core/UTXOTransaction")
const mempoolLocal = require("./mempool/memory-mempool") // used only in local mode

const UTXOBlockchain = ChainModule?.default || ChainModule

const MINER_ADDRESS = process.env.MINER_ADDRESS || ""
const MODE = (process.env.MEMPOOL_MODE || "remote").toLowerCase()
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001"
const INTERVAL = Number.parseInt(process.env.MINER_INTERVAL_MS || "3000", 10)
const RUN_ONCE = String(process.env.MINER_ONCE || "").toLowerCase() === "true"

if (!MINER_ADDRESS || !MINER_ADDRESS.startsWith("SNC")) {
  console.error("❌ MINER_ADDRESS is required (e.g., SNC...)")
  process.exit(1)
}

function toUTXO(txObj) {
  // Normalize incoming shape into an actual UTXOTransaction instance
  const inputs =
    txObj.inputs?.map(
      (i) => new TransactionInput(i.previousTxHash, i.outputIndex, i.signature, i.publicKey, i.sequence ?? 0xffffffff),
    ) || []
  const outputs = txObj.outputs?.map((o) => new TransactionOutput(Number(o.amount), o.address, o.scriptPubKey)) || []
  const t = new UTXOTransaction(inputs, outputs, Number(txObj.timestamp || Date.now()))
  t.type = txObj.type || "transfer"
  t.hash = txObj.hash
  return t
}

async function dequeueRemote() {
  const url = `${BACKEND_URL.replace(/\/$/, "")}/api/mempool/dequeue`
  const res = await fetch(url, { method: "POST" })
  if (res.status === 204) return null
  if (!res.ok) throw new Error(`Dequeue failed: ${res.status}`)
  const data = await res.json()
  return data?.transaction || null
}

async function dequeueOne() {
  if (MODE === "local") {
    const tx = mempoolLocal.dequeue()
    return tx || null
  }
  return dequeueRemote()
}

async function runOnce(blockchain) {
  try {
    const txObj = await dequeueOne()
    if (!txObj) {
      console.log(`🕒 No pending tx. Next check in ${INTERVAL}ms.`)
      return { mined: false }
    }

    const tx = toUTXO(txObj)

    // Optional: quick validity check to avoid expensive work
    if (typeof tx.isValid === "function") {
      try {
        if (!tx.isValid()) {
          console.warn(`⚠️ Skipping invalid tx ${tx.hash}`)
          return { mined: false }
        }
      } catch {
        // ignore validation errors
      }
    }

    console.log(`⛏️  Mining tx ${String(tx.hash).slice(0, 16)}…`)
    const result = await blockchain.processSignedTransaction(tx, MINER_ADDRESS)

    console.log(
      `✅ Mined block #${result.block?.index} | blockHash=${String(result.blockHash).slice(
        0,
        16,
      )}… | txHash=${String(result.transactionHash).slice(0, 16)}… | time=${result.miningTime}ms`,
    )
    return { mined: true }
  } catch (err) {
    const msg = (err && err.message) || String(err)
    console.error("❌ Miner error:", msg)
    return { mined: false, error: err }
  }
}

async function main() {
  console.log("🚀 Starting RAM Miner", {
    mode: MODE,
    backend: BACKEND_URL,
    intervalMs: INTERVAL,
  })
  const blockchain = new UTXOBlockchain()
  // await blockchain.initialize()

  const cycle = async () => {
    await runOnce(blockchain)
    if (RUN_ONCE) {
      console.log("🛑 MINER_ONCE=true — exiting.")
      process.exit(0)
    }
  }

  await cycle()
  const timer = setInterval(cycle, INTERVAL)

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
