require("dotenv").config()
const { testConnection } = require("./src/database/config")

async function main() {
  console.log("🔍 Testing database connection...")
  console.log("DATABASE_URL:", process.env.DATABASE_URL ? "Set" : "Not set")

  const isConnected = await testConnection()

  if (isConnected) {
    console.log("✅ Database connection successful!")
  } else {
    console.log("❌ Database connection failed!")
    console.log("🔧 Please check your .env file and database settings")
  }

  process.exit(0)
}

main()
