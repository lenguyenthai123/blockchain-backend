/**
 * Standalone RAM miner:
 * - Fetches transactions from /api/blockchain/mempool (given response schema)
 * - Builds a candidate block with a coinbase to MINER_ADDRESS
 * - Mines PoW locally (leading zeros per backend difficulty)
 * - Submits block to /api/blockchain/submit-mined-block for verification and reward
 *
 * Env:
 *   BACKEND_URL=http://localhost:3001
 *   MINER_ADDRESS=san1yourmineraddress
 *   MINER_INTERVAL_MS=4000          (poll interval when mempool empty)
 *   MINE_BATCH_SIZE=100             (max tx per block)
 *   MINER_ONCE=true                 (optional: mine one attempt and exit)
 */

require("dotenv").config({ path: process.env.ENV_FILE || ".env" });

const Block = require("./core/Block")
const { UTXOTransaction, TransactionInput, TransactionOutput } = require("./core/UTXOTransaction")

const BACKEND = process.env.BACKEND_URL || "http://localhost:3001"
const MINER_ADDRESS = process.env.MINER_ADDRESS || ""
const INTERVAL = Number.parseInt(process.env.MINER_INTERVAL_MS || "4000", 10)
const BATCH_SIZE = Number.parseInt(process.env.MINE_BATCH_SIZE || "100", 10)
const RUN_ONCE = String(process.env.MINER_ONCE || "").toLowerCase() === "true"

if (!globalThis.fetch) {
  // Node 18+ has fetch globally; if not, fall back to node-fetch
  globalThis.fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args))
}

if (!MINER_ADDRESS || !MINER_ADDRESS.startsWith("SNC")) {
  console.error("❌ MINER_ADDRESS is required (e.g., SNC...)")
  process.exit(1)
}

async function getMiningInfo() {
  const r = await fetch(`${BACKEND}/api/blockchain/mining-info`)
  if (!r.ok) throw new Error(`mining-info error: ${r.status}`)
  const j = await r.json()
  if (!j.success) throw new Error(j.error || "mining-info failed")
  return j.data
}

async function getMempool() {
  const r = await fetch(`${BACKEND}/api/blockchain/mempool`)
  if (!r.ok) throw new Error(`mempool error: ${r.status}`)
  const j = await r.json()
  if (!j.success) throw new Error(j.error || "mempool failed")
  const txs = Array.isArray(j.data?.transactions) ? j.data.transactions : []
  // Normalize to inner "transaction" objects
  return txs.map((t) => t.transaction || t)
}

function toUTXO(txObj) {
  const inputs =
    (txObj.inputs || []).map(
      (i) => new TransactionInput(i.previousTxHash, i.outputIndex, i.signature, i.publicKey, i.sequence ?? 0xffffffff),
    ) || []
  const outputs =
    (txObj.outputs || []).map((o) => new TransactionOutput(Number(o.amount), o.address, o.scriptPubKey)) || []
  const t = new UTXOTransaction(inputs, outputs, Number(txObj.timestamp || Date.now()))
  t.type = txObj.type || "transfer"
  t.hash = txObj.hash
  return t
}

function coinbase(miner, reward, height) {
  return UTXOTransaction.createCoinbase(miner, reward, height)
}

function toPlainTx(tx) {
  return {
    hash: tx.hash,
    type: tx.type,
    inputs: tx.inputs.map((i) => ({
      previousTxHash: i.previousTxHash,
      outputIndex: i.outputIndex,
      signature: i.signature,
      publicKey: i.publicKey,
      sequence: i.sequence,
    })),
    outputs: tx.outputs.map((o) => ({
      amount: o.amount,
      address: o.address,
      scriptPubKey: o.scriptPubKey,
    })),
    timestamp: tx.timestamp,
  }
}

async function submitBlock(blockPayload) {
  const r = await fetch(`${BACKEND}/api/blockchain/submit-mined-block`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(blockPayload),
  })
  const text = await r.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`submit-mined-block non-JSON response: ${text.slice(0, 200)}`)
  }
  if (!r.ok || !json.success) throw new Error(json?.error || `submit-mined-block failed: ${r.status}`)
  return json
}

async function mineOnce() {
  const { difficulty, miningReward, latestBlock } = await getMiningInfo()
  const mempool = await getMempool()

  if (!mempool.length) {
    console.log(`🕒 Mempool empty. Checking again in ${INTERVAL}ms...`)
    return { mined: false }
  }

  const nextIndex = (latestBlock?.index || 0) + 1
  const previousHash = latestBlock?.hash || "0".repeat(64)

  // Select batch
  const selected = mempool.slice(0, BATCH_SIZE).map(toUTXO)

  // Build block transactions: coinbase first
  const cb = coinbase(MINER_ADDRESS, miningReward, nextIndex)
  const txs = [cb, ...selected]

  // Create block
  const block = new Block(nextIndex, Date.now(), txs, previousHash)

  // Perform PoW
  const prefix = "0".repeat(difficulty)
  console.log(
    `⛏️  Mining block #${nextIndex} with difficulty ${difficulty} (${prefix.replace(/0/g, "0")}) and ${selected.length} txs...`,
  )
  const t0 = Date.now()
  block.mineBlock(difficulty)
  const dt = Date.now() - t0

  console.log("Payload ready:", block)

  // Prepare payload
  const payload = {
    index: block.index,
    timestamp: block.timestamp,
    previousHash: block.previousHash,
    nonce: block.nonce,
    hash: block.hash,
    minerAddress: MINER_ADDRESS,
    transactions: txs.map(toPlainTx),
  }
  // Submit for verification
  const res = await submitBlock(payload)
  console.log(
    `✅ Submitted block #${res.block?.index} ${String(res.block?.hash).slice(0, 16)}… accepted in ${dt}ms (txCount=${
      res.txCount
    })`,
  )
  return { mined: true }
}

async function main() {
  console.log("🚀 Miner ready. Backend:", BACKEND, "| Miner:", MINER_ADDRESS)
  if (RUN_ONCE) {
    try {
      await mineOnce()
    } catch (e) {
      console.error("❌ Mine once failed:", e.message)
    }
    return
  }

  // Loop
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await mineOnce()
      if (!res.mined) {
        await new Promise((r) => setTimeout(r, INTERVAL))
      }
    } catch (e) {
      console.error("❌ Miner loop error:", e.message)
      await new Promise((r) => setTimeout(r, INTERVAL))
    }
  }
}

main().catch((e) => {
  console.error("❌ Miner fatal:", e)
  process.exit(1)
})
