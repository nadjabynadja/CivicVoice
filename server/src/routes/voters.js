/**
 * Voters API Routes
 * Basic CRUD operations for voter records
 */

import { Router } from 'express';
import { db } from '../config/database.js';

const router = Router();

/**
 * GET /api/voters
 * List voters with basic filters and pagination
 */
router.get('/', async (req, res) => {
  try {
    const {
      county,
      precinct,
      party,
      search,
      limit = 50,
      offset = 0,
    } = req.query;

    const conditions = ['registration_status = \'ACTIVE\''];
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

    if (party) {
      conditions.push(`party = $${paramIndex}`);
      params.push(party);
      paramIndex++;
    }

    if (search) {
      conditions.push(`(
        full_name ILIKE $${paramIndex} OR
        street_address ILIKE $${paramIndex} OR
        ncid = $${paramIndex + 1}
      )`);
      params.push(`%${search}%`, search);
      paramIndex += 2;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const query = `
      SELECT
        ncid,
        first_name,
        middle_name,
        last_name,
        street_address,
        city,
        zip_code,
        county_name,
        precinct_name,
        age,
        sex,
        party,
        phone,
        turnout_score,
        partisan_score
      FROM voters
      ${whereClause}
      ORDER BY last_name, first_name
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(Math.min(parseInt(limit), 500), parseInt(offset));

    const voters = await db.manyOrNone(query, params);

    res.json({ voters });

  } catch (err) {
    console.error('[Voters List Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/voters/:ncid
 * Get single voter by NCID with full details
 */
router.get('/:ncid', async (req, res) => {
  try {
    const { ncid } = req.params;

    const voter = await db.oneOrNone(`
      SELECT
        ncid,
        first_name,
        middle_name,
        last_name,
        name_suffix,
        street_address,
        city,
        state,
        zip_code,
        mailing_address,
        mailing_city,
        mailing_state,
        mailing_zip,
        county_name,
        precinct_name,
        congressional_district,
        nc_senate_district,
        nc_house_district,
        municipality,
        ward,
        school_district,
        birth_year,
        age,
        sex,
        race,
        ethnicity,
        party,
        registration_date,
        registration_status,
        voter_status_reason,
        phone,
        turnout_score,
        partisan_score,
        ST_Y(location::geometry) as latitude,
        ST_X(location::geometry) as longitude,
        geocode_status,
        created_at,
        updated_at
      FROM voters
      WHERE ncid = $1
    `, [ncid]);

    if (!voter) {
      return res.status(404).json({ error: 'Voter not found' });
    }

    res.json(voter);

  } catch (err) {
    console.error('[Voter Get Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/voters/:ncid/history
 * Get vote history for a voter
 */
router.get('/:ncid/history', async (req, res) => {
  try {
    const { ncid } = req.params;

    const history = await db.manyOrNone(`
      SELECT
        election_date,
        election_type,
        election_desc,
        voting_method,
        party_voted
      FROM vote_history
      WHERE ncid = $1
      ORDER BY election_date DESC
    `, [ncid]);

    res.json(history);

  } catch (err) {
    console.error('[Voter History Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/voters/:ncid/contacts
 * Get contact history for a voter
 */
router.get('/:ncid/contacts', async (req, res) => {
  try {
    const { ncid } = req.params;

    const contacts = await db.manyOrNone(`
      SELECT
        ch.id,
        ch.contact_type,
        ch.contact_result,
        ch.survey_responses,
        ch.notes,
        ch.contacted_at,
        l.name as list_name,
        t.name as turf_name
      FROM contact_history ch
      LEFT JOIN lists l ON ch.list_id = l.id
      LEFT JOIN turfs t ON ch.turf_id = t.id
      WHERE ch.ncid = $1
      ORDER BY ch.contacted_at DESC
    `, [ncid]);

    res.json(contacts);

  } catch (err) {
    console.error('[Contact History Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/voters/:ncid/contact
 * Log a contact attempt for a voter
 */
router.post('/:ncid/contact', async (req, res) => {
  try {
    const { ncid } = req.params;
    const userId = req.userId || 1;
    const {
      contact_type,
      contact_result,
      list_id,
      turf_id,
      survey_responses,
      notes,
    } = req.body;

    if (!contact_type) {
      return res.status(400).json({ error: 'contact_type is required' });
    }

    const contact = await db.one(`
      INSERT INTO contact_history
        (user_id, ncid, list_id, turf_id, contact_type, contact_result, survey_responses, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, contact_type, contact_result, contacted_at
    `, [userId, ncid, list_id, turf_id, contact_type, contact_result, survey_responses, notes]);

    // Update list_voters contact status if applicable
    if (list_id) {
      await db.none(`
        UPDATE list_voters
        SET contact_status = $1, contact_notes = $2
        WHERE list_id = $3 AND ncid = $4
      `, [contact_result || contact_type, notes, list_id, ncid]);
    }

    res.json(contact);

  } catch (err) {
    console.error('[Log Contact Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/voters/household/:address
 * Get all voters at an address
 */
router.get('/household/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { city, zip } = req.query;

    let conditions = ['street_address ILIKE $1'];
    const params = [address];
    let paramIndex = 2;

    if (city) {
      conditions.push(`city = $${paramIndex}`);
      params.push(city);
      paramIndex++;
    }

    if (zip) {
      conditions.push(`zip_code = $${paramIndex}`);
      params.push(zip);
      paramIndex++;
    }

    const voters = await db.manyOrNone(`
      SELECT
        ncid,
        first_name,
        last_name,
        age,
        sex,
        party,
        turnout_score
      FROM voters
      WHERE ${conditions.join(' AND ')}
      ORDER BY last_name, first_name
    `, params);

    res.json({
      address,
      voterCount: voters.length,
      voters,
    });

  } catch (err) {
    console.error('[Household Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/voters/nearby
 * Get voters near a location
 */
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 100 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }

    const voters = await db.manyOrNone(`
      SELECT
        ncid,
        first_name,
        last_name,
        street_address,
        city,
        party,
        ST_Distance(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance
      FROM voters
      WHERE location IS NOT NULL
        AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
      ORDER BY distance
      LIMIT 50
    `, [parseFloat(lng), parseFloat(lat), parseFloat(radius)]);

    res.json(voters);

  } catch (err) {
    console.error('[Nearby Error]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
