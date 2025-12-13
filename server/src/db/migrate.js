/**
 * Database Migration Script
 * Creates all tables for CivicVoice voter data management
 * Requires PostgreSQL with PostGIS extension
 */

import { db } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const migrations = [
  // Enable required extensions
  {
    name: 'Enable PostGIS Extension',
    sql: `CREATE EXTENSION IF NOT EXISTS postgis;`
  },
  {
    name: 'Enable pg_trgm for fuzzy search',
    sql: `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
  },

  // Users table for authentication
  {
    name: 'Create users table',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        organization VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_login TIMESTAMP WITH TIME ZONE
      );
    `
  },

  // Counties reference table
  {
    name: 'Create counties table',
    sql: `
      CREATE TABLE IF NOT EXISTS counties (
        id SERIAL PRIMARY KEY,
        county_code VARCHAR(10) UNIQUE NOT NULL,
        county_name VARCHAR(100) NOT NULL,
        total_voters INTEGER DEFAULT 0,
        last_updated TIMESTAMP WITH TIME ZONE
      );
    `
  },

  // Precincts reference table
  {
    name: 'Create precincts table',
    sql: `
      CREATE TABLE IF NOT EXISTS precincts (
        id SERIAL PRIMARY KEY,
        precinct_code VARCHAR(50) NOT NULL,
        precinct_name VARCHAR(255),
        county_code VARCHAR(10) REFERENCES counties(county_code),
        total_voters INTEGER DEFAULT 0,
        boundary GEOGRAPHY(MULTIPOLYGON, 4326),
        UNIQUE(precinct_code, county_code)
      );
    `
  },

  // Main voters table - core of the system
  {
    name: 'Create voters table',
    sql: `
      CREATE TABLE IF NOT EXISTS voters (
        id SERIAL PRIMARY KEY,
        ncid VARCHAR(20) UNIQUE NOT NULL,

        -- Name fields
        first_name VARCHAR(100),
        middle_name VARCHAR(100),
        last_name VARCHAR(100),
        name_suffix VARCHAR(20),
        full_name VARCHAR(255) GENERATED ALWAYS AS (
          TRIM(COALESCE(first_name, '') || ' ' || COALESCE(middle_name, '') || ' ' || COALESCE(last_name, '') || ' ' || COALESCE(name_suffix, ''))
        ) STORED,

        -- Physical address
        street_address VARCHAR(255),
        city VARCHAR(100),
        state VARCHAR(2) DEFAULT 'NC',
        zip_code VARCHAR(10),

        -- Mailing address
        mailing_address VARCHAR(255),
        mailing_city VARCHAR(100),
        mailing_state VARCHAR(2),
        mailing_zip VARCHAR(10),

        -- Geographic/Political divisions
        county_id INTEGER REFERENCES counties(id),
        county_name VARCHAR(100),
        precinct_id INTEGER REFERENCES precincts(id),
        precinct_name VARCHAR(255),
        congressional_district VARCHAR(10),
        nc_senate_district VARCHAR(10),
        nc_house_district VARCHAR(10),
        municipality VARCHAR(100),
        ward VARCHAR(50),
        school_district VARCHAR(100),

        -- Demographics
        birth_year INTEGER,
        age INTEGER,
        sex VARCHAR(10),
        race VARCHAR(50),
        ethnicity VARCHAR(50),

        -- Registration info
        party VARCHAR(20),
        registration_date DATE,
        registration_status VARCHAR(20) DEFAULT 'ACTIVE',
        voter_status_reason VARCHAR(100),

        -- Contact info
        phone VARCHAR(20),

        -- Flags
        confidential_ind BOOLEAN DEFAULT FALSE,

        -- Geolocation (for mapping)
        location GEOGRAPHY(POINT, 4326),
        geocode_status VARCHAR(20) DEFAULT 'pending',

        -- Computed scores (updated periodically)
        turnout_score DECIMAL(5,2),
        partisan_score DECIMAL(5,2),

        -- Metadata
        raw_data JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_synced TIMESTAMP WITH TIME ZONE
      );
    `
  },

  // Vote history table
  {
    name: 'Create vote_history table',
    sql: `
      CREATE TABLE IF NOT EXISTS vote_history (
        id SERIAL PRIMARY KEY,
        ncid VARCHAR(20) NOT NULL REFERENCES voters(ncid) ON DELETE CASCADE,
        election_date DATE NOT NULL,
        election_type VARCHAR(50),
        election_desc VARCHAR(255),
        voting_method VARCHAR(50),
        party_voted VARCHAR(20),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(ncid, election_date, election_type)
      );
    `
  },

  // Elections reference table
  {
    name: 'Create elections table',
    sql: `
      CREATE TABLE IF NOT EXISTS elections (
        id SERIAL PRIMARY KEY,
        election_date DATE NOT NULL,
        election_type VARCHAR(50),
        election_desc VARCHAR(255),
        is_primary BOOLEAN DEFAULT FALSE,
        is_general BOOLEAN DEFAULT FALSE,
        total_voters INTEGER DEFAULT 0,
        UNIQUE(election_date, election_type)
      );
    `
  },

  // Saved searches/queries
  {
    name: 'Create saved_queries table',
    sql: `
      CREATE TABLE IF NOT EXISTS saved_queries (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        query_config JSONB NOT NULL,
        result_count INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  },

  // Virtual lists
  {
    name: 'Create lists table',
    sql: `
      CREATE TABLE IF NOT EXISTS lists (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        source_query_id INTEGER REFERENCES saved_queries(id),
        voter_count INTEGER DEFAULT 0,
        list_type VARCHAR(50) DEFAULT 'static',
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  },

  // List membership
  {
    name: 'Create list_voters table',
    sql: `
      CREATE TABLE IF NOT EXISTS list_voters (
        list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
        ncid VARCHAR(20) NOT NULL REFERENCES voters(ncid) ON DELETE CASCADE,
        sort_order INTEGER,
        household_id VARCHAR(50),
        turf_id INTEGER,
        contact_status VARCHAR(50),
        contact_notes TEXT,
        added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (list_id, ncid)
      );
    `
  },

  // Turfs for geographic segmentation
  {
    name: 'Create turfs table',
    sql: `
      CREATE TABLE IF NOT EXISTS turfs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        list_id INTEGER REFERENCES lists(id) ON DELETE CASCADE,
        name VARCHAR(255),
        description TEXT,
        boundary GEOGRAPHY(POLYGON, 4326),
        center GEOGRAPHY(POINT, 4326),
        voter_count INTEGER DEFAULT 0,
        door_count INTEGER DEFAULT 0,
        estimated_time_minutes INTEGER,
        route_data JSONB,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  },

  // Contact history
  {
    name: 'Create contact_history table',
    sql: `
      CREATE TABLE IF NOT EXISTS contact_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        ncid VARCHAR(20) NOT NULL REFERENCES voters(ncid) ON DELETE CASCADE,
        list_id INTEGER REFERENCES lists(id),
        turf_id INTEGER REFERENCES turfs(id),
        contact_type VARCHAR(50) NOT NULL,
        contact_result VARCHAR(50),
        survey_responses JSONB,
        notes TEXT,
        contacted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  },

  // Data import logs
  {
    name: 'Create import_logs table',
    sql: `
      CREATE TABLE IF NOT EXISTS import_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        filename VARCHAR(255),
        file_type VARCHAR(50),
        file_size BIGINT,
        total_records INTEGER,
        imported_records INTEGER,
        skipped_records INTEGER,
        error_records INTEGER,
        errors JSONB,
        status VARCHAR(50) DEFAULT 'pending',
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  },

  // Create indexes for fast queries
  {
    name: 'Create voters indexes',
    sql: `
      -- Primary lookup indexes
      CREATE INDEX IF NOT EXISTS idx_voters_county ON voters(county_name);
      CREATE INDEX IF NOT EXISTS idx_voters_precinct ON voters(precinct_name);
      CREATE INDEX IF NOT EXISTS idx_voters_zip ON voters(zip_code);
      CREATE INDEX IF NOT EXISTS idx_voters_city ON voters(city);
      CREATE INDEX IF NOT EXISTS idx_voters_party ON voters(party);
      CREATE INDEX IF NOT EXISTS idx_voters_status ON voters(registration_status);

      -- District indexes
      CREATE INDEX IF NOT EXISTS idx_voters_congressional ON voters(congressional_district);
      CREATE INDEX IF NOT EXISTS idx_voters_senate ON voters(nc_senate_district);
      CREATE INDEX IF NOT EXISTS idx_voters_house ON voters(nc_house_district);
      CREATE INDEX IF NOT EXISTS idx_voters_municipality ON voters(municipality);

      -- Demographic indexes
      CREATE INDEX IF NOT EXISTS idx_voters_age ON voters(age);
      CREATE INDEX IF NOT EXISTS idx_voters_sex ON voters(sex);
      CREATE INDEX IF NOT EXISTS idx_voters_race ON voters(race);
      CREATE INDEX IF NOT EXISTS idx_voters_birth_year ON voters(birth_year);

      -- Score indexes
      CREATE INDEX IF NOT EXISTS idx_voters_turnout_score ON voters(turnout_score);
      CREATE INDEX IF NOT EXISTS idx_voters_partisan_score ON voters(partisan_score);

      -- Geospatial index
      CREATE INDEX IF NOT EXISTS idx_voters_location ON voters USING GIST(location);

      -- Full text search indexes
      CREATE INDEX IF NOT EXISTS idx_voters_name_trgm ON voters USING GIN(full_name gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_voters_address_trgm ON voters USING GIN(street_address gin_trgm_ops);

      -- Composite indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_voters_county_party ON voters(county_name, party);
      CREATE INDEX IF NOT EXISTS idx_voters_county_precinct ON voters(county_name, precinct_name);
      CREATE INDEX IF NOT EXISTS idx_voters_zip_party ON voters(zip_code, party);
      CREATE INDEX IF NOT EXISTS idx_voters_age_party ON voters(age, party);
    `
  },

  {
    name: 'Create vote_history indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_vote_history_ncid ON vote_history(ncid);
      CREATE INDEX IF NOT EXISTS idx_vote_history_date ON vote_history(election_date);
      CREATE INDEX IF NOT EXISTS idx_vote_history_type ON vote_history(election_type);
      CREATE INDEX IF NOT EXISTS idx_vote_history_method ON vote_history(voting_method);
      CREATE INDEX IF NOT EXISTS idx_vote_history_ncid_date ON vote_history(ncid, election_date DESC);
    `
  },

  {
    name: 'Create other table indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_list_voters_household ON list_voters(household_id);
      CREATE INDEX IF NOT EXISTS idx_list_voters_turf ON list_voters(turf_id);
      CREATE INDEX IF NOT EXISTS idx_contact_history_ncid ON contact_history(ncid);
      CREATE INDEX IF NOT EXISTS idx_contact_history_type ON contact_history(contact_type);
      CREATE INDEX IF NOT EXISTS idx_turfs_boundary ON turfs USING GIST(boundary);
      CREATE INDEX IF NOT EXISTS idx_precincts_boundary ON precincts USING GIST(boundary);
    `
  },

  // Create materialized view for quick stats
  {
    name: 'Create voter stats materialized view',
    sql: `
      CREATE MATERIALIZED VIEW IF NOT EXISTS voter_stats AS
      SELECT
        county_name,
        precinct_name,
        party,
        sex,
        race,
        CASE
          WHEN age < 25 THEN '18-24'
          WHEN age < 35 THEN '25-34'
          WHEN age < 45 THEN '35-44'
          WHEN age < 55 THEN '45-54'
          WHEN age < 65 THEN '55-64'
          ELSE '65+'
        END as age_group,
        COUNT(*) as voter_count
      FROM voters
      WHERE registration_status = 'ACTIVE'
      GROUP BY county_name, precinct_name, party, sex, race,
        CASE
          WHEN age < 25 THEN '18-24'
          WHEN age < 35 THEN '25-34'
          WHEN age < 45 THEN '35-44'
          WHEN age < 55 THEN '45-54'
          WHEN age < 65 THEN '55-64'
          ELSE '65+'
        END;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_voter_stats_unique
        ON voter_stats(county_name, precinct_name, party, sex, race, age_group);
    `
  }
];

async function runMigrations() {
  console.log('🚀 Starting database migrations...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const migration of migrations) {
    try {
      console.log(`Running: ${migration.name}`);
      await db.none(migration.sql);
      console.log(`✓ ${migration.name} - completed\n`);
      successCount++;
    } catch (err) {
      // Check if it's a "already exists" type error (which is okay)
      if (err.message.includes('already exists') || err.code === '42P07') {
        console.log(`○ ${migration.name} - already exists, skipping\n`);
        successCount++;
      } else {
        console.error(`✗ ${migration.name} - FAILED`);
        console.error(`  Error: ${err.message}\n`);
        errorCount++;
      }
    }
  }

  console.log('━'.repeat(50));
  console.log(`Migration complete: ${successCount} successful, ${errorCount} errors`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

// Run migrations
runMigrations()
  .then(() => {
    console.log('\n✅ All migrations completed successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  });
