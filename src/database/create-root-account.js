const { generateMnemonic, mnemonicToKeyPair } = require("../utils/crypto-utils")
const UTXOBlockchain = require("../core/UTXOBlockchain")
const { UTXOTransaction, TransactionOutput } = require("../core/UTXOTransaction")
const UTXOModel = require("../models/UTXOModel")

// Fixed root account mnemonic for consistency
const ROOT_MNEMONIC = "angle busy burden aspect another arctic angry belt agent bridge blow another"

async function createRootAccount() {
  console.log("🔑 Creating ROOT account with 10,000 SNC...")

  try {
    // Generate root account from fixed mnemonic
    const rootKeyPair = mnemonicToKeyPair(ROOT_MNEMONIC)

    console.log("📋 ROOT ACCOUNT DETAILS:")
    console.log("🔤 Mnemonic:", ROOT_MNEMONIC)
    console.log("📍 Address:", rootKeyPair.address)
    console.log("🔑 Public Key:", rootKeyPair.publicKey)
    console.log("🔐 Private Key:", rootKeyPair.privateKey)
    console.log("")

    // Initialize blockchain
    const blockchain = new UTXOBlockchain()
    await blockchain.initialize()

    // Check if root account already has funds
    const existingBalance = await blockchain.getBalance(rootKeyPair.address)
    if (existingBalance >= 10000) {
      console.log(`✅ Root account already has ${existingBalance} SNC`)
      return rootKeyPair
    }

    console.log("💰 Creating UTXOs for root account...")

    // Create multiple UTXOs for better transaction flexibility
    const utxoAmounts = [
      5000, // Large UTXO
      2000, // Medium UTXO
      1000, // Medium UTXO
      500, // Small UTXO
      300, // Small UTXO
      200, // Micro UTXO
    ]

    let totalCreated = 0
    const latestBlock = await blockchain.getLatestBlock()
    const nextBlockHeight = latestBlock ? latestBlock.index + 1 : 1

    for (let i = 0; i < utxoAmounts.length; i++) {
      const amount = utxoAmounts[i]

      // Create a special root funding transaction
      const fundingTx = new UTXOTransaction(
        [], // No inputs for root funding
        [new TransactionOutput(amount, rootKeyPair.address)],
        Date.now() + i, // Unique timestamp
      )

      fundingTx.type = "coinbase"
      fundingTx.hash = fundingTx.calculateHash()

      // Add UTXO directly to the set
      await UTXOModel.addUTXO(
        fundingTx.hash,
        0, // Output index
        amount,
        rootKeyPair.address,
        fundingTx.outputs[0].scriptPubKey,
        nextBlockHeight,
      )

      totalCreated += amount
      console.log(`💎 Created UTXO: ${amount} SNC (${fundingTx.hash.substring(0, 16)}...)`)
    }

    // Update balance cache
    await UTXOModel.updateAddressBalance(rootKeyPair.address)

    const finalBalance = await blockchain.getBalance(rootKeyPair.address)
    console.log(`🎉 Root account created successfully!`)
    console.log(`💰 Total balance: ${finalBalance} SNC`)
    console.log(`📊 UTXOs created: ${utxoAmounts.length}`)
    console.log("")
    console.log("🔒 SAVE THESE DETAILS SECURELY:")
    console.log("=".repeat(50))
    console.log(`Mnemonic: ${ROOT_MNEMONIC}`)
    console.log(`Address: ${rootKeyPair.address}`)
    console.log(`Balance: ${finalBalance} SNC`)
    console.log("=".repeat(50))

    return rootKeyPair
  } catch (error) {
    console.error("❌ Error creating root account:", error)
    throw error
  }
}

// Run if called directly
if (require.main === module) {
  createRootAccount()
    .then(() => {
      console.log("✅ Root account creation completed")
      process.exit(0)
    })
    .catch((error) => {
      console.error("❌ Root account creation failed:", error)
      process.exit(1)
    })
}

module.exports = createRootAccount
