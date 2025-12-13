/**
 * Geocode API Routes
 * Address geocoding using Census Geocoder and Nominatim
 */

import { Router } from 'express';
import { db } from '../config/database.js';

const router = Router();

const CENSUS_GEOCODER_URL = process.env.CENSUS_GEOCODER_URL || 'https://geocoding.geo.census.gov/geocoder';
const NOMINATIM_URL = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

// Rate limiting for geocoding (to respect API limits)
const geocodeQueue = [];
let isProcessing = false;

/**
 * POST /api/geocode/single
 * Geocode a single address
 */
router.post('/single', async (req, res) => {
  try {
    const { street, city, state = 'NC', zip } = req.body;

    if (!street) {
      return res.status(400).json({ error: 'Street address is required' });
    }

    const result = await geocodeAddress(street, city, state, zip);

    res.json(result);

  } catch (err) {
    console.error('[Single Geocode Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/geocode/batch
 * Start batch geocoding for voters
 */
router.post('/batch', async (req, res) => {
  try {
    const { county, limit = 1000 } = req.body;

    // Get voters that need geocoding
    let query = `
      SELECT ncid, street_address, city, state, zip_code
      FROM voters
      WHERE location IS NULL
        AND geocode_status IN ('pending', 'failed')
        AND street_address IS NOT NULL
        AND city IS NOT NULL
    `;
    const params = [];

    if (county) {
      query += ` AND county_name = $1`;
      params.push(county);
    }

    query += ` ORDER BY ncid LIMIT $${params.length + 1}`;
    params.push(Math.min(limit, 5000));

    const voters = await db.manyOrNone(query, params);

    if (voters.length === 0) {
      return res.json({ message: 'No voters need geocoding', processed: 0 });
    }

    // Start batch processing
    const jobId = Date.now().toString();

    // Process in background
    processBatchGeocode(voters, jobId);

    res.json({
      jobId,
      message: 'Batch geocoding started',
      totalVoters: voters.length,
    });

  } catch (err) {
    console.error('[Batch Geocode Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/geocode/status
 * Get geocoding status
 */
router.get('/status', async (req, res) => {
  try {
    const status = await db.one(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN location IS NOT NULL THEN 1 END) as geocoded,
        COUNT(CASE WHEN geocode_status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN geocode_status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN geocode_status = 'success' THEN 1 END) as success
      FROM voters
      WHERE street_address IS NOT NULL
    `);

    const percentage = status.total > 0
      ? Math.round((status.geocoded / status.total) * 100)
      : 0;

    res.json({
      ...status,
      percentage,
    });

  } catch (err) {
    console.error('[Geocode Status Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/geocode/census-batch
 * Use Census Bureau batch geocoder (up to 10,000 addresses)
 */
router.post('/census-batch', async (req, res) => {
  try {
    const { county, limit = 10000 } = req.body;

    let query = `
      SELECT ncid, street_address, city, state, zip_code
      FROM voters
      WHERE location IS NULL
        AND geocode_status = 'pending'
        AND street_address IS NOT NULL
    `;
    const params = [];

    if (county) {
      query += ` AND county_name = $1`;
      params.push(county);
    }

    query += ` LIMIT $${params.length + 1}`;
    params.push(Math.min(limit, 10000));

    const voters = await db.manyOrNone(query, params);

    if (voters.length === 0) {
      return res.json({ message: 'No voters need geocoding', processed: 0 });
    }

    // Create CSV for Census batch geocoder
    const csvLines = ['Unique ID, Street address, City, State, ZIP'];
    for (const v of voters) {
      csvLines.push(`"${v.ncid}","${v.street_address || ''}","${v.city || ''}","${v.state || 'NC'}","${v.zip_code || ''}"`);
    }

    // Note: In production, you'd submit this to the Census batch geocoder
    // For now, return the CSV data for manual processing
    res.json({
      message: 'CSV generated for Census batch geocoder',
      voterCount: voters.length,
      csvPreview: csvLines.slice(0, 10).join('\n'),
      instructions: `
        1. Save the full CSV and upload to: ${CENSUS_GEOCODER_URL}/locations/addressbatch
        2. Select 'Public_AR_Current' as the benchmark
        3. Download results and use /api/geocode/import-results to import
      `,
    });

  } catch (err) {
    console.error('[Census Batch Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/geocode/import-results
 * Import geocoding results from Census batch geocoder
 */
router.post('/import-results', async (req, res) => {
  try {
    const { results } = req.body; // Array of { ncid, lat, lng, match_type }

    if (!results || !Array.isArray(results)) {
      return res.status(400).json({ error: 'Results array is required' });
    }

    let updated = 0;
    let failed = 0;

    for (const result of results) {
      try {
        if (result.lat && result.lng) {
          await db.none(`
            UPDATE voters
            SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                geocode_status = 'success',
                updated_at = NOW()
            WHERE ncid = $3
          `, [result.lng, result.lat, result.ncid]);
          updated++;
        } else {
          await db.none(`
            UPDATE voters
            SET geocode_status = 'failed',
                updated_at = NOW()
            WHERE ncid = $1
          `, [result.ncid]);
          failed++;
        }
      } catch (e) {
        failed++;
      }
    }

    res.json({
      success: true,
      updated,
      failed,
    });

  } catch (err) {
    console.error('[Import Results Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/geocode/map-data
 * Get voter locations for map display
 */
router.get('/map-data', async (req, res) => {
  try {
    const { county, precinct, bounds, limit = 5000 } = req.query;

    let conditions = ['location IS NOT NULL'];
    const params = [];
    let paramIndex = 1;

    if (county) {
      conditions.push(`county_name = $${paramIndex}`);
      params.push(county);
      paramIndex++;
    }

    if (precinct) {
      conditions.push(`precinct_name = $${paramIndex}`);
      params.push(precinct);
      paramIndex++;
    }

    if (bounds) {
      const [swLat, swLng, neLat, neLng] = bounds.split(',').map(parseFloat);
      conditions.push(`ST_Within(
        location::geometry,
        ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)
      )`);
      params.push(swLng, swLat, neLng, neLat);
      paramIndex += 4;
    }

    params.push(Math.min(parseInt(limit), 10000));

    const voters = await db.manyOrNone(`
      SELECT
        ncid,
        first_name,
        last_name,
        street_address,
        party,
        turnout_score,
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng
      FROM voters
      WHERE ${conditions.join(' AND ')}
      LIMIT $${paramIndex}
    `, params);

    // Format as GeoJSON FeatureCollection
    const geojson = {
      type: 'FeatureCollection',
      features: voters.map(v => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [v.lng, v.lat],
        },
        properties: {
          ncid: v.ncid,
          name: `${v.first_name} ${v.last_name}`,
          address: v.street_address,
          party: v.party,
          turnout: v.turnout_score,
        },
      })),
    };

    res.json(geojson);

  } catch (err) {
    console.error('[Map Data Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Geocode a single address using Nominatim
 */
async function geocodeAddress(street, city, state, zip) {
  const address = `${street}, ${city}, ${state} ${zip}`;

  try {
    const url = new URL(`${NOMINATIM_URL}/search`);
    url.searchParams.set('q', address);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'us');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'CivicVoice/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.length > 0) {
      return {
        success: true,
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        display_name: data[0].display_name,
        confidence: data[0].importance,
      };
    }

    return { success: false, error: 'No results found' };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Process batch geocoding in background
 */
async function processBatchGeocode(voters, jobId) {
  console.log(`[Geocode Job ${jobId}] Starting batch geocode for ${voters.length} voters`);

  let processed = 0;
  let success = 0;
  let failed = 0;

  for (const voter of voters) {
    try {
      // Rate limit: 1 request per second for Nominatim
      await new Promise(resolve => setTimeout(resolve, 1100));

      const result = await geocodeAddress(
        voter.street_address,
        voter.city,
        voter.state || 'NC',
        voter.zip_code
      );

      if (result.success) {
        await db.none(`
          UPDATE voters
          SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
              geocode_status = 'success',
              updated_at = NOW()
          WHERE ncid = $3
        `, [result.lng, result.lat, voter.ncid]);
        success++;
      } else {
        await db.none(`
          UPDATE voters
          SET geocode_status = 'failed',
              updated_at = NOW()
          WHERE ncid = $1
        `, [voter.ncid]);
        failed++;
      }

      processed++;

      if (processed % 100 === 0) {
        console.log(`[Geocode Job ${jobId}] Progress: ${processed}/${voters.length} (${success} success, ${failed} failed)`);
      }

    } catch (err) {
      console.error(`[Geocode Job ${jobId}] Error for ${voter.ncid}:`, err.message);
      failed++;
      processed++;
    }
  }

  console.log(`[Geocode Job ${jobId}] Complete: ${success} success, ${failed} failed`);
}

export default router;
