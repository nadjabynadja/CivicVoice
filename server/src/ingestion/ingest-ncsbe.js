#!/usr/bin/env node
/**
 * NC SBE Voter Data Ingestion Script
 *
 * Usage:
 *   node ingest-ncsbe.js <path-to-zip-or-txt> [--county=BUNCOMBE]
 *
 * Examples:
 *   node ingest-ncsbe.js ./data/ncvoter_Statewide.zip
 *   node ingest-ncsbe.js ./data/ncvoter_Statewide.zip --county=BUNCOMBE
 *   node ingest-ncsbe.js ./data/ncvoter32.txt --county=BUNCOMBE
 */

import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import { db, pgp, initColumnSets, ColumnSets } from '../config/database.js';
import { NCSBEStreamParser, extractZip, parseVoterRecord } from './ncsbe-parser.js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

// Configuration
const BATCH_SIZE = 5000;
const TEMP_DIR = path.join(__dirname, '../../temp');

/**
 * Bulk insert voters using PostgreSQL's COPY for maximum performance
 */
async function bulkInsertVoters(voters) {
  if (voters.length === 0) return 0;

  const values = voters.map(v => ({
    ncid: v.ncid,
    first_name: v.first_name,
    middle_name: v.middle_name,
    last_name: v.last_name,
    name_suffix: v.name_suffix,
    full_name: null, // Generated column
    street_address: v.street_address,
    city: v.city,
    state: v.state || 'NC',
    zip_code: v.zip_code,
    mailing_address: v.mailing_address,
    mailing_city: v.mailing_city,
    mailing_state: v.mailing_state,
    mailing_zip: v.mailing_zip,
    county_id: null,
    county_name: v.county_name,
    precinct_id: null,
    precinct_name: v.precinct_name,
    congressional_district: v.congressional_district,
    nc_senate_district: v.nc_senate_district,
    nc_house_district: v.nc_house_district,
    municipality: v.municipality,
    ward: v.ward,
    school_district: v.school_district,
    birth_year: v.birth_year,
    age: v.age,
    sex: v.sex,
    race: v.race,
    ethnicity: v.ethnicity,
    party: v.party,
    registration_date: v.registration_date,
    registration_status: v.registration_status,
    voter_status_reason: v.voter_status_reason,
    phone: v.phone,
    confidential_ind: v.confidential_ind,
    location: v.street_address && v.city && v.zip_code ? null : null, // Geocoding done separately
    raw_data: JSON.stringify(v.raw_data),
  }));

  // Use pg-promise's multi-row insert with ON CONFLICT
  const cs = new pgp.helpers.ColumnSet([
    'ncid',
    'first_name',
    'middle_name',
    'last_name',
    'name_suffix',
    'street_address',
    'city',
    'state',
    'zip_code',
    'mailing_address',
    'mailing_city',
    'mailing_state',
    'mailing_zip',
    'county_name',
    'precinct_name',
    'congressional_district',
    'nc_senate_district',
    'nc_house_district',
    'municipality',
    'ward',
    'school_district',
    'birth_year',
    'age',
    'sex',
    'race',
    'ethnicity',
    'party',
    'registration_date',
    'registration_status',
    'voter_status_reason',
    'phone',
    'confidential_ind',
    'raw_data:json',
  ], { table: 'voters' });

  const query = pgp.helpers.insert(values, cs) + `
    ON CONFLICT (ncid) DO UPDATE SET
      first_name = EXCLUDED.first_name,
      middle_name = EXCLUDED.middle_name,
      last_name = EXCLUDED.last_name,
      name_suffix = EXCLUDED.name_suffix,
      street_address = EXCLUDED.street_address,
      city = EXCLUDED.city,
      state = EXCLUDED.state,
      zip_code = EXCLUDED.zip_code,
      mailing_address = EXCLUDED.mailing_address,
      mailing_city = EXCLUDED.mailing_city,
      mailing_state = EXCLUDED.mailing_state,
      mailing_zip = EXCLUDED.mailing_zip,
      county_name = EXCLUDED.county_name,
      precinct_name = EXCLUDED.precinct_name,
      congressional_district = EXCLUDED.congressional_district,
      nc_senate_district = EXCLUDED.nc_senate_district,
      nc_house_district = EXCLUDED.nc_house_district,
      municipality = EXCLUDED.municipality,
      ward = EXCLUDED.ward,
      school_district = EXCLUDED.school_district,
      birth_year = EXCLUDED.birth_year,
      age = EXCLUDED.age,
      sex = EXCLUDED.sex,
      race = EXCLUDED.race,
      ethnicity = EXCLUDED.ethnicity,
      party = EXCLUDED.party,
      registration_date = EXCLUDED.registration_date,
      registration_status = EXCLUDED.registration_status,
      voter_status_reason = EXCLUDED.voter_status_reason,
      phone = EXCLUDED.phone,
      confidential_ind = EXCLUDED.confidential_ind,
      raw_data = EXCLUDED.raw_data,
      updated_at = NOW(),
      last_synced = NOW()
  `;

  await db.none(query);
  return voters.length;
}

/**
 * Main ingestion function
 */
async function ingestVoterFile(filePath, options = {}) {
  const countyFilter = options.county || null;
  const startTime = Date.now();

  console.log('━'.repeat(60));
  console.log('🗳️  NC SBE Voter Data Ingestion');
  console.log('━'.repeat(60));
  console.log(`📁 File: ${filePath}`);
  console.log(`🏛️  County Filter: ${countyFilter || 'None (all counties)'}`);
  console.log(`📦 Batch Size: ${BATCH_SIZE}`);
  console.log('━'.repeat(60));

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  console.log(`📊 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  let dataFilePath = filePath;
  let needsCleanup = false;

  // Handle ZIP files
  if (filePath.toLowerCase().endsWith('.zip')) {
    console.log('\n📦 Extracting ZIP file...');
    await fs.promises.mkdir(TEMP_DIR, { recursive: true });

    const extracted = await extractZip(filePath, TEMP_DIR);
    console.log(`   Extracted ${extracted.length} file(s)`);

    // Find the voter data file (usually .txt)
    const dataFile = extracted.find(f =>
      f.name.toLowerCase().includes('ncvoter') &&
      f.name.toLowerCase().endsWith('.txt')
    ) || extracted[0];

    dataFilePath = dataFile.path;
    needsCleanup = true;
    console.log(`   Using: ${dataFile.name} (${(dataFile.size / 1024 / 1024).toFixed(2)} MB)`);
  }

  // Create log entry
  const importLog = await db.one(`
    INSERT INTO import_logs (filename, file_type, file_size, status, started_at)
    VALUES ($1, $2, $3, 'processing', NOW())
    RETURNING id
  `, [path.basename(filePath), 'voter_registration', stats.size]);

  let totalRecords = 0;
  let totalBatches = 0;
  let errors = [];

  try {
    console.log('\n🔄 Processing voter records...');

    const parser = new NCSBEStreamParser({
      batchSize: BATCH_SIZE,

      onBatch: async (batch, batchNum) => {
        try {
          const inserted = await bulkInsertVoters(batch);
          totalRecords += inserted;
          process.stdout.write(`\r   Processed: ${totalRecords.toLocaleString()} voters (batch ${batchNum})`);
        } catch (err) {
          errors.push({ batch: batchNum, error: err.message });
          console.error(`\n   ⚠️  Batch ${batchNum} error: ${err.message}`);
        }
      },

      onProgress: (progress) => {
        // Progress is reported by the batch callback
      },

      onError: (err) => {
        console.error('\n   ❌ Stream error:', err.message);
        errors.push({ stream: true, error: err.message });
      },
    });

    const stream = createReadStream(dataFilePath);
    const result = await parser.parseVoterStream(stream, countyFilter);

    totalBatches = result.totalBatches;

    console.log('\n');
    console.log('━'.repeat(60));
    console.log('✅ Ingestion Complete!');
    console.log('━'.repeat(60));
    console.log(`   📊 Total Records: ${totalRecords.toLocaleString()}`);
    console.log(`   📦 Total Batches: ${totalBatches}`);
    console.log(`   ⚠️  Errors: ${errors.length}`);
    console.log(`   ⏱️  Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    console.log(`   🚀 Rate: ${(totalRecords / ((Date.now() - startTime) / 1000)).toFixed(0)} records/sec`);

    // Update log entry
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

    // Update statistics
    console.log('\n🔄 Updating statistics...');
    await updateCountyStats();

    // Cleanup temp files
    if (needsCleanup) {
      console.log('🧹 Cleaning up temp files...');
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

/**
 * Update county statistics
 */
async function updateCountyStats() {
  await db.none(`
    INSERT INTO counties (county_code, county_name, total_voters, last_updated)
    SELECT
      UPPER(REPLACE(county_name, ' ', '_')),
      county_name,
      COUNT(*),
      NOW()
    FROM voters
    WHERE county_name IS NOT NULL
    GROUP BY county_name
    ON CONFLICT (county_code) DO UPDATE SET
      total_voters = EXCLUDED.total_voters,
      last_updated = NOW()
  `);

  // Refresh materialized view if it exists
  try {
    await db.none('REFRESH MATERIALIZED VIEW CONCURRENTLY voter_stats');
  } catch (e) {
    // View might not exist yet, that's okay
    try {
      await db.none('REFRESH MATERIALIZED VIEW voter_stats');
    } catch (e2) {
      console.log('   (Skipping materialized view refresh)');
    }
  }
}

// CLI handling
const args = process.argv.slice(2);
const filePath = args.find(a => !a.startsWith('--'));
const countyArg = args.find(a => a.startsWith('--county='));
const county = countyArg ? countyArg.split('=')[1].toUpperCase() : null;

if (!filePath) {
  console.log(`
Usage: node ingest-ncsbe.js <file-path> [options]

Arguments:
  file-path             Path to ncvoter ZIP or TXT file

Options:
  --county=NAME         Filter to specific county (e.g., --county=BUNCOMBE)

Examples:
  node ingest-ncsbe.js ./data/ncvoter_Statewide.zip
  node ingest-ncsbe.js ./data/ncvoter_Statewide.zip --county=BUNCOMBE
  node ingest-ncsbe.js ./data/ncvoter32.txt
  `);
  process.exit(1);
}

ingestVoterFile(filePath, { county })
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

export { ingestVoterFile, bulkInsertVoters, updateCountyStats };
