import pgPromise from 'pg-promise';
import dotenv from 'dotenv';

dotenv.config();

const pgp = pgPromise({
  // Initialization options
  capSQL: true, // Capitalize SQL keywords for readability

  // Query formatting
  query(e) {
    if (process.env.NODE_ENV === 'development') {
      // Log queries in development (truncated for large queries)
      const query = e.query.length > 500 ? e.query.substring(0, 500) + '...' : e.query;
      console.log('[SQL]', query);
    }
  },

  error(err, e) {
    if (e.cn) {
      console.error('[DB Connection Error]', err);
    } else if (e.query) {
      console.error('[Query Error]', err);
      console.error('[Failed Query]', e.query);
    } else {
      console.error('[DB Error]', err);
    }
  }
});

// Database connection configuration
const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'civicvoice',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: 30, // Max number of connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

// Create database instance
const db = pgp(process.env.DATABASE_URL || config);

// Column sets for bulk inserts
export const ColumnSets = {
  voters: null, // Will be initialized after tables are created
  voteHistory: null,
};

// Initialize column sets for efficient bulk inserts
export function initColumnSets() {
  ColumnSets.voters = new pgp.helpers.ColumnSet([
    'ncid',
    'first_name',
    'middle_name',
    'last_name',
    'name_suffix',
    'full_name',
    'street_address',
    'city',
    'state',
    'zip_code',
    'mailing_address',
    'mailing_city',
    'mailing_state',
    'mailing_zip',
    'county_id',
    'county_name',
    'precinct_id',
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
    { name: 'location', mod: ':raw' }, // For PostGIS geography
    'raw_data'
  ], { table: 'voters' });

  ColumnSets.voteHistory = new pgp.helpers.ColumnSet([
    'ncid',
    'election_date',
    'election_type',
    'election_desc',
    'voting_method',
    'party_voted'
  ], { table: 'vote_history' });
}

// Test database connection
export async function testConnection() {
  try {
    const result = await db.one('SELECT NOW() as now, PostGIS_Version() as postgis');
    console.log('[DB] Connected successfully at', result.now);
    console.log('[DB] PostGIS version:', result.postgis);
    return true;
  } catch (err) {
    console.error('[DB] Connection test failed:', err.message);
    return false;
  }
}

// Export database instance and helpers
export { db, pgp };
export default db;
