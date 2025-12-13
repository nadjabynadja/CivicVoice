/**
 * Turfs API Routes
 * Geographic segmentation and turf cutting for canvassing
 */

import { Router } from 'express';
import { db } from '../config/database.js';

const router = Router();

/**
 * GET /api/turfs
 * List all turfs for the user
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const { list_id } = req.query;

    let query = `
      SELECT
        t.id,
        t.name,
        t.description,
        t.voter_count,
        t.door_count,
        t.estimated_time_minutes,
        t.settings,
        t.created_at,
        l.name as list_name,
        ST_AsGeoJSON(t.boundary) as boundary_geojson,
        ST_AsGeoJSON(t.center) as center_geojson
      FROM turfs t
      LEFT JOIN lists l ON t.list_id = l.id
      WHERE t.user_id = $1
    `;
    const params = [userId];

    if (list_id) {
      query += ` AND t.list_id = $2`;
      params.push(list_id);
    }

    query += ` ORDER BY t.created_at DESC`;

    const turfs = await db.manyOrNone(query, params);

    // Parse GeoJSON
    const parsed = turfs.map(t => ({
      ...t,
      boundary: t.boundary_geojson ? JSON.parse(t.boundary_geojson) : null,
      center: t.center_geojson ? JSON.parse(t.center_geojson) : null,
    }));

    res.json(parsed);

  } catch (err) {
    console.error('[Turfs Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/turfs/auto-cut
 * Automatically divide a list into turfs based on geography
 */
router.post('/auto-cut', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const {
      list_id,
      doors_per_turf = 50,
      method = 'cluster', // 'cluster', 'grid', 'precinct'
    } = req.body;

    if (!list_id) {
      return res.status(400).json({ error: 'list_id is required' });
    }

    // Verify list ownership
    const list = await db.oneOrNone('SELECT id, name, voter_count FROM lists WHERE id = $1 AND user_id = $2', [list_id, userId]);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    // Get voters with locations from the list
    const voters = await db.manyOrNone(`
      SELECT
        lv.ncid,
        lv.household_id,
        v.street_address,
        v.city,
        v.zip_code,
        ST_Y(v.location::geometry) as lat,
        ST_X(v.location::geometry) as lng
      FROM list_voters lv
      JOIN voters v ON lv.ncid = v.ncid
      WHERE lv.list_id = $1 AND v.location IS NOT NULL
    `, [list_id]);

    if (voters.length === 0) {
      return res.status(400).json({
        error: 'No geocoded voters in this list. Please geocode addresses first.',
      });
    }

    // Get unique households (doors)
    const households = new Map();
    voters.forEach(v => {
      if (v.household_id && !households.has(v.household_id)) {
        households.set(v.household_id, {
          id: v.household_id,
          lat: v.lat,
          lng: v.lng,
          address: v.street_address,
          city: v.city,
          zip: v.zip_code,
          ncids: [],
        });
      }
      if (v.household_id) {
        households.get(v.household_id).ncids.push(v.ncid);
      }
    });

    const doors = Array.from(households.values());
    const numTurfs = Math.max(1, Math.ceil(doors.length / doors_per_turf));

    let turfs = [];

    if (method === 'cluster' || method === 'grid') {
      // Simple k-means-like clustering
      turfs = await clusterDoors(doors, numTurfs);
    } else if (method === 'precinct') {
      // Group by precinct
      turfs = await groupByPrecinct(list_id);
    }

    // Create turf records
    const createdTurfs = [];
    for (let i = 0; i < turfs.length; i++) {
      const turf = turfs[i];

      // Create polygon from convex hull of points
      const points = turf.doors.map(d => [d.lng, d.lat]);

      // Create turf record
      const created = await db.one(`
        INSERT INTO turfs (
          user_id, list_id, name, description,
          voter_count, door_count, estimated_time_minutes,
          center, settings
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($8, $9), 4326)::geography, $10)
        RETURNING id, name, voter_count, door_count, estimated_time_minutes
      `, [
        userId,
        list_id,
        `${list.name} - Turf ${i + 1}`,
        `Auto-generated turf with ${turf.doors.length} doors`,
        turf.ncids.length,
        turf.doors.length,
        Math.round(turf.doors.length * 3), // Estimate 3 min per door
        turf.center.lng,
        turf.center.lat,
        { method, doors_per_turf },
      ]);

      // Assign voters to turf
      if (turf.ncids.length > 0) {
        await db.none(`
          UPDATE list_voters
          SET turf_id = $1
          WHERE list_id = $2 AND ncid = ANY($3)
        `, [created.id, list_id, turf.ncids]);
      }

      createdTurfs.push({
        ...created,
        center: turf.center,
      });
    }

    res.json({
      success: true,
      turfs_created: createdTurfs.length,
      turfs: createdTurfs,
    });

  } catch (err) {
    console.error('[Auto-cut Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Simple k-means clustering for turf creation
 */
async function clusterDoors(doors, k) {
  if (doors.length === 0) return [];
  if (k >= doors.length) {
    // Each door is its own turf
    return doors.map(d => ({
      doors: [d],
      ncids: d.ncids,
      center: { lat: d.lat, lng: d.lng },
    }));
  }

  // Initialize centroids randomly
  const shuffled = [...doors].sort(() => Math.random() - 0.5);
  let centroids = shuffled.slice(0, k).map(d => ({ lat: d.lat, lng: d.lng }));

  const maxIterations = 50;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign doors to nearest centroid
    const clusters = Array.from({ length: k }, () => []);

    doors.forEach(door => {
      let minDist = Infinity;
      let nearest = 0;

      centroids.forEach((centroid, i) => {
        const dist = haversineDistance(door.lat, door.lng, centroid.lat, centroid.lng);
        if (dist < minDist) {
          minDist = dist;
          nearest = i;
        }
      });

      clusters[nearest].push(door);
    });

    // Update centroids
    const newCentroids = clusters.map(cluster => {
      if (cluster.length === 0) return { lat: 0, lng: 0 };
      const lat = cluster.reduce((sum, d) => sum + d.lat, 0) / cluster.length;
      const lng = cluster.reduce((sum, d) => sum + d.lng, 0) / cluster.length;
      return { lat, lng };
    });

    // Check convergence
    const moved = centroids.some((c, i) =>
      Math.abs(c.lat - newCentroids[i].lat) > 0.0001 ||
      Math.abs(c.lng - newCentroids[i].lng) > 0.0001
    );

    centroids = newCentroids;

    if (!moved) break;
  }

  // Create turf objects
  const clusters = Array.from({ length: k }, () => []);
  doors.forEach(door => {
    let minDist = Infinity;
    let nearest = 0;
    centroids.forEach((centroid, i) => {
      const dist = haversineDistance(door.lat, door.lng, centroid.lat, centroid.lng);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    });
    clusters[nearest].push(door);
  });

  return clusters
    .filter(c => c.length > 0)
    .map((cluster, i) => ({
      doors: cluster,
      ncids: cluster.flatMap(d => d.ncids),
      center: centroids[i],
    }));
}

/**
 * Haversine distance in meters
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Group by precinct
 */
async function groupByPrecinct(listId) {
  const precincts = await db.manyOrNone(`
    SELECT
      v.precinct_name,
      array_agg(DISTINCT lv.household_id) as households,
      array_agg(lv.ncid) as ncids,
      AVG(ST_Y(v.location::geometry)) as avg_lat,
      AVG(ST_X(v.location::geometry)) as avg_lng
    FROM list_voters lv
    JOIN voters v ON lv.ncid = v.ncid
    WHERE lv.list_id = $1 AND v.location IS NOT NULL
    GROUP BY v.precinct_name
  `, [listId]);

  return precincts.map(p => ({
    name: p.precinct_name,
    doors: p.households.filter(h => h).map(h => ({ id: h })),
    ncids: p.ncids,
    center: { lat: parseFloat(p.avg_lat), lng: parseFloat(p.avg_lng) },
  }));
}

/**
 * POST /api/turfs/manual
 * Create a turf with a manually drawn polygon
 */
router.post('/manual', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const { list_id, name, description, polygon } = req.body;

    if (!list_id || !polygon) {
      return res.status(400).json({ error: 'list_id and polygon are required' });
    }

    // Validate polygon format (GeoJSON)
    if (!polygon.type || polygon.type !== 'Polygon' || !polygon.coordinates) {
      return res.status(400).json({ error: 'Invalid polygon format. Expected GeoJSON Polygon.' });
    }

    // Verify list ownership
    const list = await db.oneOrNone('SELECT id, name FROM lists WHERE id = $1 AND user_id = $2', [list_id, userId]);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    // Find voters within the polygon
    const votersInPolygon = await db.manyOrNone(`
      SELECT lv.ncid, lv.household_id
      FROM list_voters lv
      JOIN voters v ON lv.ncid = v.ncid
      WHERE lv.list_id = $1
        AND v.location IS NOT NULL
        AND ST_Within(
          v.location::geometry,
          ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)
        )
    `, [list_id, JSON.stringify(polygon)]);

    if (votersInPolygon.length === 0) {
      return res.status(400).json({ error: 'No voters found within the specified polygon' });
    }

    const uniqueHouseholds = new Set(votersInPolygon.map(v => v.household_id).filter(h => h));

    // Calculate centroid
    const centroid = await db.one(`
      SELECT
        ST_Y(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))) as lat,
        ST_X(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))) as lng
    `, [JSON.stringify(polygon)]);

    // Create turf
    const turf = await db.one(`
      INSERT INTO turfs (
        user_id, list_id, name, description,
        boundary, center,
        voter_count, door_count, estimated_time_minutes,
        settings
      )
      VALUES (
        $1, $2, $3, $4,
        ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)::geography,
        ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography,
        $8, $9, $10,
        $11
      )
      RETURNING id, name, voter_count, door_count, estimated_time_minutes
    `, [
      userId,
      list_id,
      name || `${list.name} - Manual Turf`,
      description,
      JSON.stringify(polygon),
      centroid.lng,
      centroid.lat,
      votersInPolygon.length,
      uniqueHouseholds.size,
      Math.round(uniqueHouseholds.size * 3),
      { method: 'manual' },
    ]);

    // Assign voters to turf
    const ncids = votersInPolygon.map(v => v.ncid);
    await db.none(`
      UPDATE list_voters
      SET turf_id = $1
      WHERE list_id = $2 AND ncid = ANY($3)
    `, [turf.id, list_id, ncids]);

    res.json({
      ...turf,
      center: { lat: parseFloat(centroid.lat), lng: parseFloat(centroid.lng) },
    });

  } catch (err) {
    console.error('[Manual Turf Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/turfs/:id
 * Get turf details
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const { id } = req.params;

    const turf = await db.oneOrNone(`
      SELECT
        t.*,
        l.name as list_name,
        ST_AsGeoJSON(t.boundary) as boundary_geojson,
        ST_AsGeoJSON(t.center) as center_geojson
      FROM turfs t
      LEFT JOIN lists l ON t.list_id = l.id
      WHERE t.id = $1 AND t.user_id = $2
    `, [id, userId]);

    if (!turf) {
      return res.status(404).json({ error: 'Turf not found' });
    }

    res.json({
      ...turf,
      boundary: turf.boundary_geojson ? JSON.parse(turf.boundary_geojson) : null,
      center: turf.center_geojson ? JSON.parse(turf.center_geojson) : null,
    });

  } catch (err) {
    console.error('[Get Turf Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/turfs/:id/voters
 * Get voters in a turf
 */
router.get('/:id/voters', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const { id } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    // Verify turf ownership
    const turf = await db.oneOrNone('SELECT id, list_id FROM turfs WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!turf) {
      return res.status(404).json({ error: 'Turf not found' });
    }

    const voters = await db.manyOrNone(`
      SELECT
        lv.sort_order,
        lv.household_id,
        lv.contact_status,
        v.ncid,
        v.first_name,
        v.last_name,
        v.street_address,
        v.city,
        v.party,
        v.age,
        v.phone,
        v.turnout_score,
        ST_Y(v.location::geometry) as lat,
        ST_X(v.location::geometry) as lng
      FROM list_voters lv
      JOIN voters v ON lv.ncid = v.ncid
      WHERE lv.list_id = $1 AND lv.turf_id = $2
      ORDER BY lv.sort_order
      LIMIT $3 OFFSET $4
    `, [turf.list_id, id, parseInt(limit), parseInt(offset)]);

    res.json({ voters });

  } catch (err) {
    console.error('[Turf Voters Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/turfs/:id/route
 * Get optimized walking route for a turf
 */
router.get('/:id/route', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const { id } = req.params;

    const turf = await db.oneOrNone('SELECT id, list_id, route_data FROM turfs WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!turf) {
      return res.status(404).json({ error: 'Turf not found' });
    }

    // If we already have a cached route, return it
    if (turf.route_data) {
      return res.json(turf.route_data);
    }

    // Get unique addresses in order (TSP-like ordering by nearest neighbor)
    const addresses = await db.manyOrNone(`
      SELECT DISTINCT ON (lv.household_id)
        lv.household_id,
        v.street_address,
        v.city,
        v.zip_code,
        ST_Y(v.location::geometry) as lat,
        ST_X(v.location::geometry) as lng
      FROM list_voters lv
      JOIN voters v ON lv.ncid = v.ncid
      WHERE lv.turf_id = $1 AND v.location IS NOT NULL
      ORDER BY lv.household_id, lv.sort_order
    `, [id]);

    if (addresses.length === 0) {
      return res.json({ route: [], distance: 0, duration: 0 });
    }

    // Simple nearest neighbor TSP
    const route = nearestNeighborRoute(addresses);

    // Calculate total distance
    let totalDistance = 0;
    for (let i = 0; i < route.length - 1; i++) {
      totalDistance += haversineDistance(
        route[i].lat, route[i].lng,
        route[i + 1].lat, route[i + 1].lng
      );
    }

    const routeData = {
      route: route.map((addr, i) => ({
        order: i + 1,
        ...addr,
      })),
      distance: Math.round(totalDistance),
      estimatedDuration: Math.round(route.length * 3 + totalDistance / 80), // 3 min per door + walking time
    };

    // Cache the route
    await db.none(`
      UPDATE turfs
      SET route_data = $1, updated_at = NOW()
      WHERE id = $2
    `, [routeData, id]);

    res.json(routeData);

  } catch (err) {
    console.error('[Route Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Nearest neighbor algorithm for route optimization
 */
function nearestNeighborRoute(points) {
  if (points.length <= 1) return points;

  const route = [points[0]];
  const remaining = new Set(points.slice(1));

  while (remaining.size > 0) {
    const current = route[route.length - 1];
    let nearest = null;
    let minDist = Infinity;

    for (const point of remaining) {
      const dist = haversineDistance(current.lat, current.lng, point.lat, point.lng);
      if (dist < minDist) {
        minDist = dist;
        nearest = point;
      }
    }

    if (nearest) {
      route.push(nearest);
      remaining.delete(nearest);
    }
  }

  return route;
}

/**
 * DELETE /api/turfs/:id
 * Delete a turf
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const { id } = req.params;

    // Clear turf assignments first
    await db.none(`
      UPDATE list_voters
      SET turf_id = NULL
      WHERE turf_id = $1
    `, [id]);

    await db.none('DELETE FROM turfs WHERE id = $1 AND user_id = $2', [id, userId]);

    res.json({ success: true });

  } catch (err) {
    console.error('[Delete Turf Error]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
