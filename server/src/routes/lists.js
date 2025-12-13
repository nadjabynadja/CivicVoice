/**
 * Lists API Routes
 * Virtual list management with household grouping and sorting
 */

import { Router } from 'express';
import { db, pgp } from '../config/database.js';
import crypto from 'crypto';

const router = Router();

/**
 * GET /api/lists
 * List all lists for the user
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.userId || 1;

    const lists = await db.manyOrNone(`
      SELECT
        l.id,
        l.name,
        l.description,
        l.voter_count,
        l.list_type,
        l.settings,
        l.created_at,
        l.updated_at,
        sq.name as source_query_name
      FROM lists l
      LEFT JOIN saved_queries sq ON l.source_query_id = sq.id
      WHERE l.user_id = $1
      ORDER BY l.updated_at DESC
    `, [userId]);

    res.json(lists);

  } catch (err) {
    console.error('[Lists Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/lists
 * Create a new list from a query
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const { name, description, query_config, source_query_id, list_type = 'static' } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!query_config && !source_query_id) {
      return res.status(400).json({ error: 'Either query_config or source_query_id is required' });
    }

    // Get query config from saved query if using source_query_id
    let config = query_config;
    if (source_query_id) {
      const savedQuery = await db.oneOrNone('SELECT query_config FROM saved_queries WHERE id = $1', [source_query_id]);
      if (savedQuery) {
        config = savedQuery.query_config;
      }
    }

    // Build the query to get voters
    const { conditions, params } = buildQueryConditions(config);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Create the list
    const list = await db.one(`
      INSERT INTO lists (user_id, name, description, source_query_id, list_type, settings)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, created_at
    `, [userId, name, description, source_query_id, list_type, { query_config: config }]);

    // Populate list with voters
    const insertQuery = `
      INSERT INTO list_voters (list_id, ncid, sort_order)
      SELECT $1, ncid, ROW_NUMBER() OVER (ORDER BY last_name, first_name)
      FROM voters
      ${whereClause}
    `;

    await db.none(insertQuery, [list.id, ...params]);

    // Update voter count
    const countResult = await db.one('SELECT COUNT(*) as count FROM list_voters WHERE list_id = $1', [list.id]);
    await db.none('UPDATE lists SET voter_count = $1 WHERE id = $2', [countResult.count, list.id]);

    res.json({
      ...list,
      voter_count: parseInt(countResult.count),
    });

  } catch (err) {
    console.error('[Create List Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Helper to build query conditions
 */
function buildQueryConditions(config) {
  const conditions = ['registration_status = \'ACTIVE\''];
  const params = [];
  let paramIndex = 2; // Start at 2 because 1 is list_id

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

  if (config.party && config.party.length > 0) {
    conditions.push(`party = ANY($${paramIndex})`);
    params.push(config.party);
    paramIndex++;
  }

  if (config.age_min !== undefined) {
    conditions.push(`age >= $${paramIndex}`);
    params.push(config.age_min);
    paramIndex++;
  }

  if (config.age_max !== undefined) {
    conditions.push(`age <= $${paramIndex}`);
    params.push(config.age_max);
    paramIndex++;
  }

  if (config.turnout_min !== undefined) {
    conditions.push(`turnout_score >= $${paramIndex}`);
    params.push(config.turnout_min);
    paramIndex++;
  }

  return { conditions, params };
}

/**
 * GET /api/lists/:id
 * Get list details
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const { id } = req.params;

    const list = await db.oneOrNone(`
      SELECT
        l.*,
        sq.name as source_query_name,
        sq.query_config as source_query_config
      FROM lists l
      LEFT JOIN saved_queries sq ON l.source_query_id = sq.id
      WHERE l.id = $1 AND l.user_id = $2
    `, [id, userId]);

    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    // Get stats
    const stats = await db.one(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN contact_status IS NOT NULL THEN 1 END) as contacted,
        COUNT(DISTINCT household_id) as households
      FROM list_voters
      WHERE list_id = $1
    `, [id]);

    res.json({
      ...list,
      stats,
    });

  } catch (err) {
    console.error('[Get List Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/lists/:id/voters
 * Get voters in a list with pagination
 */
router.get('/:id/voters', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const { id } = req.params;
    const { limit = 50, offset = 0, household_only = false } = req.query;

    // Verify list ownership
    const list = await db.oneOrNone('SELECT id FROM lists WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    let query;
    if (household_only === 'true') {
      // Return one voter per household
      query = `
        SELECT DISTINCT ON (lv.household_id)
          lv.sort_order,
          lv.household_id,
          lv.contact_status,
          v.ncid,
          v.first_name,
          v.last_name,
          v.street_address,
          v.city,
          v.zip_code,
          v.party,
          v.age,
          v.phone,
          v.turnout_score,
          (SELECT COUNT(*) FROM list_voters lv2 WHERE lv2.list_id = $1 AND lv2.household_id = lv.household_id) as household_size
        FROM list_voters lv
        JOIN voters v ON lv.ncid = v.ncid
        WHERE lv.list_id = $1
        ORDER BY lv.household_id, lv.sort_order
        LIMIT $2 OFFSET $3
      `;
    } else {
      query = `
        SELECT
          lv.sort_order,
          lv.household_id,
          lv.contact_status,
          lv.contact_notes,
          v.ncid,
          v.first_name,
          v.last_name,
          v.street_address,
          v.city,
          v.zip_code,
          v.party,
          v.age,
          v.sex,
          v.phone,
          v.turnout_score,
          v.partisan_score
        FROM list_voters lv
        JOIN voters v ON lv.ncid = v.ncid
        WHERE lv.list_id = $1
        ORDER BY lv.sort_order
        LIMIT $2 OFFSET $3
      `;
    }

    const voters = await db.manyOrNone(query, [id, parseInt(limit), parseInt(offset)]);

    const totalResult = await db.one('SELECT COUNT(*) as total FROM list_voters WHERE list_id = $1', [id]);

    res.json({
      voters,
      total: parseInt(totalResult.total),
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

  } catch (err) {
    console.error('[List Voters Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/lists/:id/household
 * Group list voters by household (address clustering)
 */
router.post('/:id/household', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const { id } = req.params;

    // Verify list ownership
    const list = await db.oneOrNone('SELECT id FROM lists WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    // Generate household IDs based on address
    await db.none(`
      UPDATE list_voters lv
      SET household_id = subq.household_id
      FROM (
        SELECT
          lv2.ncid,
          MD5(UPPER(COALESCE(v.street_address, '') || '|' || COALESCE(v.city, '') || '|' || COALESCE(v.zip_code, ''))) as household_id
        FROM list_voters lv2
        JOIN voters v ON lv2.ncid = v.ncid
        WHERE lv2.list_id = $1
      ) subq
      WHERE lv.list_id = $1 AND lv.ncid = subq.ncid
    `, [id]);

    // Reorder by address for walking efficiency
    await db.none(`
      WITH ordered AS (
        SELECT
          lv.ncid,
          ROW_NUMBER() OVER (
            ORDER BY v.zip_code, v.street_address, v.last_name, v.first_name
          ) as new_order
        FROM list_voters lv
        JOIN voters v ON lv.ncid = v.ncid
        WHERE lv.list_id = $1
      )
      UPDATE list_voters lv
      SET sort_order = ordered.new_order
      FROM ordered
      WHERE lv.list_id = $1 AND lv.ncid = ordered.ncid
    `, [id]);

    // Get household stats
    const stats = await db.one(`
      SELECT
        COUNT(DISTINCT household_id) as households,
        COUNT(*) as total_voters,
        ROUND(AVG(household_size)::numeric, 1) as avg_household_size
      FROM (
        SELECT household_id, COUNT(*) as household_size
        FROM list_voters
        WHERE list_id = $1
        GROUP BY household_id
      ) hs
    `, [id]);

    // Update list settings
    await db.none(`
      UPDATE lists
      SET settings = settings || '{"household_grouped": true}'::jsonb, updated_at = NOW()
      WHERE id = $1
    `, [id]);

    res.json({
      success: true,
      ...stats,
    });

  } catch (err) {
    console.error('[Household Group Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/lists/:id/randomize
 * Randomize the order of voters in a list
 */
router.post('/:id/randomize', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const { id } = req.params;

    // Verify list ownership
    const list = await db.oneOrNone('SELECT id FROM lists WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    // Randomize order
    await db.none(`
      WITH shuffled AS (
        SELECT ncid, ROW_NUMBER() OVER (ORDER BY RANDOM()) as new_order
        FROM list_voters
        WHERE list_id = $1
      )
      UPDATE list_voters lv
      SET sort_order = shuffled.new_order
      FROM shuffled
      WHERE lv.list_id = $1 AND lv.ncid = shuffled.ncid
    `, [id]);

    await db.none(`
      UPDATE lists
      SET settings = settings || '{"randomized": true}'::jsonb, updated_at = NOW()
      WHERE id = $1
    `, [id]);

    res.json({ success: true });

  } catch (err) {
    console.error('[Randomize Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/lists/:id
 * Delete a list
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const { id } = req.params;

    await db.none('DELETE FROM lists WHERE id = $1 AND user_id = $2', [id, userId]);

    res.json({ success: true });

  } catch (err) {
    console.error('[Delete List Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/lists/:id/duplicate
 * Duplicate a list
 */
router.post('/:id/duplicate', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const { id } = req.params;
    const { name } = req.body;

    // Get original list
    const original = await db.oneOrNone('SELECT * FROM lists WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!original) {
      return res.status(404).json({ error: 'List not found' });
    }

    // Create new list
    const newList = await db.one(`
      INSERT INTO lists (user_id, name, description, source_query_id, list_type, voter_count, settings)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, voter_count, created_at
    `, [
      userId,
      name || `${original.name} (copy)`,
      original.description,
      original.source_query_id,
      original.list_type,
      original.voter_count,
      original.settings,
    ]);

    // Copy voters
    await db.none(`
      INSERT INTO list_voters (list_id, ncid, sort_order, household_id, turf_id)
      SELECT $1, ncid, sort_order, household_id, turf_id
      FROM list_voters
      WHERE list_id = $2
    `, [newList.id, id]);

    res.json(newList);

  } catch (err) {
    console.error('[Duplicate List Error]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
