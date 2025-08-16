# SanCoin Miner & Mempool Submission

This repository can run either:
- Server node (API): Express backend for wallet, explorer, and mempool submission.
- Miner worker: Periodically mines pending transactions from the mempool.

## 1) Ensure submissions go to the mempool

Endpoint (accepts signed UTXO tx):
POST /api/blockchain/submit-signed-transaction

Default behavior:
- Enqueues the transaction in the mempool.
- Response:
  {
    "success": true,
    "data": {
      "transactionHash": "…",
      "message": "Transaction added to mempool. It will be mined by a miner shortly."
    }
  }

Configuration:
- SUBMIT_TX_MODE=mempool   # default, enqueue only
- SUBMIT_TX_MODE=immediate # old behavior (mines immediately). Requires "minerAddress" in request body.
- You can also force immediate mining per-request by adding ?mine=true.

Legacy mempool endpoint (still supported):
POST /api/blockchain/utxo-transaction

## 2) Run the Miner

Environment:
- MINER_ADDRESS=san1yourmineraddress (REQUIRED)
- MINER_INTERVAL_MS=15000 (optional)
- MINER_ONCE=true (optional)
- NODE_ENV=development|production (optional)

Start miner:
- Using role switcher:
  MINER_ADDRESS=san1yourminer NODE_ROLE=miner node src/index.js

- One-off run (mine at most one block, then exit):
  MINER_ADDRESS=san1yourminer MINER_ONCE=true NODE_ROLE=miner node src/index.js

## 3) Run the API Server

NODE_ROLE=server node src/index.js
# or
npm run start
npm run start:server

## 4) Frontend submission

Just POST your signed transaction to:
  /api/blockchain/submit-signed-transaction

Example body:
{
  "hash": "0xdeadbeef...",
  "inputs": [
    { "previousTxHash": "…", "outputIndex": 0, "signature": "…", "publicKey": "…" }
  ],
  "outputs": [
    { "amount": 1.23, "address": "san1recipient…" }
  ],
  "timestamp": 1720000000000,
  "type": "transfer"
}

The server will place it in the mempool by default.
