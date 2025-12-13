#!/usr/bin/env node
/**
 * Weekly NCSBE Data Update Script
 *
 * Automatically downloads and imports the latest voter registration
 * and vote history data from the NC State Board of Elections.
 *
 * Schedule with cron:
 *   0 3 * * 0 /usr/bin/node /path/to/weekly-update.js >> /var/log/civicvoice-update.log 2>&1
 *
 * Or run manually:
 *   node weekly-update.js [--county=BUNCOMBE]
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { ingestVoterFile } from '../ingestion/ingest-ncsbe.js';
import { ingestHistoryFile } from '../ingestion/ingest-history.js';
import { db } from '../config/database.js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

// NCSBE data URLs
const NCSBE_BASE_URL = 'https://s3.amazonaws.com/dl.ncsbe.gov/data';
const VOTER_FILE = 'ncvoter_Statewide.zip';
const HISTORY_FILE = 'ncvhis_Statewide.zip';

// Configuration
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const LOG_FILE = path.join(DATA_DIR, 'update.log');

/**
 * Download a file from URL
 */
async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`📥 Downloading: ${url}`);

    const file = fs.createWriteStream(destPath);
    let downloadedBytes = 0;
    let lastReportedPct = 0;

    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirect
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`Download failed: HTTP ${response.statusCode}`));
      }

      const totalBytes = parseInt(response.headers['content-length'], 10);

      response.pipe(file);

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const pct = Math.floor((downloadedBytes / totalBytes) * 100);
        if (pct >= lastReportedPct + 10) {
          console.log(`   Progress: ${pct}%`);
          lastReportedPct = pct;
        }
      });

      file.on('finish', () => {
        file.close();
        console.log(`   ✓ Downloaded: ${(downloadedBytes / 1024 / 1024).toFixed(1)} MB`);
        resolve(destPath);
      });
    }).on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * Backup existing data files
 */
async function backupExisting() {
  await fs.promises.mkdir(BACKUP_DIR, { recursive: true });

  const timestamp = new Date().toISOString().split('T')[0];

  const files = [VOTER_FILE, HISTORY_FILE];
  for (const file of files) {
    const srcPath = path.join(DATA_DIR, file);
    if (fs.existsSync(srcPath)) {
      const backupPath = path.join(BACKUP_DIR, `${timestamp}_${file}`);
      await fs.promises.rename(srcPath, backupPath);
      console.log(`📦 Backed up: ${file} → ${timestamp}_${file}`);
    }
  }

  // Clean up old backups (keep last 4 weeks)
  const backups = await fs.promises.readdir(BACKUP_DIR);
  const sortedBackups = backups.sort().reverse();

  for (let i = 8; i < sortedBackups.length; i++) {
    const oldBackup = path.join(BACKUP_DIR, sortedBackups[i]);
    await fs.promises.unlink(oldBackup);
    console.log(`🗑️  Removed old backup: ${sortedBackups[i]}`);
  }
}

/**
 * Log update status
 */
async function logUpdate(status, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    status,
    ...details,
  };

  const logLine = JSON.stringify(entry) + '\n';
  await fs.promises.appendFile(LOG_FILE, logLine);

  // Also log to import_logs table
  try {
    await db.none(`
      INSERT INTO import_logs (filename, file_type, status, total_records, imported_records, errors, started_at, completed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [
      details.file || 'weekly-update',
      'weekly_update',
      status,
      details.totalRecords || 0,
      details.importedRecords || 0,
      JSON.stringify(details.errors || []),
      details.startTime || new Date(),
    ]);
  } catch (e) {
    console.error('Failed to log to database:', e.message);
  }
}

/**
 * Send notification (placeholder - implement with your notification service)
 */
async function sendNotification(subject, message) {
  // TODO: Implement with email/Slack/Discord webhook
  console.log(`📧 Notification: ${subject}`);
  console.log(`   ${message}`);
}

/**
 * Main update function
 */
async function runWeeklyUpdate(options = {}) {
  const startTime = new Date();
  const county = options.county || null;

  console.log('━'.repeat(60));
  console.log('🔄 CivicVoice Weekly Data Update');
  console.log('━'.repeat(60));
  console.log(`📅 Started: ${startTime.toISOString()}`);
  if (county) console.log(`🏛️  County Filter: ${county}`);
  console.log('━'.repeat(60));

  try {
    // Ensure data directory exists
    await fs.promises.mkdir(DATA_DIR, { recursive: true });

    // Step 1: Backup existing files
    console.log('\n📦 Step 1: Backing up existing data...');
    await backupExisting();

    // Step 2: Download new voter file
    console.log('\n📥 Step 2: Downloading voter registration file...');
    const voterUrl = `${NCSBE_BASE_URL}/${VOTER_FILE}`;
    const voterPath = path.join(DATA_DIR, VOTER_FILE);
    await downloadFile(voterUrl, voterPath);

    // Step 3: Download new history file
    console.log('\n📥 Step 3: Downloading vote history file...');
    const historyUrl = `${NCSBE_BASE_URL}/${HISTORY_FILE}`;
    const historyPath = path.join(DATA_DIR, HISTORY_FILE);
    await downloadFile(historyUrl, historyPath);

    // Step 4: Import voter data
    console.log('\n🔄 Step 4: Importing voter registration data...');
    const voterResult = await ingestVoterFile(voterPath, { county });

    // Step 5: Import vote history
    console.log('\n🔄 Step 5: Importing vote history...');
    const historyResult = await ingestHistoryFile(historyPath, { county });

    // Step 6: Update statistics
    console.log('\n📊 Step 6: Updating database statistics...');
    await db.none('VACUUM ANALYZE voters');
    await db.none('VACUUM ANALYZE vote_history');

    try {
      await db.none('REFRESH MATERIALIZED VIEW CONCURRENTLY voter_stats');
    } catch (e) {
      console.log('   (Materialized view refresh skipped)');
    }

    // Calculate duration
    const endTime = new Date();
    const durationMinutes = Math.round((endTime - startTime) / 60000);

    // Log success
    const summary = {
      file: 'weekly-update',
      startTime,
      totalRecords: voterResult.totalRecords + historyResult.totalRecords,
      importedRecords: voterResult.totalRecords + historyResult.totalRecords,
      voterRecords: voterResult.totalRecords,
      historyRecords: historyResult.totalRecords,
      durationMinutes,
      errors: [...voterResult.errors, ...historyResult.errors],
    };

    await logUpdate('success', summary);

    console.log('\n' + '━'.repeat(60));
    console.log('✅ Weekly Update Complete!');
    console.log('━'.repeat(60));
    console.log(`   📊 Voter records: ${voterResult.totalRecords.toLocaleString()}`);
    console.log(`   📊 History records: ${historyResult.totalRecords.toLocaleString()}`);
    console.log(`   ⏱️  Duration: ${durationMinutes} minutes`);
    console.log(`   ⚠️  Errors: ${summary.errors.length}`);
    console.log('━'.repeat(60));

    await sendNotification(
      'CivicVoice Update Complete',
      `Successfully updated ${summary.totalRecords.toLocaleString()} records in ${durationMinutes} minutes.`
    );

    return summary;

  } catch (err) {
    console.error('\n❌ Update failed:', err);

    await logUpdate('failed', {
      file: 'weekly-update',
      startTime,
      errors: [{ message: err.message, stack: err.stack }],
    });

    await sendNotification(
      'CivicVoice Update FAILED',
      `Error: ${err.message}`
    );

    throw err;
  }
}

// CLI handling
const args = process.argv.slice(2);
const countyArg = args.find(a => a.startsWith('--county='));
const county = countyArg ? countyArg.split('=')[1] : null;

const dryRun = args.includes('--dry-run');

if (dryRun) {
  console.log('DRY RUN - would download and import NCSBE data');
  console.log(`  Voter file: ${NCSBE_BASE_URL}/${VOTER_FILE}`);
  console.log(`  History file: ${NCSBE_BASE_URL}/${HISTORY_FILE}`);
  console.log(`  County filter: ${county || 'None'}`);
  process.exit(0);
}

runWeeklyUpdate({ county })
  .then(() => {
    console.log('\n✨ Done!\n');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n💥 Fatal error:', err);
    process.exit(1);
  });

export { runWeeklyUpdate, downloadFile };
