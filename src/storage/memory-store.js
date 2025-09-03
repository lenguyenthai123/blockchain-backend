/**
 * In-memory blockchain store (RAM fallback).
 * Used when the database is unavailable.
 */     

const state = {
  blocks: [], // { index, hash, previousHash, merkleRoot, timestamp, nonce, difficulty, transactions: [{ hash, timestamp, type }] }
  txByHash: new Map(), // hash -> { hash, timestamp, type, blockIndex?, blockHash?, blockTimestamp? }
  utxos: new Map(), // `${txHash}:${index}` -> { txHash, index, amount, address, scriptPubKey, blockIndex }
  utxosByAddress: new Map(), // address -> Array<utxoKey>
  addressBalance: new Map(), // address -> number
  mempool: [], // [{ hash, transaction, fee, timestamp }]
}

function reset() {
  state.blocks = []
  state.txByHash.clear()
  state.utxos.clear()
  state.utxosByAddress.clear()
  state.addressBalance.clear()
  state.mempool = []
}

function ensureAddressMap(address) {
  if (!state.utxosByAddress.has(address)) state.utxosByAddress.set(address, [])
}

function addBlock(block) {
  state.blocks.push(block)
}

function getLatestBlock() {
  if (state.blocks.length === 0) return null
  return state.blocks[state.blocks.length - 1]
}

function getBlockByIndex(index) {
  return state.blocks.find((b) => b.index === index) || null
}

function getBlockByHash(hash) {
  return state.blocks.find((b) => b.hash === hash) || null
}

function getLatestBlocks(limit = 10) {
  return [...state.blocks].slice(-limit).reverse()
}

function totalBlocks() {
  return state.blocks.length
}

function addTxMeta(txMeta) {
  state.txByHash.set(txMeta.hash, txMeta)
}

function getTxByHash(hash) {
  return state.txByHash.get(hash) || null
}

function getLatestTx(limit = 10) {
  const arr = Array.from(state.txByHash.values())
  arr.sort((a, b) => (b.blockIndex ?? 0) - (a.blockIndex ?? 0) || b.timestamp - a.timestamp)
  return arr.slice(0, limit)
}

function totalTx() {
  return state.txByHash.size
}

function addUTXO(txHash, index, amount, address, scriptPubKey, blockIndex) {
  const key = `${txHash}:${index}`
  state.utxos.set(key, { txHash, index, amount, address, scriptPubKey, blockIndex })
  ensureAddressMap(address)
  state.utxosByAddress.get(address).push(key)
  recomputeAddressBalance(address)
}

function removeUTXO(txHash, index) {
  const key = `${txHash}:${index}`
  const utxo = state.utxos.get(key)
  if (!utxo) return
  state.utxos.delete(key)
  const list = state.utxosByAddress.get(utxo.address) || []
  const i = list.indexOf(key)
  if (i >= 0) list.splice(i, 1)
  recomputeAddressBalance(utxo.address)
}

function getUTXO(txHash, index) {
  return state.utxos.get(`${txHash}:${index}`) || null
}

function getUTXOsByAddress(address) {
  const keys = state.utxosByAddress.get(address) || []
  return keys.map((k) => state.utxos.get(k)).filter(Boolean)
}

function totalUTXOCount() {
  return state.utxos.size
}

function totalUTXOValue() {
  let sum = 0
  for (const utxo of state.utxos.values()) sum += utxo.amount
  return sum
}

function largestUTXO() {
  let max = null
  for (const utxo of state.utxos.values()) {
    if (!max || utxo.amount > max.amount) max = utxo
  }
  return max
}

function recomputeAddressBalance(address) {
  const utxos = getUTXOsByAddress(address)
  const sum = utxos.reduce((s, u) => s + u.amount, 0)
  state.addressBalance.set(address, sum)
  return sum
}

function getAddressBalance(address) {
  if (!state.addressBalance.has(address)) {
    recomputeAddressBalance(address)
  }
  return state.addressBalance.get(address) || 0
}

function setAddressBalance(address) {
  return recomputeAddressBalance(address)
}

/* Mempool (RAM) */

function mempoolSize() {
  return state.mempool.length
}

function mempoolAdd(tx, fee = 0.001) {
  if (!tx?.hash) throw new Error("Transaction requires hash")
  if (state.mempool.find((m) => m.hash === tx.hash)) return false
  state.mempool.push({
    hash: tx.hash,
    transaction: tx,
    fee,
    timestamp: tx.timestamp || Date.now(),
  })
  return true
}

function mempoolRemove(hash) {
  const idx = state.mempool.findIndex((m) => m.hash === hash)
  if (idx >= 0) state.mempool.splice(idx, 1)
}

function mempoolList(limit = 100) {
  return state.mempool.slice(0, limit)
}

module.exports = {
  state,
  reset,
  // blocks
  addBlock,
  getLatestBlock,
  getBlockByIndex,
  getBlockByHash,
  getLatestBlocks,
  totalBlocks,
  // tx meta
  addTxMeta,
  getTxByHash,
  getLatestTx,
  totalTx,
  // utxos
  addUTXO,
  removeUTXO,
  getUTXO,
  getUTXOsByAddress,
  totalUTXOCount,
  totalUTXOValue,
  largestUTXO,
  getAddressBalance,
  setAddressBalance,
  // mempool
  mempoolAdd,
  mempoolRemove,
  mempoolList,
  mempoolSize,
}
