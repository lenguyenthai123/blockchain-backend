require("dotenv").config()
const axios = require("axios")

const API_BASE = process.env.FRONTEND_URL || "http://localhost:3001"

async function testAllAPIs() {
  console.log("🧪 Testing all SanCoin APIs...")

  const tests = [
    // Health checks
    { name: "Health Check", method: "GET", url: `${API_BASE}/health` },
    { name: "API Health Check", method: "GET", url: `${API_BASE}/api/health` },

    // Blockchain info
    { name: "Blockchain Info", method: "GET", url: `${API_BASE}/api/blockchain/info` },
    { name: "Network Stats", method: "GET", url: `${API_BASE}/api/blockchain/stats` },

    // Blocks
    { name: "Latest Blocks", method: "GET", url: `${API_BASE}/api/blockchain/blocks/latest?limit=5` },
    { name: "Block by Index", method: "GET", url: `${API_BASE}/api/blockchain/block/0` },

    // Mempool
    { name: "Mempool", method: "GET", url: `${API_BASE}/api/blockchain/mempool?limit=10` },

    // UTXO Stats
    { name: "UTXO Stats", method: "GET", url: `${API_BASE}/api/blockchain/utxo-stats` },

    // Address operations (using genesis address)
    {
      name: "Address Balance",
      method: "GET",
      url: `${API_BASE}/api/blockchain/balance/san1genesis000000000000000000000000`,
    },
    {
      name: "Address UTXOs",
      method: "GET",
      url: `${API_BASE}/api/blockchain/address/san1genesis000000000000000000000000/utxos`,
    },
    {
      name: "Address Transactions",
      method: "GET",
      url: `${API_BASE}/api/blockchain/address/san1genesis000000000000000000000000/transactions`,
    },
  ]

  let passed = 0
  let failed = 0

  for (const test of tests) {
    try {
      const response = await axios({
        method: test.method,
        url: test.url,
        timeout: 5000,
      })

      if (response.status === 200 && response.data.success) {
        console.log(`✅ ${test.name}: PASSED`)
        passed++
      } else {
        console.log(`❌ ${test.name}: FAILED - ${response.data.error || "Unknown error"}`)
        failed++
      }
    } catch (error) {
      console.log(`❌ ${test.name}: FAILED - ${error.message}`)
      failed++
    }
  }

  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`)

  if (failed === 0) {
    console.log("🎉 All APIs are working correctly!")
  } else {
    console.log("⚠️  Some APIs need attention.")
  }
}

// Run tests
testAllAPIs().catch(console.error)
