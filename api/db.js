const { Pool } = require('pg');

const pool = new Pool({
  // PASTE YOUR FULL NEON STRING INSIDE THE QUOTES BELOW:
  connectionString: "postgresql://neondb_owner:npg_pIbf8HD1yGaj@ep-rapid-star-a4v0qs89-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  ssl: { rejectUnauthorized: false }
});

module.exports = pool;
