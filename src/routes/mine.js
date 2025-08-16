const express = require("express")
const router = express.Router()
const UTXOTransactionModel = require("../models/UTXOTransactionModel")

// POST /api/mine { minerAddress }
router.post("/mine", async (req, res) => {
  try {
    const minerAddress = req.body?.minerAddress
    if (!minerAddress) return res.status(400).json({ success: false, error: "Missing minerAddress" })

    const pending = await UTXOTransactionModel.getFromMempool(1)
    if (!pending || pending.length === 0) {
      return res.json({ success: true, mined: false, reason: "mempool_empty" })
    }

    const block = await req.blockchain.minePendingTransactions(minerAddress)
    const txCount = block.transactions?.length || 0
    // Notify peers (best-effort)
    if (req.syncService) {
      req.syncService.broadcastBlock({ index: block.index, hash: block.hash }).catch(() => {})
    }
    res.json({ success: true, mined: true, block: { index: block.index, hash: block.hash }, txCount })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

module.exports = router
