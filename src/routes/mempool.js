const express = require("express")
const crypto = require("crypto")
const mempool = require("../mempool/memory-mempool")
const UTXOTransactionModel = require("../models/UTXOTransactionModel")

// UTXO transaction classes to reconstruct signed tx objects
const { UTXOTransaction, TransactionInput, TransactionOutput } = require("../core/UTXOTransaction")

const router = express.Router()

router.use(express.json({ limit: "1mb" }))

/**
 * POST /api/mempool/tx
 * Body: {
 *   inputs: [{ previousTxHash, outputIndex, signature, publicKey, sequence? }],
 *   outputs: [{ amount, address, scriptPubKey? }],
 *   timestamp: number,
 *   type?: "transfer",
 *   hash?: string
 * }
 * Returns: { status: "queued", hash, position, size }
 */
router.post("/tx", async (req, res) => {
  try {
    const { inputs = [], outputs = [], timestamp = Date.now(), type = "transfer", hash: providedHash } = req.body || {}

    if (!Array.isArray(inputs) || inputs.length === 0) {
      return res.status(400).json({ error: "Invalid transaction: inputs[] required" })
    }
    if (!Array.isArray(outputs) || outputs.length === 0) {
      return res.status(400).json({ error: "Invalid transaction: outputs[] required" })
    }

    // Reconstruct a UTXOTransaction for light validation
    const txInputs = inputs.map(
      (i) => new TransactionInput(i.previousTxHash, i.outputIndex, i.signature, i.publicKey, i.sequence ?? 0xffffffff),
    )
    const txOutputs = outputs.map((o) => new TransactionOutput(Number(o.amount), o.address, o.scriptPubKey))

    const utxoTx = new UTXOTransaction(txInputs, txOutputs, Number(timestamp))
    utxoTx.type = type

    // If we weren't provided a hash, calculate a simple sha256 as a fallback
    // (Your blockchain may already set this; miner will use what's given.)
    const safeHash =
      providedHash ||
      crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            inputs,
            outputs,
            timestamp,
            type,
          }),
        )
        .digest("hex")

    utxoTx.hash = safeHash

    // Optional: sanity check signature validity if available
    try {
      if (typeof utxoTx.isValid === "function" && !utxoTx.isValid()) {
        return res.status(400).json({ error: "Invalid transaction signature" })
      }
    } catch {
      // If validation throws due to missing external context, we ignore here.
    }

    const { inserted, reason, position } = mempool.enqueue(utxoTx)
    if (!inserted) {
      if (reason === "duplicate") {
        return res.status(200).json({
          status: "duplicate",
          hash: utxoTx.hash,
          position,
          size: mempool.size(),
        })
      }
      if (reason === "mempool_full") {
        return res.status(503).json({ error: "Mempool is full. Try again later." })
      }
      return res.status(400).json({ error: "Unable to queue transaction." })
    }

    return res.status(202).json({
      status: "queued",
      hash: utxoTx.hash,
      position,
      size: mempool.size(),
    })
  } catch (err) {
    console.error("mempool/tx error:", err)
    return res.status(500).json({ error: "Internal error" })
  }
})

/**
 * POST /api/mempool/dequeue
 * Dequeues one tx for miners. Returns 204 if empty.
 * Response: { transaction }
 */
router.post("/dequeue", (req, res) => {
  const tx = mempool.dequeue()
  if (!tx) return res.status(204).end()
  return res.status(200).json({ transaction: tx })
})

// Submit signed tx into mempool (RAM or DB depending on mode)
router.post("/mempool/tx", async (req, res) => {
  try {
    const tx = req.body
    if (!tx?.hash) return res.status(400).json({ success: false, error: "Missing tx.hash" })
    const id = await UTXOTransactionModel.addToMempool(tx, tx.fee || 0.001)
    if (!id) return res.status(200).json({ success: true, queued: false, reason: "duplicate_or_failed" })
    res.json({ success: true, queued: true, id, hash: tx.hash })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

// Mempool status
router.get("/mempool/status", async (_req, res) => {
  try {
    const list = await UTXOTransactionModel.getFromMempool(25)
    res.json({
      success: true,
      size: list.length,
      sample: list.map((x) => ({ hash: x.hash, fee: x.fee, ts: x.timestamp })),
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

/**
 * GET /api/mempool/status
 * Inspect size and sample (no secrets).
 */
router.get("/status", (req, res) => {
  return res.json(mempool.toStatus())
})

module.exports = router
