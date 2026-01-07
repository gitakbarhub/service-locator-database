const pool = require('./db');

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Get all shops. Note: ST_X and ST_Y extract lat/lng from PostGIS geometry
    try {
      const result = await pool.query(`
        SELECT id, owner_id as "ownerId", name, service, phone, address, 
               open_time as "openTime", close_time as "closeTime",
               ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat,
               rating, reviews, image, description, user_reviews as "userReviews"
        FROM shops
      `);
      res.status(200).json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } 
  else if (req.method === 'POST') {
    // Add or Update Shop
    const data = JSON.parse(req.body);
    
    // UPDATE Logic (if ID exists)
    if (data.id && !String(data.id).startsWith('temp')) {
       // You can implement specific UPDATE SQL here if needed. 
       // For simplicity, we are focusing on INSERT for new shops in this snippet.
    }

    // INSERT Logic
    try {
      const query = `
        INSERT INTO shops (owner_id, name, service, phone, address, open_time, close_time, location, rating, reviews, image, description, user_reviews)
        VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($8, $9), 4326), $10, $11, $12, $13, $14)
        RETURNING id
      `;
      const values = [
        data.ownerId, data.name, data.service, data.phone, data.address,
        data.openTime, data.closeTime, data.lng, data.lat, // PostGIS Point is (Lng, Lat)
        data.rating, data.reviews, data.image, data.description, JSON.stringify(data.userReviews)
      ];
      
      const result = await pool.query(query, values);
      res.status(200).json({ success: true, newId: result.rows[0].id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
}