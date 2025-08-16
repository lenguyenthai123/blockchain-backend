const express = require("express")
const router = express.Router()

/**
 * GET /api/blockchain/mining-info
 * Returns current difficulty, reward and latest block tip so miner can prepare a candidate block.
 */
router.get("/mining-info", async (req, res) => {
  try {
    const bc = req.blockchain
    if (!bc) return res.status(500).json({ success: false, error: "Blockchain not initialized" })
    await bc.initialize()

    const latest = await bc.getLatestBlock()
    res.json({
      success: true,
      data: {
        difficulty: bc.difficulty,
        miningReward: bc.miningReward,
        latestBlock: latest
          ? { index: latest.index, hash: latest.hash, previousHash: latest.previousHash, timestamp: latest.timestamp }
          : { index: 0, hash: "0".repeat(64), previousHash: "0".repeat(64), timestamp: 0 },
      },
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

/**
 * POST /api/blockchain/submit-mined-block
 * Body: {
 *   index: number,
 *   timestamp: number,
 *   previousHash: string,
 *   nonce: number,
 *   hash: string,
 *   transactions: Array<UTXOTransaction JSON>,
 *   minerAddress: string
 * }
 */
router.post("/submit-mined-block", async (req, res) => {
  try {
    const bc = req.blockchain
    if (!bc) return res.status(500).json({ success: false, error: "Blockchain not initialized" })

    const payload = req.body
    const result = await bc.acceptMinedBlock(payload)

    res.json({ success: true, ...result })
  } catch (e) {
    res.status(400).json({ success: false, error: e.message })
  }
})

module.exports = router
