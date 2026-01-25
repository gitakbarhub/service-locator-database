const pool = require('./db');

export default async function handler(req, res) {
  // Allow all origins (for testing)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  
  if (req.method === 'POST') {
    // Create new Request
    const data = JSON.parse(req.body);
    try {
      const result = await pool.query(
        `INSERT INTO service_requests (provider_id, user_name, phone, address, lat, lng, status) 
         VALUES ($1, $2, $3, $4, $5, $6, 'sent') RETURNING *`,
        [data.providerId, data.user, data.phone, data.address, data.lat, data.lng]
      );
      res.status(200).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } 
  else if (req.method === 'GET') {
    // Get Requests (For Provider or Admin)
    const { providerId, role } = req.query;
    try {
      let query = 'SELECT * FROM service_requests ORDER BY created_at DESC';
      let params = [];
      
      // If provider, only show their requests
      if (role !== 'admin' && providerId) {
        query = 'SELECT * FROM service_requests WHERE provider_id = $1 ORDER BY created_at DESC';
        params = [providerId];
      }
      
      const result = await pool.query(query, params);
      res.status(200).json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
  else if (req.method === 'PUT') {
    // Update Status (e.g., Mark as Read)
    const data = JSON.parse(req.body);
    try {
      await pool.query('UPDATE service_requests SET status = $1 WHERE id = $2', [data.status, data.id]);
      res.status(200).json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}
