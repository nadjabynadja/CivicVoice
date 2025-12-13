#!/usr/bin/env node
/**
 * NC SBE Vote History Ingestion Script
 *
 * Usage:
 *   node ingest-history.js <path-to-zip-or-txt> [--county=BUNCOMBE]
 *
 * Examples:
 *   node ingest-history.js ./data/ncvhis_Statewide.zip
 *   node ingest-history.js ./data/ncvhis_Statewide.zip --county=BUNCOMBE
 */

import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import { db, pgp } from '../config/database.js';
import { NCSBEStreamParser, extractZip } from './ncsbe-parser.js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const BATCH_SIZE = 10000;
const TEMP_DIR = path.join(__dirname, '../../temp');

/**
 * Get set of NCIDs that exist in the voters table
 * For filtering history to only voters we have
 */
async function getExistingNCIDs(county = null) {
  console.log('   Loading existing voter NCIDs...');

  let query = 'SELECT ncid FROM voters';
  if (county) {
    query += ` WHERE UPPER(county_name) = $1`;
  }

  const rows = await db.manyOrNone(query, county ? [county.toUpperCase()] : []);
  const ncids = new Set(rows.map(r => r.ncid));

  console.log(`   Found ${ncids.size.toLocaleString()} voters`);
  return ncids;
}

/**
 * Bulk insert vote history records
 */
async function bulkInsertHistory(records) {
  if (records.length === 0) return 0;

  const cs = new pgp.helpers.ColumnSet([
    'ncid',
    'election_date',
    'election_type',
    'election_desc',
    'voting_method',
    'party_voted',
  ], { table: 'vote_history' });

  const query = pgp.helpers.insert(records, cs) + `
    ON CONFLICT (ncid, election_date, election_type) DO UPDATE SET
      election_desc = EXCLUDED.election_desc,
      voting_method = EXCLUDED.voting_method,
      party_voted = EXCLUDED.party_voted
  `;

  await db.none(query);
  return records.length;
}

/**
 * Update elections reference table
 */
async function updateElections() {
  await db.none(`
    INSERT INTO elections (election_date, election_type, election_desc, is_primary, is_general, total_voters)
    SELECT
      election_date,
      election_type,
      election_desc,
      election_type = 'PRIMARY',
      election_type = 'GENERAL',
      COUNT(DISTINCT ncid)
    FROM vote_history
    GROUP BY election_date, election_type, election_desc
    ON CONFLICT (election_date, election_type) DO UPDATE SET
      election_desc = EXCLUDED.election_desc,
      total_voters = EXCLUDED.total_voters
  `);
}

/**
 * Calculate turnout scores for voters
 */
async function calculateTurnoutScores() {
  console.log('\n📊 Calculating turnout scores...');

  // Get list of recent general elections (last 5)
  const recentGenerals = await db.manyOrNone(`
    SELECT DISTINCT election_date
    FROM elections
    WHERE is_general = true
    ORDER BY election_date DESC
    LIMIT 5
  `);

  if (recentGenerals.length === 0) {
    console.log('   No general elections found, skipping');
    return;
  }

  const electionDates = recentGenerals.map(e => e.election_date);
  console.log(`   Using ${electionDates.length} recent general elections`);

  // Calculate turnout as percentage of recent elections voted
  await db.none(`
    UPDATE voters v
    SET turnout_score = (
      SELECT ROUND(COUNT(DISTINCT vh.election_date)::numeric / $1 * 100, 2)
      FROM vote_history vh
      WHERE vh.ncid = v.ncid
        AND vh.election_date = ANY($2)
    )
  `, [electionDates.length, electionDates]);

  console.log('   Turnout scores updated');
}

/**
 * Calculate partisan lean scores based on primary participation
 */
async function calculatePartisanScores() {
  console.log('\n📊 Calculating partisan lean scores...');

  // Score based on primary participation:
  // -100 = always votes in Dem primaries
  // +100 = always votes in Rep primaries
  // 0 = no primary participation or balanced
  await db.none(`
    UPDATE voters v
    SET partisan_score = (
      SELECT CASE
        WHEN dem_count + rep_count = 0 THEN 0
        ELSE ROUND(((rep_count - dem_count)::numeric / (dem_count + rep_count)) * 100, 2)
      END
      FROM (
        SELECT
          COUNT(CASE WHEN party_voted = 'DEM' THEN 1 END) as dem_count,
          COUNT(CASE WHEN party_voted = 'REP' THEN 1 END) as rep_count
        FROM vote_history vh
        WHERE vh.ncid = v.ncid
          AND vh.election_type = 'PRIMARY'
      ) counts
    )
  `);

  console.log('   Partisan scores updated');
}

/**
 * Main history ingestion function
 */
async function ingestHistoryFile(filePath, options = {}) {
  const countyFilter = options.county || null;
  const startTime = Date.now();

  console.log('━'.repeat(60));
  console.log('🗳️  NC SBE Vote History Ingestion');
  console.log('━'.repeat(60));
  console.log(`📁 File: ${filePath}`);
  console.log(`🏛️  County Filter: ${countyFilter || 'None (all counties)'}`);
  console.log(`📦 Batch Size: ${BATCH_SIZE}`);
  console.log('━'.repeat(60));

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  console.log(`📊 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  // Get existing NCIDs to filter history
  const existingNCIDs = await getExistingNCIDs(countyFilter);

  let dataFilePath = filePath;
  let needsCleanup = false;

  // Handle ZIP files
  if (filePath.toLowerCase().endsWith('.zip')) {
    console.log('\n📦 Extracting ZIP file...');
    await fs.promises.mkdir(TEMP_DIR, { recursive: true });

    const extracted = await extractZip(filePath, TEMP_DIR);
    console.log(`   Extracted ${extracted.length} file(s)`);

    const dataFile = extracted.find(f =>
      f.name.toLowerCase().includes('ncvhis') &&
      f.name.toLowerCase().endsWith('.txt')
    ) || extracted[0];

    dataFilePath = dataFile.path;
    needsCleanup = true;
    console.log(`   Using: ${dataFile.name}`);
  }

  // Create log entry
  const importLog = await db.one(`
    INSERT INTO import_logs (filename, file_type, file_size, status, started_at)
    VALUES ($1, $2, $3, 'processing', NOW())
    RETURNING id
  `, [path.basename(filePath), 'vote_history', stats.size]);

  let totalRecords = 0;
  let totalBatches = 0;
  let errors = [];

  try {
    console.log('\n🔄 Processing vote history records...');

    const parser = new NCSBEStreamParser({
      batchSize: BATCH_SIZE,

      onBatch: async (batch, batchNum) => {
        try {
          const inserted = await bulkInsertHistory(batch);
          totalRecords += inserted;
          process.stdout.write(`\r   Processed: ${totalRecords.toLocaleString()} records (batch ${batchNum})`);
        } catch (err) {
          errors.push({ batch: batchNum, error: err.message });
          console.error(`\n   ⚠️  Batch ${batchNum} error: ${err.message}`);
        }
      },

      onError: (err) => {
        console.error('\n   ❌ Stream error:', err.message);
        errors.push({ stream: true, error: err.message });
      },
    });

    const stream = createReadStream(dataFilePath);
    const result = await parser.parseHistoryStream(stream, existingNCIDs);

    totalBatches = result.totalBatches;

    console.log('\n');
    console.log('━'.repeat(60));
    console.log('✅ History Ingestion Complete!');
    console.log('━'.repeat(60));
    console.log(`   📊 Total Records: ${totalRecords.toLocaleString()}`);
    console.log(`   📦 Total Batches: ${totalBatches}`);
    console.log(`   ⚠️  Errors: ${errors.length}`);
    console.log(`   ⏱️  Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    // Update log
    await db.none(`
      UPDATE import_logs
      SET status = 'completed',
          total_records = $1,
          imported_records = $1,
          error_records = $2,
          errors = $3,
          completed_at = NOW()
      WHERE id = $4
    `, [totalRecords, errors.length, JSON.stringify(errors), importLog.id]);

    // Update derived data
    await updateElections();
    await calculateTurnoutScores();
    await calculatePartisanScores();

    // Cleanup
    if (needsCleanup) {
      console.log('\n🧹 Cleaning up temp files...');
      await fs.promises.rm(TEMP_DIR, { recursive: true, force: true });
    }

    console.log('\n✨ Done!\n');

  } catch (err) {
    console.error('\n❌ Ingestion failed:', err);

    await db.none(`
      UPDATE import_logs
      SET status = 'failed',
          total_records = $1,
          error_records = $2,
          errors = $3,
          completed_at = NOW()
      WHERE id = $4
    `, [totalRecords, errors.length + 1, JSON.stringify([...errors, { fatal: err.message }]), importLog.id]);

    throw err;
  }

  return { totalRecords, totalBatches, errors };
}

// CLI handling
const args = process.argv.slice(2);
const filePath = args.find(a => !a.startsWith('--'));
const countyArg = args.find(a => a.startsWith('--county='));
const county = countyArg ? countyArg.split('=')[1] : null;

if (!filePath) {
  console.log(`
Usage: node ingest-history.js <file-path> [options]

Arguments:
  file-path             Path to ncvhis ZIP or TXT file

Options:
  --county=NAME         Filter to specific county

Examples:
  node ingest-history.js ./data/ncvhis_Statewide.zip
  node ingest-history.js ./data/ncvhis_Statewide.zip --county=BUNCOMBE
  `);
  process.exit(1);
}

ingestHistoryFile(filePath, { county })
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

export { ingestHistoryFile, bulkInsertHistory, calculateTurnoutScores, calculatePartisanScores };
