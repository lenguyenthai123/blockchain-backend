const { pool } = require("../database/config")

class TransactionModel {
  static async addToMempool(txData) {
    const result = await pool.query(
      `INSERT INTO mempool_transactions (hash, raw_transaction, fee, timestamp)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [txData.hash, JSON.stringify(txData), 0.001, txData.timestamp],
    )
    return result.rows[0].id
  }

  static async getFromMempool(limit = 100) {
    const result = await pool.query(`SELECT * FROM mempool_transactions ORDER BY timestamp ASC LIMIT $1`, [limit])

    return result.rows.map((row) => ({
      hash: row.hash,
      fromAddress: row.raw_transaction.fromAddress,
      toAddress: row.raw_transaction.toAddress,
      amount: Number.parseFloat(row.raw_transaction.amount),
      signature: row.raw_transaction.signature,
      timestamp: Number.parseInt(row.raw_transaction.timestamp),
    }))
  }

  static async getByHash(hash) {
    // First check in confirmed transactions
    let result = await pool.query(
      `SELECT t.*, b.block_index, b.hash as block_hash, b.timestamp as block_timestamp
       FROM transactions t
       JOIN blocks b ON t.block_id = b.id
       WHERE t.hash = $1`,
      [hash],
    )

    if (result.rows.length > 0) {
      const tx = result.rows[0]
      return {
        transaction: {
          hash: tx.hash,
          timestamp: Number.parseInt(tx.timestamp),
          type: tx.tx_type,
        },
        block: {
          index: tx.block_index,
          hash: tx.block_hash,
          timestamp: Number.parseInt(tx.block_timestamp),
        },
        status: "confirmed",
      }
    }

    // Check in mempool
    result = await pool.query(`SELECT * FROM mempool_transactions WHERE hash = $1`, [hash])

    if (result.rows.length > 0) {
      const tx = result.rows[0]
      return {
        transaction: tx.raw_transaction,
        status: "pending",
      }
    }

    return null
  }

  static async getByAddress(address) {
    const result = await pool.query(
      `SELECT t.*, b.block_index, b.hash as block_hash, b.timestamp as block_timestamp
       FROM transactions t
       JOIN blocks b ON t.block_id = b.id
       LEFT JOIN transaction_outputs to_out ON t.id = to_out.transaction_id
       WHERE to_out.address = $1
       ORDER BY b.block_index DESC, t.id DESC`,
      [address],
    )

    return result.rows.map((tx) => ({
      hash: tx.hash,
      timestamp: Number.parseInt(tx.timestamp),
      type: tx.tx_type,
      blockIndex: tx.block_index,
      blockHash: tx.block_hash,
      blockTimestamp: Number.parseInt(tx.block_timestamp),
    }))
  }

  static async getMempoolSize() {
    const result = await pool.query("SELECT COUNT(*) as count FROM mempool_transactions")
    return Number.parseInt(result.rows[0].count)
  }

  static async getTotalCount() {
    const result = await pool.query("SELECT COUNT(*) as count FROM transactions")
    return Number.parseInt(result.rows[0].count)
  }
}

module.exports = TransactionModel
