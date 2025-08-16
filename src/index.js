const path = require("path")
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") })

/**
 * Role Switcher
 * - NODE_ROLE=server -> start API server
 * - NODE_ROLE=miner  -> start RAM-based miner
 */

const role = (process.env.NODE_ROLE || "server").toLowerCase()
console.log(`🔧 Running as: ${role}`)
if (role === "miner") {
  console.log("🎛️ NODE_ROLE=miner — starting RAM miner…")
  require("./miner")
} else {
  console.log("🎛️ NODE_ROLE=server — starting API server…")
  require("./server")
}
