/**
 * Stats API Routes
 * Database statistics and analytics
 */

import { Router } from 'express';
import { db } from '../config/database.js';

const router = Router();

/**
 * GET /api/stats/overview
 * Get overall database statistics
 */
router.get('/overview', async (req, res) => {
  try {
    const stats = await db.one(`
      SELECT
        (SELECT COUNT(*) FROM voters) as total_voters,
        (SELECT COUNT(*) FROM voters WHERE registration_status = 'ACTIVE') as active_voters,
        (SELECT COUNT(DISTINCT county_name) FROM voters) as counties,
        (SELECT COUNT(DISTINCT precinct_name) FROM voters) as precincts,
        (SELECT COUNT(*) FROM vote_history) as vote_history_records,
        (SELECT COUNT(DISTINCT election_date) FROM vote_history) as elections_tracked,
        (SELECT COUNT(*) FROM voters WHERE location IS NOT NULL) as geocoded_voters,
        (SELECT MAX(last_synced) FROM voters) as last_sync
    `);

    // Party breakdown
    const partyBreakdown = await db.manyOrNone(`
      SELECT party, COUNT(*) as count
      FROM voters
      WHERE registration_status = 'ACTIVE'
      GROUP BY party
      ORDER BY count DESC
    `);

    // Age breakdown
    const ageBreakdown = await db.manyOrNone(`
      SELECT
        CASE
          WHEN age < 25 THEN '18-24'
          WHEN age < 35 THEN '25-34'
          WHEN age < 45 THEN '35-44'
          WHEN age < 55 THEN '45-54'
          WHEN age < 65 THEN '55-64'
          ELSE '65+'
        END as age_group,
        COUNT(*) as count
      FROM voters
      WHERE registration_status = 'ACTIVE' AND age IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `);

    res.json({
      ...stats,
      partyBreakdown,
      ageBreakdown,
    });

  } catch (err) {
    console.error('[Stats Overview Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/stats/elections
 * Get election statistics
 */
router.get('/elections', async (req, res) => {
  try {
    const elections = await db.manyOrNone(`
      SELECT
        election_date,
        election_type,
        election_desc,
        is_primary,
        is_general,
        total_voters
      FROM elections
      ORDER BY election_date DESC
      LIMIT 50
    `);

    // Turnout by election
    const turnoutByElection = await db.manyOrNone(`
      SELECT
        vh.election_date,
        vh.election_type,
        COUNT(DISTINCT vh.ncid) as voters,
        COUNT(DISTINCT CASE WHEN vh.voting_method = 'EARLY' THEN vh.ncid END) as early_voters,
        COUNT(DISTINCT CASE WHEN vh.voting_method = 'ABSENTEE' THEN vh.ncid END) as absentee_voters,
        COUNT(DISTINCT CASE WHEN vh.voting_method = 'ELECTION_DAY' THEN vh.ncid END) as election_day_voters
      FROM vote_history vh
      GROUP BY vh.election_date, vh.election_type
      ORDER BY vh.election_date DESC
      LIMIT 20
    `);

    res.json({
      elections,
      turnoutByElection,
    });

  } catch (err) {
    console.error('[Elections Stats Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/stats/demographics
 * Get demographic breakdown
 */
router.get('/demographics', async (req, res) => {
  try {
    const { county, precinct } = req.query;

    let whereClause = 'WHERE registration_status = \'ACTIVE\'';
    const params = [];

    if (county) {
      params.push(county);
      whereClause += ` AND county_name = $${params.length}`;
    }

    if (precinct) {
      params.push(precinct);
      whereClause += ` AND precinct_name = $${params.length}`;
    }

    // Sex breakdown
    const sexBreakdown = await db.manyOrNone(`
      SELECT sex, COUNT(*) as count
      FROM voters
      ${whereClause}
      GROUP BY sex
      ORDER BY count DESC
    `, params);

    // Race breakdown
    const raceBreakdown = await db.manyOrNone(`
      SELECT race, COUNT(*) as count
      FROM voters
      ${whereClause}
      GROUP BY race
      ORDER BY count DESC
    `, params);

    // Ethnicity breakdown
    const ethnicityBreakdown = await db.manyOrNone(`
      SELECT ethnicity, COUNT(*) as count
      FROM voters
      ${whereClause}
      GROUP BY ethnicity
      ORDER BY count DESC
    `, params);

    // Party by age
    const partyByAge = await db.manyOrNone(`
      SELECT
        CASE
          WHEN age < 30 THEN 'Under 30'
          WHEN age < 50 THEN '30-49'
          WHEN age < 65 THEN '50-64'
          ELSE '65+'
        END as age_group,
        party,
        COUNT(*) as count
      FROM voters
      ${whereClause} AND age IS NOT NULL
      GROUP BY 1, party
      ORDER BY 1, count DESC
    `, params);

    // Turnout score distribution
    const turnoutDistribution = await db.manyOrNone(`
      SELECT
        CASE
          WHEN turnout_score IS NULL THEN 'Unknown'
          WHEN turnout_score = 0 THEN '0%'
          WHEN turnout_score <= 25 THEN '1-25%'
          WHEN turnout_score <= 50 THEN '26-50%'
          WHEN turnout_score <= 75 THEN '51-75%'
          ELSE '76-100%'
        END as turnout_range,
        COUNT(*) as count
      FROM voters
      ${whereClause}
      GROUP BY 1
      ORDER BY 1
    `, params);

    res.json({
      sexBreakdown,
      raceBreakdown,
      ethnicityBreakdown,
      partyByAge,
      turnoutDistribution,
    });

  } catch (err) {
    console.error('[Demographics Stats Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/stats/county/:name
 * Get statistics for a specific county
 */
router.get('/county/:name', async (req, res) => {
  try {
    const { name } = req.params;

    const stats = await db.one(`
      SELECT
        COUNT(*) as total_voters,
        COUNT(CASE WHEN registration_status = 'ACTIVE' THEN 1 END) as active_voters,
        COUNT(DISTINCT precinct_name) as precincts,
        COUNT(CASE WHEN location IS NOT NULL THEN 1 END) as geocoded
      FROM voters
      WHERE UPPER(county_name) = UPPER($1)
    `, [name]);

    const partyBreakdown = await db.manyOrNone(`
      SELECT party, COUNT(*) as count
      FROM voters
      WHERE UPPER(county_name) = UPPER($1) AND registration_status = 'ACTIVE'
      GROUP BY party
      ORDER BY count DESC
    `, [name]);

    const precincts = await db.manyOrNone(`
      SELECT precinct_name, COUNT(*) as voter_count
      FROM voters
      WHERE UPPER(county_name) = UPPER($1) AND registration_status = 'ACTIVE'
      GROUP BY precinct_name
      ORDER BY voter_count DESC
    `, [name]);

    res.json({
      county: name,
      ...stats,
      partyBreakdown,
      precincts,
    });

  } catch (err) {
    console.error('[County Stats Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/stats/import-history
 * Get import log history
 */
router.get('/import-history', async (req, res) => {
  try {
    const logs = await db.manyOrNone(`
      SELECT
        id,
        filename,
        file_type,
        file_size,
        total_records,
        imported_records,
        skipped_records,
        error_records,
        status,
        started_at,
        completed_at,
        created_at
      FROM import_logs
      ORDER BY created_at DESC
      LIMIT 50
    `);

    res.json(logs);

  } catch (err) {
    console.error('[Import History Error]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
