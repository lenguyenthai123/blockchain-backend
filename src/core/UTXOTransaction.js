const crypto = require("crypto")
const secp256k1 = require("secp256k1")
const sha256 = require("sha256")

class TransactionInput {
  constructor(previousTxHash, outputIndex, signature, publicKey) {
    this.previousTxHash = previousTxHash
    this.outputIndex = outputIndex
    this.signature = signature
    this.publicKey = publicKey
    this.sequence = 0
  }

  toJSON() {
    return {
      previousTxHash: this.previousTxHash,
      outputIndex: this.outputIndex,
      signature: this.signature,
      publicKey: this.publicKey,
      sequence: this.sequence,
    }
  }
}

class TransactionOutput {
  constructor(amount, address) {
    this.amount = amount
    this.address = address
    this.scriptPubKey = this.createScriptPubKey(address)
  }

  createScriptPubKey(address) {
    // Simplified script - in real Bitcoin this would be more complex
    return `OP_DUP OP_HASH160 ${address} OP_EQUALVERIFY OP_CHECKSIG`
  }

  toJSON() {
    return {
      amount: this.amount,
      address: this.address,
      scriptPubKey: this.scriptPubKey,
    }
  }
}

class UTXOTransaction {
  constructor(inputs = [], outputs = [], timestamp = Date.now(), type = "transfer") {
    // Cast into TransactionInput and TransactionOutput objects
    this.inputs = inputs.map((input) => new TransactionInput(input.previousTxHash, input.outputIndex, input.signature, input.publicKey))
    this.outputs = outputs.map((output) => new TransactionOutput(output.amount, output.address))
    this.timestamp = timestamp
    this.hash = this.calculateHash()
    this.type = type
  }

  calculateHash() {
    const inputsStr = JSON.stringify(
      this.inputs.map((input) => ({
        previousTxHash: input.previousTxHash,
        outputIndex: input.outputIndex,
      })),
    )
    const outputsStr = JSON.stringify(this.outputs.map((output) => output.toJSON()))
    return sha256(inputsStr + outputsStr + this.timestamp)
  }

  // Create coinbase transaction (mining reward)
  static createCoinbase(minerAddress, amount, blockHeight) {
    const coinbaseInput = new TransactionInput("0".repeat(64), 0xffffffff, "", "")
    const coinbaseOutput = new TransactionOutput(amount, minerAddress)

    const tx = new UTXOTransaction([coinbaseInput], [coinbaseOutput])
    tx.type = "coinbase"
    tx.hash = tx.calculateHash()
    return tx
  }

    // Create coinbase transaction (mining reward)
  static createCoinbaseWithTime(minerAddress, amount, blockHeight, timestamp = Date.now()) {
    const coinbaseInput = new TransactionInput("0".repeat(64), 0xffffffff, "", "")
    const coinbaseOutput = new TransactionOutput(amount, minerAddress)

    const tx = new UTXOTransaction([coinbaseInput], [coinbaseOutput])
    tx.type = "coinbase"
    tx.hash = tx.calculateHash()
    return tx
  }

  // Verify transaction signatures
  isValid() {
    // Coinbase transactions don't need signature verification
    if (this.type === "coinbase") return true

    for (const input of this.inputs) {
      if (!this.verifyInputSignature(input)) {
        return false
      }
    }

    return true
  }

  verifyInputSignature(input) {
    try {
      console.log("Verifying input signature:", {
        previousTxHash: input.previousTxHash,
        outputIndex: input.outputIndex,
        signature: input.signature,
        publicKey: input.publicKey,
      })
      // Create message to verify (simplified)
      const message = this.hash + input.previousTxHash + input.outputIndex
      const messageHash = Buffer.from(sha256(message), "hex")
      const publicKeyBuffer = Buffer.from(input.publicKey, "hex")
      const signatureBuffer = Buffer.from(input.signature, "hex")

      return secp256k1.ecdsaVerify(signatureBuffer, messageHash, publicKeyBuffer)
    } catch (error) {
      console.error("Signature verification error:", error)
      return false
    }
  }

  // Calculate transaction fee
  calculateFee(inputValues) {
    const totalInput = inputValues.reduce((sum, value) => sum + value, 0)
    const totalOutput = this.outputs.reduce((sum, output) => sum + output.amount, 0)
    return totalInput - totalOutput
  }

  toJSON() {
    return {
      hash: this.hash,
      inputs: this.inputs.map((input) => input.toJSON()),
      outputs: this.outputs.map((output) => output.toJSON()),
      timestamp: this.timestamp,
      type: this.type,
    }
  }
}

module.exports = { UTXOTransaction, TransactionInput, TransactionOutput }
