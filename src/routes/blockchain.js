const express = require("express")
const router = express.Router()
const Transaction = require("../core/Transaction")
const { validateTransaction, validateAddress } = require("../middleware/validation")

// Get blockchain info
router.get("/info", async (req, res) => {
  try {
    await req.blockchain.initialize()
    const stats = await req.blockchain.getNetworkStats()
    res.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    logger.error("Error getting blockchain info:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Get balance for address
router.get("/balance/:address", validateAddress, async (req, res) => {
  try {
    await req.blockchain.initialize()
    const balance = await req.blockchain.getBalance(req.params.address)
    res.json({
      success: true,
      data: {
        address: req.params.address,
        balance: balance,
      },
    })
  } catch (error) {
    logger.error("Error getting balance:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Submit signed transaction (legacy)
router.post("/transaction", validateTransaction, async (req, res) => {
  try {
    await req.blockchain.initialize()
    const { fromAddress, toAddress, amount, signature } = req.body

    const transaction = new Transaction(fromAddress, toAddress, amount)
    transaction.signature = signature

    const txHash = await req.blockchain.addTransactionToMempool(transaction)

    logger.info("Transaction added to mempool:", { hash: txHash, from: fromAddress, to: toAddress, amount })

    res.json({
      success: true,
      data: {
        transactionHash: txHash,
        message: "Transaction added to mempool",
      },
    })
  } catch (error) {
    logger.error("Error submitting transaction:", error)
    res.status(400).json({
      success: false,
      error: error.message,
    })
  }
})

// Get transaction by hash
router.get("/transaction/:hash", async (req, res) => {
  try {
    await req.blockchain.initialize()
    const result = await req.blockchain.getTransactionByHash(req.params.hash)

    if (!result) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found",
      })
    }

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    logger.error("Error getting transaction:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Get transactions for address
router.get("/address/:address/transactions", validateAddress, async (req, res) => {
  try {
    await req.blockchain.initialize()
    const transactions = await req.blockchain.getAddressTransactions(req.params.address)

    res.json({
      success: true,
      data: {
        address: req.params.address,
        transactions: transactions,
      },
    })
  } catch (error) {
    logger.error("Error getting address transactions:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Get block by index
router.get("/block/:index", async (req, res) => {
  try {
    await req.blockchain.initialize()
    const blockIndex = Number.parseInt(req.params.index)
    const block = await req.blockchain.getBlockByIndex(blockIndex)

    if (!block) {
      return res.status(404).json({
        success: false,
        error: "Block not found",
      })
    }

    res.json({
      success: true,
      data: block,
    })
  } catch (error) {
    logger.error("Error getting block:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Get block by hash
router.get("/block/hash/:hash", async (req, res) => {
  try {
    await req.blockchain.initialize()
    const block = await req.blockchain.getBlockByHash(req.params.hash)

    if (!block) {
      return res.status(404).json({
        success: false,
        error: "Block not found",
      })
    }

    res.json({
      success: true,
      data: block,
    })
  } catch (error) {
    logger.error("Error getting block by hash:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Get latest blocks
router.get("/blocks/latest", async (req, res) => {
  try {
    await req.blockchain.initialize()
    const limit = Number.parseInt(req.query.limit) || 10
    const blocks = await req.blockchain.getLatestBlocks(limit)

    res.json({
      success: true,
      data: blocks,
    })
  } catch (error) {
    logger.error("Error getting latest blocks:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Get network statistics
router.get("/stats", async (req, res) => {
  try {
    await req.blockchain.initialize()
    const stats = await req.blockchain.getNetworkStats()

    // Add additional stats
    const additionalStats = {
      ...stats,
      networkHashRate: "15.5 TH/s", // Mock data
      averageBlockTime: "10 minutes",
      totalSupply: "21000000 SNC",
      circulatingSupply: stats.totalBlocks * 50, // 50 SNC per block
    }

    res.json({
      success: true,
      data: additionalStats,
    })
  } catch (error) {
    logger.error("Error getting network stats:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Mine block (for testing purposes)
router.post("/mine", async (req, res) => {
  try {
    await req.blockchain.initialize()
    const { minerAddress } = req.body

    if (!minerAddress) {
      return res.status(400).json({
        success: false,
        error: "Miner address is required",
      })
    }

    const block = await req.blockchain.minePendingTransactions(minerAddress)

    logger.info("Block mined:", { index: block.index, hash: block.hash, miner: minerAddress })

    res.json({
      success: true,
      data: {
        message: "Block mined successfully",
        block: block,
      },
    })
  } catch (error) {
    logger.error("Error mining block:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Get mempool transactions
router.get("/mempool", async (req, res) => {
  try {
    await req.blockchain.initialize()
    const limit = Number.parseInt(req.query.limit) || 50
    const mempoolTxs = await req.blockchain.getMempoolTransactions(limit)

    res.json({
      success: true,
      data: {
        transactions: mempoolTxs,
        count: mempoolTxs.length,
      },
    })
  } catch (error) {
    logger.error("Error getting mempool:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Search endpoint (address, transaction, or block)
router.get("/search/:query", async (req, res) => {
  try {
    await req.blockchain.initialize()
    const query = req.params.query.trim()

    let result = null
    let type = "unknown"

    // Check if it's a transaction hash (64 hex characters)
    if (query.match(/^[a-fA-F0-9]{64}$/)) {
      result = await req.blockchain.getTransactionByHash(query)
      if (result) {
        type = "transaction"
      }
    }
    // Check if it's a block number
    else if (query.match(/^[0-9]+$/)) {
      const blockIndex = Number.parseInt(query)
      result = await req.blockchain.getBlockByIndex(blockIndex)
      if (result) {
        type = "block"
      }
    }
    // Check if it's an address
    else if (query.match(/^(san1[a-zA-Z0-9]+|0x[a-fA-F0-9]{40})$/)) {
      const balance = await req.blockchain.getBalance(query)
      const transactions = await req.blockchain.getAddressTransactions(query)
      result = {
        address: query,
        balance: balance,
        transactions: transactions,
      }
      type = "address"
    }

    if (!result) {
      return res.status(404).json({
        success: false,
        error: "No results found for the given query",
      })
    }

    res.json({
      success: true,
      data: {
        type: type,
        result: result,
      },
    })
  } catch (error) {
    logger.error("Error searching:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

module.exports = router
