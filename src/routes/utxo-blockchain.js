const express = require("express")
const router = express.Router()
const { UTXOTransaction, TransactionInput, TransactionOutput } = require("../core/UTXOTransaction")
const { validateAddress } = require("../middleware/validation")
const SUBMIT_TX_MODE = (process.env.SUBMIT_TX_MODE || "mempool").toLowerCase()

// Get UTXOs for address
router.get("/address/:address/utxos", validateAddress, async (req, res) => {
  try {
    await req.blockchain.initialize()
    const utxos = await req.blockchain.getUTXOs(req.params.address)

    res.json({
      success: true,
      data: utxos,
    })
  } catch (error) {
    logger.error("Error getting UTXOs:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Get balance for address
router.get("/address/:address/balance", validateAddress, async (req, res) => {
  try {
    await req.blockchain.initialize()
    const balance = await req.blockchain.getBalance(req.params.address)

    res.json({
      success: true,
      data: {
        address: req.params.address,
        balance: balance,
        confirmed: balance,
        unconfirmed: 0,
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

// Get network statistics
router.get("/network/stats", async (req, res) => {
  try {
    await req.blockchain.initialize()
    const stats = await req.blockchain.getNetworkStats()
    const latestBlocks = await req.blockchain.getLatestBlocks(5)
    const latestTransactions = await req.blockchain.getLatestTransactions(10)

    res.json({
      success: true,
      data: {
        totalBlocks: stats.totalBlocks,
        totalTransactions: stats.totalTransactions,
        difficulty: stats.difficulty,
        hashRate: "15.5 TH/s",
        blockTime: "10 minutes",
        pendingTransactions: stats.pendingTransactions,
        totalSupply: stats.totalBlocks * 50,
        circulatingSupply: stats.totalBlocks * 50,
        latestBlocks: latestBlocks,
        latestTransactions: latestTransactions,
      },
    })
  } catch (error) {
    logger.error("Error getting network stats:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Get latest transactions
router.get("/transactions/latest", async (req, res) => {
  try {
    await req.blockchain.initialize()
    const limit = Number.parseInt(req.query.limit) || 10
    const transactions = await req.blockchain.getLatestTransactions(limit)

    res.json({
      success: true,
      data: transactions,
    })
  } catch (error) {
    logger.error("Error getting latest transactions:", error)
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

// Submit signed UTXO transaction (configurable: mempool or immediate mining)
router.post("/submit-signed-transaction", async (req, res) => {
  try {
    await req.blockchain.initialize()
    const { hash, inputs, outputs, timestamp, type, minerAddress } = req.body

    // Validate required fields
    if (!hash || !inputs || !outputs) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: hash, inputs, outputs",
      })
    }

    // Create transaction inputs
    const txInputs = inputs.map(
      (input) => new TransactionInput(input.previousTxHash, input.outputIndex, input.signature, input.publicKey),
    )

    // Create transaction outputs
    const txOutputs = outputs.map((output) => new TransactionOutput(output.amount, output.address))

    // Create transaction
    const transaction = new UTXOTransaction(txInputs, txOutputs, timestamp)
    transaction.hash = hash
    transaction.type = type || "transfer"

    // Decide submission behavior
    const wantImmediate =
      (typeof req.query.mine === "string" && req.query.mine.toLowerCase() === "true") || SUBMIT_TX_MODE === "immediate"

    if (wantImmediate) {
      if (!minerAddress) {
        return res.status(400).json({
          success: false,
          error:
            "Immediate mining requested but minerAddress missing. Provide minerAddress or set SUBMIT_TX_MODE=mempool.",
        })
      }

      logger.info("Processing signed transaction immediately (mine now):", {
        hash: transaction.hash,
        inputs: inputs.length,
        outputs: outputs.length,
        minerAddress,
      })

      const result = await req.blockchain.processSignedTransaction(transaction, minerAddress)

      logger.info("Transaction mined successfully:", {
        txHash: result.transactionHash,
        blockHash: result.blockHash,
        blockIndex: result.block.index,
        miningTime: result.miningTime,
      })

      return res.json({
        success: true,
        data: {
          transactionHash: result.transactionHash,
          blockHash: result.blockHash,
          blockIndex: result.block.index,
          miningTime: result.miningTime,
          message: "Transaction processed and mined successfully",
        },
      })
    }

    // Default: enqueue to mempool (not mined immediately)
    const fee = 0.001 // simple static fee; adjust as needed or make configurable
    const txHash = await req.blockchain.addTransactionToMempool(transaction, fee)

    logger.info("Signed transaction added to mempool:", {
      hash: txHash,
      inputs: inputs.length,
      outputs: outputs.length,
    })

    return res.json({
      success: true,
      data: {
        transactionHash: txHash,
        message: "Transaction added to mempool. It will be mined by a miner shortly.",
      },
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    })
  }
})

// Legacy: Submit UTXO transaction to mempool
router.post("/utxo-transaction", async (req, res) => {
  try {
    await req.blockchain.initialize()
    const { hash, inputs, outputs, timestamp, type } = req.body

    // Create transaction inputs
    const txInputs = inputs.map(
      (input) => new TransactionInput(input.previousTxHash, input.outputIndex, input.signature, input.publicKey),
    )

    // Create transaction outputs
    const txOutputs = outputs.map((output) => new TransactionOutput(output.amount, output.address))

    // Create transaction
    const transaction = new UTXOTransaction(txInputs, txOutputs, timestamp)
    transaction.hash = hash
    transaction.type = type || "transfer"

    // Calculate fee (simplified)
    const fee = 0.001

    const txHash = await req.blockchain.addTransactionToMempool(transaction, fee)

    logger.info("UTXO transaction added to mempool:", { hash: txHash })

    res.json({
      success: true,
      data: {
        transactionHash: txHash,
        message: "Transaction added to mempool",
      },
    })
  } catch (error) {
    logger.error("Error submitting UTXO transaction:", error)
    res.status(400).json({
      success: false,
      error: error.message,
    })
  }
})

// Create transaction helper (for frontend)
router.post("/create-transaction", async (req, res) => {
  try {
    await req.blockchain.initialize()
    const { fromAddress, toAddress, amount } = req.body

    if (!fromAddress || !toAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: fromAddress, toAddress, amount",
      })
    }

    // Get UTXOs for the address
    const utxos = await req.blockchain.getUTXOs(fromAddress)

    if (utxos.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No UTXOs available for this address",
      })
    }

    // Select UTXOs for the transaction
    let totalInput = 0
    const selectedUTXOs = []
    const fee = 0.001

    for (const utxo of utxos) {
      selectedUTXOs.push(utxo)
      totalInput += utxo.amount
      if (totalInput >= amount + fee) break
    }

    if (totalInput < amount + fee) {
      return res.status(400).json({
        success: false,
        error: `Insufficient funds. Need ${amount + fee} SNC, have ${totalInput} SNC`,
      })
    }

    // Create transaction template
    const inputs = selectedUTXOs.map((utxo) => ({
      previousTxHash: utxo.txHash,
      outputIndex: utxo.outputIndex,
      signature: "", // To be filled by frontend
      publicKey: "", // To be filled by frontend
    }))

    const outputs = []

    // Output to recipient
    outputs.push({
      amount: amount,
      address: toAddress,
      scriptPubKey: `OP_DUP OP_HASH160 ${toAddress} OP_EQUALVERIFY OP_CHECKSIG`,
    })

    // Change output
    const change = totalInput - amount - fee
    if (change > 0) {
      outputs.push({
        amount: change,
        address: fromAddress,
        scriptPubKey: `OP_DUP OP_HASH160 ${fromAddress} OP_EQUALVERIFY OP_CHECKSIG`,
      })
    }

    res.json({
      success: true,
      data: {
        inputs: inputs,
        outputs: outputs,
        fee: fee,
        totalInput: totalInput,
        change: change,
        message: "Transaction template created. Please sign and submit.",
      },
    })
  } catch (error) {
    logger.error("Error creating transaction:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Get UTXO statistics
router.get("/utxo-stats", async (req, res) => {
  try {
    await req.blockchain.initialize()
    const stats = await req.blockchain.getUTXOStats()

    res.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    logger.error("Error getting UTXO stats:", error)
    res.status(500).json({
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

module.exports = router
