/**
 * Simple in-memory mempool (RAM only).
 * - Prevents duplicates by tx hash.
 * - FIFO queue semantics for miners.
 */

const { EventEmitter } = require("events")

class MemoryMempool extends EventEmitter {
  constructor() {
    super()
    this.queue = []
    this.indexByHash = new Map() // hash -> index in queue
    this.maxSize = 10_000
  }

  size() {
    return this.queue.length
  }

  has(hash) {
    return this.indexByHash.has(hash)
  }

  setMaxSize(n) {
    this.maxSize = Math.max(1, Number.parseInt(n || this.maxSize, 10))
  }

  enqueue(tx) {
    const hash = tx?.hash
    if (!hash) throw new Error("Transaction must have a 'hash' field")
    if (this.has(hash)) {
      return { inserted: false, reason: "duplicate", position: this.indexByHash.get(hash) }
    }
    if (this.size() >= this.maxSize) {
      return { inserted: false, reason: "mempool_full" }
    }
    this.queue.push(tx)
    this.indexByHash.set(hash, this.queue.length - 1)
    this.emit("enqueue", tx)
    return { inserted: true, position: this.queue.length - 1 }
  }

  dequeue() {
    if (this.queue.length === 0) return null
    const tx = this.queue.shift()
    // rebuild index map efficiently
    this.indexByHash.clear()
    for (let i = 0; i < this.queue.length; i++) {
      const h = this.queue[i]?.hash
      if (h) this.indexByHash.set(h, i)
    }
    this.emit("dequeue", tx)
    return tx
  }

  peek(n = 10) {
    return this.queue.slice(0, n)
  }

  clear() {
    this.queue = []
    this.indexByHash.clear()
    this.emit("clear")
  }

  toStatus(n = 10) {
    return {
      size: this.size(),
      sample: this.peek(n).map((t) => ({ hash: t.hash, type: t.type, timestamp: t.timestamp })),
      maxSize: this.maxSize,
    }
  }
}

module.exports = new MemoryMempool()
