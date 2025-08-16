const crypto = require("crypto")
const secp256k1 = require("secp256k1")
const sha256 = require("sha256")

class Transaction {
  constructor(fromAddress, toAddress, amount, timestamp = Date.now()) {
    this.fromAddress = fromAddress
    this.toAddress = toAddress
    this.amount = amount
    this.timestamp = timestamp
    this.hash = this.calculateHash()
    this.signature = null
  }

  calculateHash() {
    return sha256(this.fromAddress + this.toAddress + this.amount + this.timestamp)
  }

  signTransaction(privateKey) {
    // This should NEVER be called in backend - only for reference
    throw new Error("Private keys should never be handled by backend!")
  }

  isValid() {
    // Genesis transaction (mining reward)
    if (this.fromAddress === null) return true

    if (!this.signature || this.signature.length === 0) {
      throw new Error("No signature in this transaction")
    }

    try {
      const publicKeyBuffer = Buffer.from(this.fromAddress, "hex")
      const hashBuffer = Buffer.from(this.hash, "hex")
      const signatureBuffer = Buffer.from(this.signature, "hex")

      return secp256k1.ecdsaVerify(signatureBuffer, hashBuffer, publicKeyBuffer)
    } catch (error) {
      console.error("Transaction validation error:", error.message)
      return false
    }
  }

  toJSON() {
    return {
      hash: this.hash,
      fromAddress: this.fromAddress,
      toAddress: this.toAddress,
      amount: this.amount,
      timestamp: this.timestamp,
      signature: this.signature,
    }
  }
}

module.exports = Transaction
