const pool = require('./db');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  
  if (req.method === 'POST') {
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
    const { providerId, role, userId } = req.query; // userId param for "My Requests"
    try {
      let query = 'SELECT * FROM service_requests ORDER BY created_at DESC';
      let params = [];
      
      if (role === 'provider' && providerId) {
        query = 'SELECT * FROM service_requests WHERE provider_id = $1 ORDER BY created_at DESC';
        params = [providerId];
      } else if (role === 'user' && userId) {
        // Feature: Users see their own sent requests
        query = 'SELECT * FROM service_requests WHERE user_name = $1 ORDER BY created_at DESC';
        params = [userId]; 
      }
      
      const result = await pool.query(query, params);
      
      // Auto-update status to 'delivered' if viewed by provider
      if (role === 'provider' && result.rows.length > 0) {
         // In a real app, we'd batch update only 'sent' ones. 
         // For now, we assume fetching list means delivery.
         const ids = result.rows.filter(r => r.status === 'sent').map(r => r.id);
         if(ids.length > 0) {
             // Async update in background
             pool.query('UPDATE service_requests SET status = $1 WHERE id = ANY($2::int[])', ['delivered', ids]);
         }
      }

      res.status(200).json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
  else if (req.method === 'PUT') {
    const data = JSON.parse(req.body);
    try {
      await pool.query('UPDATE service_requests SET status = $1 WHERE id = $2', [data.status, data.id]);
      res.status(200).json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
  else if (req.method === 'DELETE') {
    const { id } = req.query;
    try {
        await pool.query('DELETE FROM service_requests WHERE id = $1', [id]);
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
  }
}
