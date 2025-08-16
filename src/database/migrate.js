const { pool, testConnection } = require("./config")

const createTables = async () => {
  // Test connection first
  console.log("🔍 Testing database connection...")
  const isConnected = await testConnection()

  if (!isConnected) {
    throw new Error("Cannot connect to database. Please check your DATABASE_URL and network connection.")
  }

  const client = await pool.connect()

  try {
    await client.query("BEGIN")
    console.log("📝 Creating UTXO database tables...")

    // Blocks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS blocks (
        id SERIAL PRIMARY KEY,
        block_index INTEGER UNIQUE NOT NULL,
        hash VARCHAR(64) UNIQUE NOT NULL,
        previous_hash VARCHAR(64) NOT NULL,
        merkle_root VARCHAR(64) NOT NULL,
        timestamp BIGINT NOT NULL,
        nonce INTEGER NOT NULL,
        difficulty INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log("✅ Blocks table created")

    // Transactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        hash VARCHAR(64) UNIQUE NOT NULL,
        block_id INTEGER REFERENCES blocks(id) ON DELETE CASCADE,
        timestamp BIGINT NOT NULL,
        tx_type VARCHAR(20) DEFAULT 'transfer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log("✅ Transactions table created")

    // Transaction inputs (references to previous UTXOs)
    await client.query(`
      CREATE TABLE IF NOT EXISTS transaction_inputs (
        id SERIAL PRIMARY KEY,
        transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
        previous_tx_hash VARCHAR(64) NOT NULL,
        output_index INTEGER NOT NULL,
        signature TEXT NOT NULL,
        public_key TEXT NOT NULL,
        sequence INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log("✅ Transaction inputs table created")

    // Transaction outputs (new UTXOs)
    await client.query(`
      CREATE TABLE IF NOT EXISTS transaction_outputs (
        id SERIAL PRIMARY KEY,
        transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
        output_index INTEGER NOT NULL,
        amount DECIMAL(20, 8) NOT NULL,
        script_pub_key TEXT NOT NULL,
        address VARCHAR(64) NOT NULL,
        is_spent BOOLEAN DEFAULT FALSE,
        spent_by_tx_hash VARCHAR(64),
        spent_by_input_index INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(transaction_id, output_index)
      )
    `)
    console.log("✅ Transaction outputs table created")

    // UTXO set (unspent transaction outputs) - for quick lookups
    await client.query(`
      CREATE TABLE IF NOT EXISTS utxo_set (
        id SERIAL PRIMARY KEY,
        tx_hash VARCHAR(64) NOT NULL,
        output_index INTEGER NOT NULL,
        amount DECIMAL(20, 8) NOT NULL,
        address VARCHAR(64) NOT NULL,
        script_pub_key TEXT NOT NULL,
        block_height INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tx_hash, output_index)
      )
    `)
    console.log("✅ UTXO set table created")

    // Mempool for pending transactions
    await client.query(`
      CREATE TABLE IF NOT EXISTS mempool_transactions (
        id SERIAL PRIMARY KEY,
        hash VARCHAR(64) UNIQUE NOT NULL,
        raw_transaction JSONB NOT NULL,
        fee DECIMAL(20, 8) NOT NULL,
        timestamp BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log("✅ Mempool transactions table created")

    // Address balances cache (calculated from UTXO set)
    await client.query(`
      CREATE TABLE IF NOT EXISTS address_balances (
        id SERIAL PRIMARY KEY,
        address VARCHAR(64) UNIQUE NOT NULL,
        balance DECIMAL(20, 8) DEFAULT 0,
        utxo_count INTEGER DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log("✅ Address balances table created")

    // Indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_blocks_hash ON blocks(hash);
      CREATE INDEX IF NOT EXISTS idx_blocks_index ON blocks(block_index);
      CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(hash);
      CREATE INDEX IF NOT EXISTS idx_transactions_block ON transactions(block_id);
      CREATE INDEX IF NOT EXISTS idx_tx_inputs_prev_tx ON transaction_inputs(previous_tx_hash, output_index);
      CREATE INDEX IF NOT EXISTS idx_tx_outputs_address ON transaction_outputs(address);
      CREATE INDEX IF NOT EXISTS idx_tx_outputs_spent ON transaction_outputs(is_spent);
      CREATE INDEX IF NOT EXISTS idx_utxo_address ON utxo_set(address);
      CREATE INDEX IF NOT EXISTS idx_utxo_tx_output ON utxo_set(tx_hash, output_index);
      CREATE INDEX IF NOT EXISTS idx_mempool_hash ON mempool_transactions(hash);
      CREATE INDEX IF NOT EXISTS idx_address_balances_address ON address_balances(address);
    `)
    console.log("✅ Database indexes created")

    await client.query("COMMIT")
    console.log("🎉 UTXO database tables created successfully")
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("❌ Error creating tables:", error)
    throw error
  } finally {
    client.release()
  }
}

// Run migration if called directly
if (require.main === module) {
  createTables()
    .then(() => {
      console.log("✅ Migration completed successfully")
      process.exit(0)
    })
    .catch((error) => {
      console.error("❌ Migration failed:", error)
      process.exit(1)
    })
}

module.exports = createTables
