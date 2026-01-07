const pool = require('./db');

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Used for Login: Check if user exists
    const { username, password } = req.query;
    try {
      const result = await pool.query(
        'SELECT * FROM users WHERE username = $1 AND password = $2',
        [username, password]
      );
      if (result.rows.length > 0) {
        res.status(200).json(result.rows[0]);
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } 
  else if (req.method === 'POST') {
    // Used for Register
    const { username, password, role, securityQuestion, securityAnswer } = JSON.parse(req.body);
    try {
      const result = await pool.query(
        'INSERT INTO users (username, password, role, security_question, security_answer) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [username, password, role, securityQuestion, securityAnswer]
      );
      res.status(200).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: 'User likely exists or error occurred' });
    }
  }
}