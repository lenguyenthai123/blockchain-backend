const rateLimit = require("express-rate-limit")

// Rate limiting
const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: message,
    },
    standardHeaders: true,
    legacyHeaders: false,
  })
}

// Different limits for different endpoints
const generalLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // limit each IP to 100 requests per windowMs
  "Too many requests from this IP, please try again later.",
)

const transactionLimit = createRateLimit(
  60 * 1000, // 1 minute
  10, // limit each IP to 10 transactions per minute
  "Too many transaction requests, please try again later.",
)

const miningLimit = createRateLimit(
  60 * 1000, // 1 minute
  1, // limit each IP to 1 mining request per minute
  "Mining rate limit exceeded, please try again later.",
)

module.exports = {
  generalLimit,
  transactionLimit,
  miningLimit,
}
