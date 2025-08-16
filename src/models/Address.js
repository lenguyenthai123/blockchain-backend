const { pool } = require("../database/config")

class AddressModel {
  static async updateBalance(address, balance) {
    await pool.query(
      `INSERT INTO address_balances (address, balance, last_updated)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (address)
       DO UPDATE SET balance = $2, last_updated = CURRENT_TIMESTAMP`,
      [address, balance],
    )
  }

  static async getBalance(address) {
    // Calculate balance from UTXO set
    const result = await pool.query(`SELECT COALESCE(SUM(amount), 0) as balance FROM utxo_set WHERE address = $1`, [
      address,
    ])

    const balance = Number.parseFloat(result.rows[0].balance) || 0

    // Update cache
    await this.updateBalance(address, balance)

    return balance
  }

  static async getCachedBalance(address) {
    const result = await pool.query(`SELECT balance FROM address_balances WHERE address = $1`, [address])

    if (result.rows.length === 0) {
      return await this.getBalance(address)
    }

    return Number.parseFloat(result.rows[0].balance)
  }
}

module.exports = AddressModel
