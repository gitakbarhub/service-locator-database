const pool = require('./db');

export default async function handler(req, res) {
  // Setup CORS to allow your app to talk to the server
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'GET') {
    // LOGIN LOGIC
    const { username, password } = req.query;
    try {
      const result = await pool.query(
        'SELECT * FROM users WHERE username = $1 AND password = $2',
        [username, password]
      );
      
      if (result.rows.length > 0) {
        res.status(200).json(result.rows[0]);
      } else {
        res.status(401).json({ error: 'User not found in database. Check spelling.' });
      }
    } catch (err) {
      console.error("Login Error:", err);
      res.status(500).json({ error: "Database Connection Failed: " + err.message });
    }
  } 
  else if (req.method === 'POST') {
    // REGISTER LOGIC
    try {
      // --- THE FIX: Handle both String and Object data ---
      let bodyData = req.body;
      if (typeof req.body === 'string') {
        bodyData = JSON.parse(req.body);
      }

      const { username, password, role, securityQuestion, securityAnswer } = bodyData;

      const result = await pool.query(
        'INSERT INTO users (username, password, role, security_question, security_answer) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [username, password, role, securityQuestion, securityAnswer]
      );
      
      res.status(200).json(result.rows[0]);

    } catch (err) {
      console.error("Register Error:", err);
      res.status(500).json({ error: "Register Failed: " + err.message });
    }
  }
}
