/**
 * Query Builder API
 * Advanced search and filter functionality for voter data
 */

import { Router } from 'express';
import { db } from '../config/database.js';

const router = Router();

/**
 * Build WHERE clause from query configuration
 */
function buildWhereClause(config) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  // Geography filters
  if (config.county && config.county.length > 0) {
    conditions.push(`county_name = ANY($${paramIndex})`);
    params.push(config.county);
    paramIndex++;
  }

  if (config.precincts && config.precincts.length > 0) {
    conditions.push(`precinct_name = ANY($${paramIndex})`);
    params.push(config.precincts);
    paramIndex++;
  }

  if (config.congressional_district) {
    conditions.push(`congressional_district = $${paramIndex}`);
    params.push(config.congressional_district);
    paramIndex++;
  }

  if (config.nc_senate_district) {
    conditions.push(`nc_senate_district = $${paramIndex}`);
    params.push(config.nc_senate_district);
    paramIndex++;
  }

  if (config.nc_house_district) {
    conditions.push(`nc_house_district = $${paramIndex}`);
    params.push(config.nc_house_district);
    paramIndex++;
  }

  if (config.municipalities && config.municipalities.length > 0) {
    conditions.push(`municipality = ANY($${paramIndex})`);
    params.push(config.municipalities);
    paramIndex++;
  }

  if (config.zip_codes && config.zip_codes.length > 0) {
    conditions.push(`zip_code = ANY($${paramIndex})`);
    params.push(config.zip_codes);
    paramIndex++;
  }

  // Demographics filters
  if (config.age_min !== undefined && config.age_min !== null) {
    conditions.push(`age >= $${paramIndex}`);
    params.push(config.age_min);
    paramIndex++;
  }

  if (config.age_max !== undefined && config.age_max !== null) {
    conditions.push(`age <= $${paramIndex}`);
    params.push(config.age_max);
    paramIndex++;
  }

  if (config.sex && config.sex.length > 0) {
    conditions.push(`sex = ANY($${paramIndex})`);
    params.push(config.sex);
    paramIndex++;
  }

  if (config.race && config.race.length > 0) {
    conditions.push(`race = ANY($${paramIndex})`);
    params.push(config.race);
    paramIndex++;
  }

  if (config.ethnicity && config.ethnicity.length > 0) {
    conditions.push(`ethnicity = ANY($${paramIndex})`);
    params.push(config.ethnicity);
    paramIndex++;
  }

  // Party filters
  if (config.party && config.party.length > 0) {
    conditions.push(`party = ANY($${paramIndex})`);
    params.push(config.party);
    paramIndex++;
  }

  // Registration filters
  if (config.registration_status) {
    conditions.push(`registration_status = $${paramIndex}`);
    params.push(config.registration_status);
    paramIndex++;
  } else {
    // Default to active voters
    conditions.push(`registration_status = 'ACTIVE'`);
  }

  if (config.registered_after) {
    conditions.push(`registration_date >= $${paramIndex}`);
    params.push(config.registered_after);
    paramIndex++;
  }

  if (config.registered_before) {
    conditions.push(`registration_date <= $${paramIndex}`);
    params.push(config.registered_before);
    paramIndex++;
  }

  // Turnout score filters
  if (config.turnout_min !== undefined && config.turnout_min !== null) {
    conditions.push(`turnout_score >= $${paramIndex}`);
    params.push(config.turnout_min);
    paramIndex++;
  }

  if (config.turnout_max !== undefined && config.turnout_max !== null) {
    conditions.push(`turnout_score <= $${paramIndex}`);
    params.push(config.turnout_max);
    paramIndex++;
  }

  // Partisan score filters
  if (config.partisan_min !== undefined && config.partisan_min !== null) {
    conditions.push(`partisan_score >= $${paramIndex}`);
    params.push(config.partisan_min);
    paramIndex++;
  }

  if (config.partisan_max !== undefined && config.partisan_max !== null) {
    conditions.push(`partisan_score <= $${paramIndex}`);
    params.push(config.partisan_max);
    paramIndex++;
  }

  // Name/address search
  if (config.search) {
    conditions.push(`(
      full_name ILIKE $${paramIndex} OR
      street_address ILIKE $${paramIndex}
    )`);
    params.push(`%${config.search}%`);
    paramIndex++;
  }

  // Bounding box for map queries
  if (config.bounds) {
    const { sw_lat, sw_lng, ne_lat, ne_lng } = config.bounds;
    conditions.push(`
      location IS NOT NULL AND
      ST_Within(
        location::geometry,
        ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)
      )
    `);
    params.push(sw_lng, sw_lat, ne_lng, ne_lat);
    paramIndex += 4;
  }

  return { conditions, params, paramIndex };
}

/**
 * Build vote history subquery conditions
 */
function buildHistoryConditions(config, startParamIndex) {
  const conditions = [];
  const params = [];
  let paramIndex = startParamIndex;

  // Voted in specific elections
  if (config.voted_in && config.voted_in.length > 0) {
    const subConditions = config.voted_in.map((election, i) => {
      const idx = paramIndex + i;
      params.push(election.date);
      if (election.type) {
        params.push(election.type);
        return `(election_date = $${idx} AND election_type = $${idx + 1})`;
      }
      return `election_date = $${idx}`;
    });
    conditions.push(`ncid IN (
      SELECT DISTINCT ncid FROM vote_history
      WHERE ${subConditions.join(' OR ')}
    )`);
    paramIndex += params.length;
  }

  // Did NOT vote in specific elections
  if (config.did_not_vote_in && config.did_not_vote_in.length > 0) {
    const subConditions = config.did_not_vote_in.map((election, i) => {
      params.push(election.date);
      return `election_date = $${paramIndex + i}`;
    });
    conditions.push(`ncid NOT IN (
      SELECT DISTINCT ncid FROM vote_history
      WHERE ${subConditions.join(' OR ')}
    )`);
    paramIndex += config.did_not_vote_in.length;
  }

  // Voted in primary with specific party
  if (config.primary_party) {
    conditions.push(`ncid IN (
      SELECT DISTINCT ncid FROM vote_history
      WHERE election_type = 'PRIMARY' AND party_voted = $${paramIndex}
    )`);
    params.push(config.primary_party);
    paramIndex++;
  }

  // Voting method filter
  if (config.voting_method && config.voting_method.length > 0) {
    conditions.push(`ncid IN (
      SELECT DISTINCT ncid FROM vote_history
      WHERE voting_method = ANY($${paramIndex})
    )`);
    params.push(config.voting_method);
    paramIndex++;
  }

  // Minimum vote count
  if (config.min_votes !== undefined && config.min_votes !== null) {
    conditions.push(`ncid IN (
      SELECT ncid FROM vote_history
      GROUP BY ncid
      HAVING COUNT(*) >= $${paramIndex}
    )`);
    params.push(config.min_votes);
    paramIndex++;
  }

  return { conditions, params, paramIndex };
}

/**
 * POST /api/query/build
 * Build and execute a voter query
 */
router.post('/build', async (req, res) => {
  try {
    const config = req.body;
    const limit = Math.min(config.limit || 100, 10000);
    const offset = config.offset || 0;

    // Build base WHERE clause
    const base = buildWhereClause(config);
    let { conditions, params, paramIndex } = base;

    // Add vote history conditions
    const history = buildHistoryConditions(config, paramIndex);
    conditions = conditions.concat(history.conditions);
    params = params.concat(history.params);
    paramIndex = history.paramIndex;

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Build ORDER BY
    const orderBy = config.orderBy || 'last_name, first_name';
    const validOrderFields = ['last_name', 'first_name', 'age', 'precinct_name', 'street_address', 'turnout_score', 'partisan_score'];
    const orderField = validOrderFields.includes(orderBy.split(' ')[0]) ? orderBy : 'last_name, first_name';

    // Execute query
    const query = `
      SELECT
        ncid,
        first_name,
        middle_name,
        last_name,
        name_suffix,
        street_address,
        city,
        zip_code,
        county_name,
        precinct_name,
        congressional_district,
        nc_senate_district,
        nc_house_district,
        municipality,
        age,
        sex,
        race,
        ethnicity,
        party,
        registration_date,
        phone,
        turnout_score,
        partisan_score,
        ST_Y(location::geometry) as latitude,
        ST_X(location::geometry) as longitude
      FROM voters
      ${whereClause}
      ORDER BY ${orderField}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const voters = await db.manyOrNone(query, params);

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM voters ${whereClause}`;
    const countResult = await db.one(countQuery, params.slice(0, -2));

    res.json({
      voters,
      total: parseInt(countResult.total),
      limit,
      offset,
      hasMore: offset + voters.length < parseInt(countResult.total),
    });

  } catch (err) {
    console.error('[Query Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/query/count
 * Get count for a query without fetching records
 */
router.post('/count', async (req, res) => {
  try {
    const config = req.body;

    const base = buildWhereClause(config);
    let { conditions, params, paramIndex } = base;

    const history = buildHistoryConditions(config, paramIndex);
    conditions = conditions.concat(history.conditions);
    params = params.concat(history.params);

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const query = `SELECT COUNT(*) as total FROM voters ${whereClause}`;
    const result = await db.one(query, params);

    res.json({ count: parseInt(result.total) });

  } catch (err) {
    console.error('[Count Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/query/saved
 * List saved queries for current user
 */
router.get('/saved', async (req, res) => {
  try {
    const userId = req.userId || 1; // TODO: Get from auth

    const queries = await db.manyOrNone(`
      SELECT id, name, description, query_config, result_count, created_at, updated_at
      FROM saved_queries
      WHERE user_id = $1
      ORDER BY updated_at DESC
    `, [userId]);

    res.json(queries);

  } catch (err) {
    console.error('[Saved Queries Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/query/save
 * Save a query for later use
 */
router.post('/save', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const { name, description, query_config } = req.body;

    if (!name || !query_config) {
      return res.status(400).json({ error: 'Name and query_config are required' });
    }

    // Get current count for this query
    const base = buildWhereClause(query_config);
    let { conditions, params } = base;
    const history = buildHistoryConditions(query_config, base.paramIndex);
    conditions = conditions.concat(history.conditions);
    params = params.concat(history.params);

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const countResult = await db.one(`SELECT COUNT(*) as total FROM voters ${whereClause}`, params);

    const saved = await db.one(`
      INSERT INTO saved_queries (user_id, name, description, query_config, result_count)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, description, result_count, created_at
    `, [userId, name, description, query_config, parseInt(countResult.total)]);

    res.json(saved);

  } catch (err) {
    console.error('[Save Query Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/query/saved/:id
 * Delete a saved query
 */
router.delete('/saved/:id', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const { id } = req.params;

    await db.none(`
      DELETE FROM saved_queries
      WHERE id = $1 AND user_id = $2
    `, [id, userId]);

    res.json({ success: true });

  } catch (err) {
    console.error('[Delete Query Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/query/options
 * Get available filter options (counties, precincts, etc.)
 */
router.get('/options', async (req, res) => {
  try {
    const county = req.query.county;

    // Get counties
    const counties = await db.manyOrNone(`
      SELECT DISTINCT county_name
      FROM voters
      WHERE county_name IS NOT NULL
      ORDER BY county_name
    `);

    // Get precincts (filtered by county if specified)
    let precinctsQuery = `
      SELECT DISTINCT precinct_name
      FROM voters
      WHERE precinct_name IS NOT NULL
    `;
    const precinctParams = [];
    if (county) {
      precinctsQuery += ` AND county_name = $1`;
      precinctParams.push(county);
    }
    precinctsQuery += ` ORDER BY precinct_name`;
    const precincts = await db.manyOrNone(precinctsQuery, precinctParams);

    // Get congressional districts
    const congressionalDistricts = await db.manyOrNone(`
      SELECT DISTINCT congressional_district
      FROM voters
      WHERE congressional_district IS NOT NULL
      ORDER BY congressional_district
    `);

    // Get NC Senate districts
    const senateDistricts = await db.manyOrNone(`
      SELECT DISTINCT nc_senate_district
      FROM voters
      WHERE nc_senate_district IS NOT NULL
      ORDER BY nc_senate_district
    `);

    // Get NC House districts
    const houseDistricts = await db.manyOrNone(`
      SELECT DISTINCT nc_house_district
      FROM voters
      WHERE nc_house_district IS NOT NULL
      ORDER BY nc_house_district
    `);

    // Get municipalities
    let municipalitiesQuery = `
      SELECT DISTINCT municipality
      FROM voters
      WHERE municipality IS NOT NULL
    `;
    const municipalityParams = [];
    if (county) {
      municipalitiesQuery += ` AND county_name = $1`;
      municipalityParams.push(county);
    }
    municipalitiesQuery += ` ORDER BY municipality`;
    const municipalities = await db.manyOrNone(municipalitiesQuery, municipalityParams);

    // Get parties
    const parties = await db.manyOrNone(`
      SELECT party, COUNT(*) as count
      FROM voters
      WHERE party IS NOT NULL
      GROUP BY party
      ORDER BY count DESC
    `);

    // Get elections for vote history filter
    const elections = await db.manyOrNone(`
      SELECT election_date, election_type, election_desc, total_voters
      FROM elections
      ORDER BY election_date DESC
      LIMIT 20
    `);

    res.json({
      counties: counties.map(c => c.county_name),
      precincts: precincts.map(p => p.precinct_name),
      congressionalDistricts: congressionalDistricts.map(d => d.congressional_district),
      senateDistricts: senateDistricts.map(d => d.nc_senate_district),
      houseDistricts: houseDistricts.map(d => d.nc_house_district),
      municipalities: municipalities.map(m => m.municipality),
      parties: parties,
      elections: elections,
      races: ['White', 'Black/African American', 'Asian', 'American Indian/Alaska Native', 'Two or More Races', 'Other', 'Undesignated'],
      ethnicities: ['Hispanic/Latino', 'Not Hispanic/Latino', 'Undesignated'],
      votingMethods: ['ELECTION_DAY', 'EARLY', 'ABSENTEE', 'PROVISIONAL'],
    });

  } catch (err) {
    console.error('[Options Error]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
