const express = require("express")
const router = express.Router()
const { isDbAvailable } = require("../database/config")
const UTXOTransactionModel = require("../models/UTXOTransactionModel")
const BlockModel = require("../models/Block")

// Basic state for peer sync
router.get("/sync/state", async (_req, res) => {
  try {
    const latest = await BlockModel.getLatestBlock()
    const mempoolSize = await UTXOTransactionModel.getMempoolSize()
    res.json({
      success: true,
      storage: isDbAvailable() ? "db" : "memory",
      latestBlock: latest || null,
      mempoolSize,
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

// Share mempool sample/full (up to 100)
router.get("/sync/mempool", async (req, res) => {
  try {
    const limit = Math.min(Number.parseInt(req.query.limit || "100", 10), 100)
    const list = await UTXOTransactionModel.getFromMempool(limit)
    res.json({ success: true, transactions: list.map((x) => x.transaction) })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

// Push mempool tx (from peers)
router.post("/sync/tx", async (req, res) => {
  try {
    const tx = req.body
    if (!tx?.hash) return res.status(400).json({ success: false, error: "Missing tx.hash" })
    await UTXOTransactionModel.addToMempool(tx, tx.fee || 0.001)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

// Announce a new block (peers will pull via their own routes if needed)
router.post("/sync/announce-block", async (req, res) => {
  try {
    const { blockIndex, blockHash } = req.body || {}
    if (typeof blockIndex !== "number" || !blockHash) {
      return res.status(400).json({ success: false, error: "Missing blockIndex or blockHash" })
    }
    // For simplicity we trust the announcement; real network would verify/fetch
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

module.exports = router
