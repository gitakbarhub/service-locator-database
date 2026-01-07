const { Pool } = require('pg');

const pool = new Pool({
  // PASTE YOUR FULL NEON STRING INSIDE THE QUOTES BELOW:
  connectionString: "postgresql://neondb_owner:npg_ozpwXvDtfh43@ep-gentle-pond-a4fh43a5-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  ssl: { rejectUnauthorized: false }
});

module.exports = pool;
