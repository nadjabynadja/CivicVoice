/**
 * Database Seed Script
 * Creates initial data for development and testing
 */

import bcrypt from 'bcryptjs';
import { db } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

async function seed() {
  console.log('🌱 Seeding database...\n');

  try {
    // Create default admin user
    console.log('Creating default admin user...');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('admin123', salt);

    await db.none(`
      INSERT INTO users (email, password_hash, name, role, organization)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO NOTHING
    `, ['admin@civicvoice.local', passwordHash, 'Admin User', 'admin', 'CivicVoice']);

    console.log('   ✓ Admin user created (admin@civicvoice.local / admin123)');

    // Create sample counties (NC)
    console.log('\nCreating NC counties...');
    const counties = [
      { code: 'BUNCOMBE', name: 'BUNCOMBE' },
      { code: 'WAKE', name: 'WAKE' },
      { code: 'MECKLENBURG', name: 'MECKLENBURG' },
      { code: 'GUILFORD', name: 'GUILFORD' },
      { code: 'FORSYTH', name: 'FORSYTH' },
      { code: 'DURHAM', name: 'DURHAM' },
      { code: 'CUMBERLAND', name: 'CUMBERLAND' },
      { code: 'GASTON', name: 'GASTON' },
      { code: 'NEW_HANOVER', name: 'NEW HANOVER' },
      { code: 'ORANGE', name: 'ORANGE' },
    ];

    for (const county of counties) {
      await db.none(`
        INSERT INTO counties (county_code, county_name)
        VALUES ($1, $2)
        ON CONFLICT (county_code) DO NOTHING
      `, [county.code, county.name]);
    }

    console.log(`   ✓ Created ${counties.length} counties`);

    // Create sample elections
    console.log('\nCreating sample elections...');
    const elections = [
      { date: '2024-11-05', type: 'GENERAL', desc: '2024 General Election', primary: false, general: true },
      { date: '2024-03-05', type: 'PRIMARY', desc: '2024 Primary Election', primary: true, general: false },
      { date: '2022-11-08', type: 'GENERAL', desc: '2022 General Election', primary: false, general: true },
      { date: '2022-05-17', type: 'PRIMARY', desc: '2022 Primary Election', primary: true, general: false },
      { date: '2020-11-03', type: 'GENERAL', desc: '2020 General Election', primary: false, general: true },
      { date: '2020-03-03', type: 'PRIMARY', desc: '2020 Primary Election', primary: true, general: false },
      { date: '2018-11-06', type: 'GENERAL', desc: '2018 General Election', primary: false, general: true },
      { date: '2016-11-08', type: 'GENERAL', desc: '2016 General Election', primary: false, general: true },
    ];

    for (const election of elections) {
      await db.none(`
        INSERT INTO elections (election_date, election_type, election_desc, is_primary, is_general)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (election_date, election_type) DO NOTHING
      `, [election.date, election.type, election.desc, election.primary, election.general]);
    }

    console.log(`   ✓ Created ${elections.length} elections`);

    console.log('\n✅ Seed complete!\n');

  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
}

seed()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
