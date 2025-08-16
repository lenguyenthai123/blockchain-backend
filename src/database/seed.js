const pool = require("./config")
const Blockchain = require("../core/Blockchain")
const Transaction = require("../core/Transaction")

const seedDatabase = async () => {
  const blockchain = new Blockchain()
  await blockchain.initialize()

  console.log("Seeding database with test data...")

  try {
    // Create some test addresses with initial balances
    const testAddresses = [
      "san1qyzx7rf9g87gpdqf6jsc8j2zpkq9hg8tq5a3x4",
      "san1q8x7rf9g87gpdqf6jsc8j2zpkq9hg8tq5b9y5",
      "san1q7x6rf8g76gpdqf5jsc7j1zpkq8hg7tq4c8z6",
    ]

    // Mine some initial blocks with test transactions
    for (let i = 0; i < 3; i++) {
      // Add some test transactions to mempool
      const tx1 = new Transaction(testAddresses[0], testAddresses[1], 10 + i)
      tx1.signature = "test_signature_" + i

      const tx2 = new Transaction(testAddresses[1], testAddresses[2], 5 + i)
      tx2.signature = "test_signature_" + (i + 10)

      await blockchain.addTransactionToMempool(tx1)
      await blockchain.addTransactionToMempool(tx2)

      // Mine block
      await blockchain.minePendingTransactions(testAddresses[0])

      console.log(`Mined test block ${i + 1}`)
    }

    console.log("Database seeded successfully!")
    console.log("Test addresses:")
    for (const address of testAddresses) {
      const balance = await blockchain.getBalance(address)
      console.log(`${address}: ${balance} SNC`)
    }
  } catch (error) {
    console.error("Error seeding database:", error)
  }

  process.exit(0)
}

// Run seeding if called directly
if (require.main === module) {
  seedDatabase()
}

module.exports = seedDatabase
