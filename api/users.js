const pool = require('./db');

export default async function handler(req, res) {
  // 1. Log the method to check if request arrives
  console.log("API Hit:", req.method);

  if (req.method === 'GET') {
    const { username, password } = req.query;
    try {
      const result = await pool.query(
        'SELECT * FROM users WHERE username = $1 AND password = $2',
        [username, password]
      );
      
      if (result.rows.length > 0) {
        res.status(200).json(result.rows[0]);
      } else {
        // If 0 rows found, login failed
        console.log("Login failed: User not found or wrong password");
        res.status(401).json({ error: 'Invalid credentials' });
      }
    } catch (err) {
      console.error("Login Database Error:", err);
      res.status(500).json({ error: err.message });
    }
  } 
  else if (req.method === 'POST') {
    try {
      // 2. Safe Parsing: Handle body whether it comes as string or object
      let bodyData = req.body;
      if (typeof req.body === 'string') {
        bodyData = JSON.parse(req.body);
      }

      const { username, password, role, securityQuestion, securityAnswer } = bodyData;
      
      console.log("Attempting to register:", username); // Debug log

      const result = await pool.query(
        'INSERT INTO users (username, password, role, security_question, security_answer) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [username, password, role, securityQuestion, securityAnswer]
      );
      
      res.status(200).json(result.rows[0]);

    } catch (err) {
      // 3. SEND THE REAL ERROR to the frontend
      console.error("Registration Error:", err);
      res.status(500).json({ error: "DB Error: " + err.message });
    }
  }
}
