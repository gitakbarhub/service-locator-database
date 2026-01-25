const pool = require('./db');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'POST') {
    const data = JSON.parse(req.body);
    try {
      const result = await pool.query(
        `INSERT INTO help_tickets (name, role, problem) VALUES ($1, $2, $3) RETURNING *`,
        [data.name, data.role, data.problem]
      );
      res.status(200).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } 
  else if (req.method === 'GET') {
    // Only Admin usually fetches this
    try {
      const result = await pool.query('SELECT * FROM help_tickets ORDER BY created_at DESC');
      res.status(200).json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}