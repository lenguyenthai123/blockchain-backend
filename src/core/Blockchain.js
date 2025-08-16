const Block = require("./Block")
const Transaction = require("./Transaction")
const BlockModel = require("../models/Block")
const TransactionModel = require("../models/Transaction")
const AddressModel = require("../models/Address")

class Blockchain {
  constructor() {
    this.difficulty = 10
    this.miningReward = 100
    this.initialized = false
  }

  async initialize() {
    if (this.initialized) return

    // Check if genesis block exists
    const genesisBlock = await BlockModel.getByIndex(0)
    if (!genesisBlock) {
      await this.createGenesisBlock()
    }

    this.initialized = true
    console.log("Blockchain initialized with database")
  }

  async createGenesisBlock() {
    const genesisTransaction = new Transaction(null, "genesis", 0)
    const genesisBlock = new Block(0, Date.now(), [genesisTransaction], "0")

    await BlockModel.create({
      index: genesisBlock.index,
      hash: genesisBlock.hash,
      previousHash: genesisBlock.previousHash,
      merkleRoot: genesisBlock.merkleRoot,
      timestamp: genesisBlock.timestamp,
      nonce: genesisBlock.nonce,
      difficulty: this.difficulty,
      transactions: genesisBlock.transactions.map((tx) => ({
        hash: tx.hash,
        fromAddress: tx.fromAddress,
        toAddress: tx.toAddress,
        amount: tx.amount,
        signature: tx.signature,
        timestamp: tx.timestamp,
        type: "genesis",
      })),
    })

    console.log("Genesis block created in database")
  }

  async getLatestBlock() {
    return await BlockModel.getLatestBlock()
  }

  async getBalance(address) {
    return await AddressModel.getBalance(address)
  }

  async addTransactionToMempool(transaction) {
    if (!transaction.fromAddress || !transaction.toAddress) {
      throw new Error("Transaction must include from and to address")
    }

    if (!transaction.isValid()) {
      throw new Error("Cannot add invalid transaction to mempool")
    }

    if (transaction.amount <= 0) {
      throw new Error("Transaction amount should be higher than 0")
    }

    const balance = await this.getBalance(transaction.fromAddress)
    if (balance < transaction.amount) {
      throw new Error("Not enough balance")
    }

    await TransactionModel.addToMempool({
      hash: transaction.hash,
      fromAddress: transaction.fromAddress,
      toAddress: transaction.toAddress,
      amount: transaction.amount,
      signature: transaction.signature,
      timestamp: transaction.timestamp,
    })

    return transaction.hash
  }

  async minePendingTransactions(miningRewardAddress) {
    // Get pending transactions from mempool
    const pendingTransactions = await TransactionModel.getFromMempool(100)

    if (pendingTransactions.length === 0) {
      throw new Error("No pending transactions to mine")
    }

    // Add mining reward
    const rewardTransaction = new Transaction(null, miningRewardAddress, this.miningReward)
    pendingTransactions.unshift({
      hash: rewardTransaction.hash,
      fromAddress: rewardTransaction.fromAddress,
      toAddress: rewardTransaction.toAddress,
      amount: rewardTransaction.amount,
      signature: rewardTransaction.signature,
      timestamp: rewardTransaction.timestamp,
      type: "coinbase",
    })

    const latestBlock = await this.getLatestBlock()
    const newIndex = latestBlock ? latestBlock.index + 1 : 0
    const previousHash = latestBlock ? latestBlock.hash : "0"

    const block = new Block(newIndex, Date.now(), pendingTransactions, previousHash)
    block.mineBlock(this.difficulty)

    // Save to database
    await BlockModel.create({
      index: block.index,
      hash: block.hash,
      previousHash: block.previousHash,
      merkleRoot: block.merkleRoot,
      timestamp: block.timestamp,
      nonce: block.nonce,
      difficulty: this.difficulty,
      transactions: pendingTransactions,
    })

    // Update balances for affected addresses
    const affectedAddresses = new Set()
    for (const tx of pendingTransactions) {
      if (tx.fromAddress) affectedAddresses.add(tx.fromAddress)
      affectedAddresses.add(tx.toAddress)
    }

    for (const address of affectedAddresses) {
      await AddressModel.getBalance(address) // This will update the cache
    }

    console.log(`Block ${block.index} mined and saved to database`)
    return block
  }

  async getTransactionByHash(hash) {
    return await TransactionModel.getByHash(hash)
  }

  async getBlockByHash(hash) {
    return await BlockModel.getByHash(hash)
  }

  async getBlockByIndex(index) {
    return await BlockModel.getByIndex(index)
  }

  async getAddressTransactions(address) {
    return await TransactionModel.getByAddress(address)
  }

  async getNetworkStats() {
    const [totalBlocks, totalTransactions, mempoolSize, latestBlock] = await Promise.all([
      BlockModel.getTotalCount(),
      TransactionModel.getTotalCount(),
      TransactionModel.getMempoolSize(),
      this.getLatestBlock(),
    ])

    return {
      totalBlocks,
      difficulty: this.difficulty,
      pendingTransactions: mempoolSize,
      totalTransactions,
      latestBlock,
    }
  }
}

module.exports = Blockchain
