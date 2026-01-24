const pool = require('./db');

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');

  if (req.method === 'POST') {
    // Send a new Request (or Help Message)
    const { providerId, userId, userName, userPhone, userAddress, userLat, userLng, type } = JSON.parse(req.body);
    
    // Req 14: If providerId is 0, it's a Help Message to Admin.
    // Req 11: Service Request includes details.
    try {
      // Note: We reuse 'requests' table. Ensure your DB has these columns.
      // If 'type' column doesn't exist, we rely on provider_id=0 to distinguish help.
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
    const { providerId, requestId } = req.query;
    try {
      if (requestId) {
        // Check single request status (for User Ticks)
        const result = await pool.query('SELECT status FROM requests WHERE id = $1', [requestId]);
        if (result.rows.length > 0) res.status(200).json(result.rows[0]);
        else res.status(404).json({ error: 'Not found' });
      } 
      else if (providerId) {
        // Get all requests for a provider (or Admin if providerId=0)
        const result = await pool.query('SELECT * FROM requests WHERE provider_id = $1 ORDER BY created_at DESC', [providerId]);
        res.status(200).json(result.rows);
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
  else if (req.method === 'PATCH') {
    // Update Status (Req 10: 'sent' -> 'seen')
    const { requestId, status } = JSON.parse(req.body);
    try {
      await pool.query('UPDATE requests SET status = $1 WHERE id = $2', [status, requestId]);
      res.status(200).json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}
