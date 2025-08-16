const Joi = require("joi")

const transactionSchema = Joi.object({
  fromAddress: Joi.string().required(),
  toAddress: Joi.string().required(),
  amount: Joi.number().positive().required(),
  signature: Joi.string().required(),
})

const validateTransaction = (req, res, next) => {
  const { error } = transactionSchema.validate(req.body)

  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message,
    })
  }

  next()
}

const validateAddress = (req, res, next) => {
  const address = req.params.address

  if (!address || address.length < 10) {
    return res.status(400).json({
      success: false,
      error: "Invalid address format",
    })
  }

  next()
}

module.exports = {
  validateTransaction,
  validateAddress,
}
