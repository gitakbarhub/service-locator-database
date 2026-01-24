const pool = require('./db');

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');

  if (req.method === 'POST') {
    // Send a new Request
    const { providerId, userId, userName, userPhone, userAddress, userLat, userLng } = JSON.parse(req.body);
    try {
      const result = await pool.query(
        `INSERT INTO requests (provider_id, user_id, user_name, user_phone, user_address, user_lat, user_lng, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'sent') RETURNING id`,
        [providerId, userId || null, userName, userPhone, userAddress, userLat, userLng]
      );
      res.status(200).json({ success: true, requestId: result.rows[0].id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } 
  else if (req.method === 'GET') {
    // Get Requests (For Provider Notifications or User Status Check)
    const { providerId, requestId } = req.query;
    
    try {
      if (requestId) {
        // Check single request status (for User)
        const result = await pool.query('SELECT status FROM requests WHERE id = $1', [requestId]);
        if (result.rows.length > 0) res.status(200).json(result.rows[0]);
        else res.status(404).json({ error: 'Not found' });
      } 
      else if (providerId) {
        // Get all requests for a provider
        const result = await pool.query('SELECT * FROM requests WHERE provider_id = $1 ORDER BY created_at DESC', [providerId]);
        res.status(200).json(result.rows);
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
  else if (req.method === 'PATCH') {
    // Update Status (e.g., to 'seen' or 'accepted')
    const { requestId, status } = JSON.parse(req.body);
    try {
      await pool.query('UPDATE requests SET status = $1 WHERE id = $2', [status, requestId]);
      res.status(200).json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}