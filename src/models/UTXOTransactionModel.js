const { pool,isDbAvailable } = require("../database/config")
const mem = require("../storage/memory-store")

class UTXOTransactionModel {


  // Add transaction to mempool
  static async addToMempool(transaction, fee= 0.001) {
    if (!isDbAvailable()) {
      const ok = mem.mempoolAdd(transaction, fee)
      return ok ? transaction.hash : null
    }
    await pool.query(
      `INSERT INTO mempool_transactions (hash, raw_transaction, fee, timestamp)
       VALUES ($1, $2, $3, $4)`,
      [transaction.hash, JSON.stringify(transaction.toJSON()), fee, transaction.timestamp],
    )
  }

  // Get transactions from mempool
  static async getFromMempool(limit = 100) {
      if (!isDbAvailable()) {
      return mem.mempoolList(limit).map((row) => ({
        hash: row.hash,
        transaction: row.transaction,
        fee: row.fee,
        timestamp: row.timestamp,
      }))
    }

    const result = await pool.query(`SELECT * FROM mempool_transactions ORDER BY fee DESC, timestamp ASC LIMIT $1`, [
      limit,
    ])

    return result.rows.map((row) => ({
      hash: row.hash,
      transaction: row.raw_transaction,
      fee: Number.parseFloat(row.fee),
      timestamp: Number.parseInt(row.timestamp),
    }))
  }

  // Remove transaction from mempool
  static async removeFromMempool(txHash) {
    if (!isDbAvailable()) {
      mem.mempoolRemove(txHash)
      return true
    }
    await pool.query(`DELETE FROM mempool_transactions WHERE hash = $1`, [txHash])
  }

  // Get latest transactions - NEW METHOD
  static async getLatest(limit = 10) {
    if (!isDbAvailable()) {
      return mem.getLatestTx(limit).map((t) => ({
        hash: t.hash,
        timestamp: t.timestamp,
        type: t.type,
        blockIndex: t.blockIndex,
        blockHash: t.blockHash,
      }))
    }
    const result = await pool.query(
      `SELECT t.*, b.block_index, b.hash as block_hash, b.timestamp as block_timestamp,
              json_agg(
                json_build_object(
                  'amount', tio.amount,
                  'address', tio.address
                )
              ) as outputs
       FROM transactions t
       JOIN blocks b ON t.block_id = b.id
       LEFT JOIN transaction_outputs tio ON t.id = tio.transaction_id
       GROUP BY t.id, b.block_index, b.hash, b.timestamp
       ORDER BY b.block_index DESC, t.id DESC
       LIMIT $1`,
      [limit],
    )

    return result.rows.map((tx) => ({
      hash: tx.hash,
      timestamp: Number.parseInt(tx.timestamp),
      type: tx.tx_type,
      blockIndex: tx.block_index,
      blockHash: tx.block_hash,
      blockTimestamp: Number.parseInt(tx.block_timestamp),
      outputs: tx.outputs.filter((output) => output.amount !== null),
    }))
  }

  // Save confirmed transaction to database
  static async saveTransaction(transaction, blockId) {
    const client = await pool.connect()

    try {
      await client.query("BEGIN")
      console.log("Saving transaction")
      // Insert transaction
      // Check if transaction already exists
      const existingTx = await client.query(
        `SELECT id FROM transactions WHERE hash = $1`,
        [transaction.hash]
      )
      let transactionId=0
      if (existingTx.rows.length > 0) {
        transactionId = existingTx.rows[0].id
      } else {
        const txResult = await client.query(
          `INSERT INTO transactions (hash, block_id, timestamp, tx_type)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [transaction.hash, blockId, transaction.timestamp, transaction.type],
        )
        transactionId = txResult.rows[0].id
      }
      await client.query("DELETE FROM mempool_transactions WHERE hash = $1", [transaction.hash])


      // Insert inputs
      for (let i = 0; i < transaction.inputs.length; i++) {
        const input = transaction.inputs[i]
        // Handle coinbase inputs with special outputIndex
        let outputIndex = input.outputIndex
        if (input.previousTxHash === "0".repeat(64) && input.outputIndex === 0xffffffff) {
          // Use -1 for coinbase inputs to avoid PostgreSQL integer overflow
          outputIndex = -1
        }
        await client.query(
          `INSERT INTO transaction_inputs (transaction_id, previous_tx_hash, output_index, signature, public_key, sequence)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [transactionId, input.previousTxHash, outputIndex, input.signature, input.publicKey, input.sequence],
        )
      }

      // Insert outputs
      for (let i = 0; i < transaction.outputs.length; i++) {
        const output = transaction.outputs[i]
        await client.query(
          `INSERT INTO transaction_outputs (transaction_id, output_index, amount, script_pub_key, address)
           VALUES ($1, $2, $3, $4, $5)`,
          [transactionId, i, output.amount, output.scriptPubKey, output.address],
        )
      }

      await client.query("COMMIT")
      return transactionId
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Chỗ này Error saving transaction:", error)
      throw error
    } finally {
      client.release()
    }
  }

  // Get transaction by hash
  static async getByHash(hash) {
if (!isDbAvailable()) {
      const meta = mem.getTxByHash(hash)
      if (meta) {
        const block = meta.blockHash
          ? { index: meta.blockIndex, hash: meta.blockHash, timestamp: meta.blockTimestamp }
          : undefined
        return {
          transaction: {
            hash: meta.hash,
            timestamp: meta.timestamp,
            type: meta.type,
          },
          block,
          status: block ? "confirmed" : "pending",
        }
      }

      const memTx = mem.mempoolList(10000).find((m) => m.hash === hash)
      if (memTx) return { transaction: memTx.transaction, status: "pending" }
      return null
}
    const result = await pool.query(
      `SELECT t.*, b.block_index, b.hash as block_hash, b.timestamp as block_timestamp
       FROM transactions t
       LEFT JOIN blocks b ON t.block_id = b.id
       WHERE t.hash = $1`,
      [hash],
    )

    if (result.rows.length === 0) {
      // Check mempool
      const mempoolResult = await pool.query(`SELECT * FROM mempool_transactions WHERE hash = $1`, [hash])
      if (mempoolResult.rows.length > 0) {
        const tx = mempoolResult.rows[0]
        return {
          transaction: tx.raw_transaction,
          status: "pending",
          fee: Number.parseFloat(tx.fee),
        }
      }
      return null
    }

    const tx = result.rows[0]

    // Get inputs
    const inputsResult = await pool.query(`SELECT * FROM transaction_inputs WHERE transaction_id = $1 ORDER BY id`, [
      tx.id,
    ])

    // Get outputs
    const outputsResult = await pool.query(
      `SELECT * FROM transaction_outputs WHERE transaction_id = $1 ORDER BY output_index`,
      [tx.id],
    )

    return {
      transaction: {
        hash: tx.hash,
        inputs: inputsResult.rows.map((input) => ({
          previousTxHash: input.previous_tx_hash,
          outputIndex: input.output_index === -1 ? 0xffffffff : input.output_index,
          signature: input.signature,
          publicKey: input.public_key,
          sequence: input.sequence,
        })),
        outputs: outputsResult.rows.map((output) => ({
          amount: Number.parseFloat(output.amount),
          address: output.address,
          scriptPubKey: output.script_pub_key,
        })),
        timestamp: Number.parseInt(tx.timestamp),
        type: tx.tx_type,
      },
      block: tx.block_index
        ? {
            index: tx.block_index,
            hash: tx.block_hash,
            timestamp: Number.parseInt(tx.block_timestamp),
          }
        : null,
      status: tx.block_index ? "confirmed" : "pending",
    }
  }

  // Get transactions for an address
  static async getByAddress(address) {
    if (!isDbAvailable()) {
      // Approximation: scan memory tx meta with outputs to the address is not stored.
      // For explorer, we rely on BlockModel transactions list as a rough history.
      const out = []
      for (const b of mem.state.blocks) {
        for (const t of b.transactions || []) {
          out.push({
            hash: t.hash,
            timestamp: t.timestamp,
            type: t.type,
            blockIndex: b.index,
            blockHash: b.hash,
            blockTimestamp: b.timestamp,
          })
        }
      }
      out.sort((a, b) => b.blockIndex - a.blockIndex || b.timestamp - a.timestamp)
      return out
    }
    const result = await pool.query(
      `SELECT DISTINCT t.hash, t.timestamp, t.tx_type, b.block_index, b.hash as block_hash, b.timestamp as block_timestamp
       FROM transactions t
       JOIN blocks b ON t.block_id = b.id
       LEFT JOIN transaction_inputs ti ON t.id = ti.transaction_id
       LEFT JOIN transaction_outputs to_out ON t.id = to_out.transaction_id
       LEFT JOIN transaction_outputs prev_out ON ti.previous_tx_hash = (
         SELECT hash FROM transactions WHERE id = prev_out.transaction_id
       ) AND ti.output_index = prev_out.output_index
       WHERE to_out.address = $1 OR prev_out.address = $1
       ORDER BY b.block_index DESC, t.timestamp DESC`,
      [address],
    )

    const transactions = []
    for (const row of result.rows) {
      const txData = await this.getByHash(row.hash)
      if (txData) {
        transactions.push({
          ...txData.transaction,
          blockIndex: row.block_index,
          blockHash: row.block_hash,
          blockTimestamp: Number.parseInt(row.block_timestamp),
        })
      }
    }

    return transactions
  }

  // Get mempool size
  static async getMempoolSize() {
    if (!isDbAvailable()) return mem.mempoolSize()
    const result = await pool.query("SELECT COUNT(*) as count FROM mempool_transactions")
    return Number.parseInt(result.rows[0].count)
  }

  // Get total transaction count
  static async getTotalCount() {
    if (!isDbAvailable()) return mem.totalTx()
    const result = await pool.query("SELECT COUNT(*) as count FROM transactions")
    return Number.parseInt(result.rows[0].count)
  }
}

module.exports = UTXOTransactionModel
