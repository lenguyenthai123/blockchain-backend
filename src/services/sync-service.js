/**
 * Peer sync service: gossip mempool and announce blocks.
 * Configure peers via PEERS="http://host1:3001,http://host2:3001"
 */
class SyncService {
  constructor(appBaseUrl) {
    this.peers = (process.env.PEERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    this.baseUrl = appBaseUrl || `http://localhost:${process.env.PORT || 3001}`
    this.intervalMs = Number.parseInt(process.env.SYNC_INTERVAL_MS || "15000", 10)
    this.timer = null
  }

  log(...args) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[sync]", ...args)
    }
  }

  async broadcastTx(tx) {
    await Promise.all(
      this.peers.map(async (p) => {
        try {
          await fetch(`${p}/api/sync/tx`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tx),
          })
        } catch {
          // ignore
        }
      }),
    )
  }

  async broadcastBlock({ index, hash }) {
    await Promise.all(
      this.peers.map(async (p) => {
        try {
          await fetch(`${p}/api/sync/announce-block`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blockIndex: index, blockHash: hash }),
          })
        } catch {
          // ignore
        }
      }),
    )
  }

  async pullPeerMempool() {
    for (const p of this.peers) {
      try {
        const r = await fetch(`${p}/api/sync/mempool?limit=100`)
        if (!r.ok) continue
        const data = await r.json()
        const txs = Array.isArray(data.transactions) ? data.transactions : []
        for (const tx of txs) {
          // Push to our local mempool (server route handles duplicates)
          await fetch(`${this.baseUrl}/api/sync/tx`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tx),
          })
        }
      } catch (e) {
        this.log("peer mempool pull failed:", p, e.message)
      }
    }
  }

  start() {
    if (this.timer) return
    if (this.peers.length === 0) {
      this.log("no peers configured; sync service idle")
      return
    }
    this.log("starting sync loop with peers:", this.peers)
    this.timer = setInterval(() => this.pullPeerMempool(), this.intervalMs)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}

module.exports = SyncService
