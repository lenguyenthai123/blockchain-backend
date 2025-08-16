const Block = require("./Block")
const { UTXOTransaction, TransactionInput, TransactionOutput } = require("./UTXOTransaction")
const BlockModel = require("../models/Block")
const UTXOTransactionModel = require("../models/UTXOTransactionModel")
const UTXOModel = require("../models/UTXOModel")

class UTXOBlockchain {
  constructor() {
    this.difficulty = 4
    this.miningReward = 10 // SNC
    this.initialized = false
  }

  async initialize() {
    if (this.initialized) return

    try {
      // Check if genesis block exists
      const genesisBlock = await BlockModel.getByIndex(0)
      if (!genesisBlock) {
        console.log("🔨 Creating genesis block...")
        await this.createGenesisBlock()
      } else {
        console.log("✅ Genesis block found")
      }

      this.initialized = true
      console.log("🎉 UTXO Blockchain initialized successfully")
    } catch (error) {
      console.error("❌ Failed to initialize blockchain:", error)
      throw error
    }
  }

  async createGenesisBlock() {
    try {
      // Create genesis transaction (coinbase)
      const genesisAddress = "san1genesis000000000000000000000000"
      const genesisTx = UTXOTransaction.createCoinbase(genesisAddress, 1000000, 0) // 1M SNC initial supply

      const genesisBlock = new Block(0, Date.now(), [genesisTx], "0")
      genesisBlock.hash = genesisBlock.calculateHash()

      // Save to database
      const blockId = await BlockModel.create({
        index: genesisBlock.index,
        hash: genesisBlock.hash,
        previousHash: genesisBlock.previousHash,
        merkleRoot: genesisBlock.merkleRoot,
        timestamp: genesisBlock.timestamp,
        nonce: genesisBlock.nonce,
        difficulty: this.difficulty,
        transactions: [genesisTx],
      })

      // Save genesis transaction
      await UTXOTransactionModel.saveTransaction(genesisTx, blockId)

      // Add genesis UTXO
      await UTXOModel.addUTXO(
        genesisTx.hash,
        0,
        genesisTx.outputs[0].amount,
        genesisAddress,
        genesisTx.outputs[0].scriptPubKey,
        0,
      )

      // Update balance cache
      await UTXOModel.updateAddressBalance(genesisAddress)

      console.log("✅ Genesis block created with UTXO")
    } catch (error) {
      console.error("❌ Failed to create genesis block:", error)
      throw error
    }
  }

  async getLatestBlock() {
    return await BlockModel.getLatestBlock()
  }

  async getBalance(address) {
    return await UTXOModel.getAddressBalance(address)
  }

  async getUTXOs(address) {
    return await UTXOModel.getUTXOsByAddress(address)
  }

  // Get latest blocks
  async getLatestBlocks(limit = 10) {
    return await BlockModel.getLatest(limit)
  }

  // Get latest transactions - NEW METHOD
  async getLatestTransactions(limit = 10) {
    const transactions = await UTXOTransactionModel.getLatest(limit)
    return transactions.map((tx) => ({
      hash: tx.hash,
      timestamp: tx.timestamp,
      type: tx.type,
      blockIndex: tx.blockIndex,
      blockHash: tx.blockHash,
      inputs: tx.inputs?.length || 0,
      outputs: tx.outputs?.length || 0,
      amount: tx.outputs?.reduce((sum, output) => sum + output.amount, 0) || 0,
    }))
  }

  // Get mempool transactions
  async getMempoolTransactions(limit = 50) {
    return await UTXOTransactionModel.getFromMempool(limit)
  }

  // Get UTXO statistics
  async getUTXOStats() {
    const totalUTXOs = await UTXOModel.getTotalUTXOCount()
    const mempoolSize = await UTXOTransactionModel.getMempoolSize()
    const totalValue = await UTXOModel.getTotalValue()

    return {
      totalUTXOs,
      mempoolSize,
      totalValue,
      averageUTXOValue: totalUTXOs > 0 ? (totalValue / totalUTXOs).toFixed(4) : "0",
      largestUTXO: await UTXOModel.getLargestUTXO(),
    }
  }
  // Accept a mined block from external miner (verify PoW, linkage, signatures)
  async acceptMinedBlock(payload) {
    await this.initialize()

    const { index, timestamp, previousHash, nonce, hash, transactions, minerAddress } = payload || {}
    if (
      typeof index !== "number" ||
      typeof timestamp !== "number" ||
      typeof nonce !== "number" ||
      typeof previousHash !== "string" ||
      typeof hash !== "string" ||
      !Array.isArray(transactions) ||
      !minerAddress
    ) {
      throw new Error("Invalid block payload")
    }

    const latest = await this.getLatestBlock()
    const expectedIndex = latest ? latest.index + 1 : 1
    const expectedPrev = latest ? latest.hash : "0"
    if (index !== expectedIndex) {
      throw new Error(`Invalid index: got ${index}, expected ${expectedIndex}`)
    }
    if (previousHash !== expectedPrev) {
      throw new Error(`Invalid previousHash: got ${previousHash}, expected ${expectedPrev}`)
    }

    // Rebuild transactions as UTXOTransaction instances
    const txs = transactions.map((tx) => {
      if (tx.type === "coinbase") {
        return tx
      }
      const inputs = (tx.inputs || []).map(
        (inp) => new TransactionInput(inp.previousTxHash, inp.outputIndex, inp.signature, inp.publicKey, inp.sequence),
      )
      const outputs = (tx.outputs || []).map((out) => new TransactionOutput(out.amount, out.address, out.scriptPubKey))
      const utxoTx = new UTXOTransaction(inputs, outputs, tx.timestamp || Date.now())
      utxoTx.hash = tx.hash
      utxoTx.type = tx.type || "transfer"
      return utxoTx
    })

    if (txs.length === 0 || txs[0].type !== "coinbase") {
      throw new Error("Coinbase transaction missing or not first")
    }
    // Validate coinbase reward
    const cbOutSum = txs[0].outputs.reduce((s, o) => s + Number(o.amount || 0), 0)
    const cbAddrSet = new Set(txs[0].outputs.map((o) => o.address))
    if (!cbAddrSet.has(minerAddress) || cbOutSum < this.miningReward) {
      throw new Error("Invalid coinbase payout")
    }

    // Validate signatures and UTXOs availability (best-effort)
    for (let t = 1; t < txs.length; t++) {
      const tx = txs[t]
      if (typeof tx.isValid === "function" && !tx.isValid()) {
        throw new Error(`Invalid transaction signature: ${tx.hash}`)
      }
      for (const input of tx.inputs) {
        if (input.previousTxHash === "0".repeat(64)) continue
        const utxo = await UTXOModel.getUTXO(input.previousTxHash, input.outputIndex)
        if (!utxo) throw new Error(`UTXO not found: ${input.previousTxHash}:${input.outputIndex}`)
      }
    }

    // Rebuild block and verify PoW
    const block = new Block(index, timestamp, txs, previousHash, nonce)
    const calcHash = block.calculateHash()
    if (calcHash !== hash) {
      throw new Error(`Hash mismatch: provided ${hash}, calculated ${calcHash}`)
    }
    const prefix = "0".repeat(this.difficulty)
    if (!hash.startsWith(prefix)) {
      throw new Error(`Insufficient PoW: expected prefix ${prefix}`)
    }

    // Persist block and apply state changes
    const blockId = await BlockModel.create({
      index: block.index,
      hash: block.hash,
      previousHash: block.previousHash,
      merkleRoot: block.merkleRoot,
      timestamp: block.timestamp,
      nonce: block.nonce,
      difficulty: this.difficulty,
      transactions: txs,
    })

    for (const tx of txs) {
      await UTXOTransactionModel.saveTransaction(tx, blockId)

      if (tx.type !== "coinbase") {
        // Remove spent UTXOs
        for (const input of tx.inputs) {
          await UTXOModel.removeUTXO(input.previousTxHash, input.outputIndex)
        }
      }

      // Add new UTXOs
      for (let i = 0; i < tx.outputs.length; i++) {
        const output = tx.outputs[i]
        await UTXOModel.addUTXO(tx.hash, i, output.amount, output.address, output.scriptPubKey, block.index)
      }

      // Remove tx from mempool if present
      try {
        await UTXOTransactionModel.removeFromMempool(tx.hash)
      } catch {
        // ignore
      }
    }

    // Update balance caches
    const affected = new Set()
    for (const tx of txs) {
      for (const o of tx.outputs) affected.add(o.address)
    }
    for (const addr of affected) {
      await UTXOModel.updateAddressBalance(addr)
    }

    console.log(`✅ Accepted external block #${block.index} ${block.hash}`)

    return {
      block: { index: block.index, hash: block.hash },
      txCount: txs.length,
    }
  }

  // Process signed transaction immediately with Proof of Work
  async processSignedTransaction(signedTransaction, minerAddress) {
    console.log("🔄 Processing signed transaction immediately...")

    // Validate transaction
    if (!signedTransaction.isValid()) {
      throw new Error("Invalid transaction signature")
    }

    // Verify inputs exist and are unspent
    for (const input of signedTransaction.inputs) {
      if (input.previousTxHash === "0".repeat(64)) continue // Skip coinbase inputs

      const utxo = await UTXOModel.getUTXO(input.previousTxHash, input.outputIndex)
      if (!utxo) {
        throw new Error(`UTXO not found: ${input.previousTxHash}:${input.outputIndex}`)
      }
    }

    // Create new block with this transaction + coinbase
    const latestBlock = await this.getLatestBlock()
    const blockHeight = latestBlock ? latestBlock.index + 1 : 1

    // Add coinbase transaction (mining reward)
    const coinbaseTx = UTXOTransaction.createCoinbase(minerAddress, this.miningReward, blockHeight)

    const transactions = [coinbaseTx, signedTransaction]

    // Create and mine block with Proof of Work
    const previousHash = latestBlock ? latestBlock.hash : "0"
    const block = new Block(blockHeight, Date.now(), transactions, previousHash)

    console.log(`⛏️  Mining block ${blockHeight} with difficulty ${this.difficulty}...`)
    const startTime = Date.now()

    block.mineBlock(this.difficulty)

    const miningTime = Date.now() - startTime
    console.log(`✅ Block mined in ${miningTime}ms with nonce: ${block.nonce}`)

    // Save block to database
    const blockId = await BlockModel.create({
      index: block.index,
      hash: block.hash,
      previousHash: block.previousHash,
      merkleRoot: block.merkleRoot,
      timestamp: block.timestamp,
      nonce: block.nonce,
      difficulty: this.difficulty,
      transactions: transactions,
    })

    // Process transactions and update UTXO set
    for (const tx of transactions) {
      // Save transaction
      await UTXOTransactionModel.saveTransaction(tx, blockId)

      // Remove spent UTXOs (except for coinbase)
      if (tx.type !== "coinbase") {
        for (const input of tx.inputs) {
          await UTXOModel.removeUTXO(input.previousTxHash, input.outputIndex)
        }
      }

      // Add new UTXOs
      for (let i = 0; i < tx.outputs.length; i++) {
        const output = tx.outputs[i]
        await UTXOModel.addUTXO(tx.hash, i, output.amount, output.address, output.scriptPubKey, block.index)
      }
    }

    // Update balance caches for affected addresses
    const affectedAddresses = new Set()
    for (const tx of transactions) {
      for (const output of tx.outputs) {
        affectedAddresses.add(output.address)
      }
    }

    for (const address of affectedAddresses) {
      await UTXOModel.updateAddressBalance(address)
    }

    console.log(`🎉 Transaction processed and mined in block ${block.index}`)

    return {
      block: block,
      transactionHash: signedTransaction.hash,
      blockHash: block.hash,
      miningTime: miningTime,
    }
  }

  // Legacy method for mempool (kept for compatibility)
  async addTransactionToMempool(transaction, fee = 0.001) {
    // Validate transaction
    if (!transaction.isValid()) {
      throw new Error("Invalid transaction")
    }

    // Verify inputs exist and are unspent
    for (const input of transaction.inputs) {
      if (input.previousTxHash === "0".repeat(64)) continue // Skip coinbase inputs

      const utxo = await UTXOModel.getUTXO(input.previousTxHash, input.outputIndex)
      if (!utxo) {
        throw new Error(`UTXO not found: ${input.previousTxHash}:${input.outputIndex}`)
      }
    }

    // Add to mempool
    await UTXOTransactionModel.addToMempool(transaction, fee)
    return transaction.hash
  }

  async minePendingTransactions(minerAddress) {
    // Get pending transactions from mempool
    const mempoolTxs = await UTXOTransactionModel.getFromMempool(100)

    if (mempoolTxs.length === 0) {
      throw new Error("No pending transactions to mine")
    }

    // Parse transactions
    const transactions = mempoolTxs.map((tx) => {
      const txData = tx.transaction
      const inputs = txData.inputs.map(
        (inp) => new TransactionInput(inp.previousTxHash, inp.outputIndex, inp.signature, inp.publicKey),
      )
      const outputs = txData.outputs.map((out) => new TransactionOutput(out.amount, out.address))

      const utxoTx = new UTXOTransaction(inputs, outputs, txData.timestamp)
      utxoTx.hash = txData.hash
      utxoTx.type = txData.type
      return utxoTx
    })

    // Add coinbase transaction (mining reward)
    const latestBlock = await this.getLatestBlock()
    const blockHeight = latestBlock ? latestBlock.index + 1 : 1
    const coinbaseTx = UTXOTransaction.createCoinbase(minerAddress, this.miningReward, blockHeight)
    transactions.unshift(coinbaseTx)

    // Create and mine block
    const previousHash = latestBlock ? latestBlock.hash : "0"
    const block = new Block(blockHeight, Date.now(), transactions, previousHash)
    block.mineBlock(this.difficulty)

    // Save block to database
    const blockId = await BlockModel.create({
      index: block.index,
      hash: block.hash,
      previousHash: block.previousHash,
      merkleRoot: block.merkleRoot,
      timestamp: block.timestamp,
      nonce: block.nonce,
      difficulty: this.difficulty,
      transactions: transactions,
    })

    // Process transactions and update UTXO set
    for (const tx of transactions) {
      // Save transaction
      await UTXOTransactionModel.saveTransaction(tx, blockId)

      // Remove spent UTXOs (except for coinbase)
      if (tx.type !== "coinbase") {
        for (const input of tx.inputs) {
          await UTXOModel.removeUTXO(input.previousTxHash, input.outputIndex)
        }
      }

      // Add new UTXOs
      for (let i = 0; i < tx.outputs.length; i++) {
        const output = tx.outputs[i]
        await UTXOModel.addUTXO(tx.hash, i, output.amount, output.address, output.scriptPubKey, block.index)
      }

      // Remove from mempool
      await UTXOTransactionModel.removeFromMempool(tx.hash)
    }

    // Update balance caches for affected addresses
    const affectedAddresses = new Set()
    for (const tx of transactions) {
      for (const output of tx.outputs) {
        affectedAddresses.add(output.address)
      }
    }

    for (const address of affectedAddresses) {
      await UTXOModel.updateAddressBalance(address)
    }

    console.log(`✅ Block ${block.index} mined with ${transactions.length} transactions`)
    return block
  }

  async getTransactionByHash(hash) {
    return await UTXOTransactionModel.getByHash(hash)
  }

  async getBlockByHash(hash) {
    return await BlockModel.getByHash(hash)
  }

  async getBlockByIndex(index) {
    return await BlockModel.getByIndex(index)
  }

  async getAddressTransactions(address) {
    return await UTXOTransactionModel.getByAddress(address)
  }

  async getNetworkStats() {
    const [totalBlocks, totalTransactions, mempoolSize, latestBlock, totalUTXOs] = await Promise.all([
      BlockModel.getTotalCount(),
      UTXOTransactionModel.getTotalCount(),
      UTXOTransactionModel.getMempoolSize(),
      this.getLatestBlock(),
      UTXOModel.getTotalUTXOCount(),
    ])

    return {
      totalBlocks,
      difficulty: this.difficulty,
      pendingTransactions: mempoolSize,
      totalTransactions,
      totalUTXOs,
      latestBlock,
    }
  }
}

module.exports = UTXOBlockchain
