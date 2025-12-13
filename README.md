# CivicVoice - Voter Activation System

A comprehensive voter data management system with advanced query building, turf cutting, and canvassing tools. Built for political campaigns, civic organizations, and community activists.

## 🚀 Features

### 📊 NC State Board of Elections Data Integration
- **Bulk Data Import**: Handle statewide voter files (500MB+ ZIP files, millions of records)
- **Vote History Tracking**: Import and analyze voter participation across elections
- **Automated Updates**: Weekly refresh script for latest NCSBE data
- **County Filtering**: Import full state or filter to specific counties (e.g., Buncombe)

### 🔍 Advanced Query Builder
- **Geography Filters**: County, precinct, congressional district, municipality, ZIP code
- **Demographics**: Age ranges, sex, race, ethnicity
- **Party Affiliation**: Filter by registration (DEM, REP, UNA, LIB, etc.)
- **Vote History**: Voted in specific elections, primary participation, voting method
- **Turnout Scores**: Filter by calculated voting frequency (0-100%)
- **Partisan Lean**: Inferred partisanship from primary voting patterns (-100 to +100)
- **Real-time Counts**: See universe size update as you adjust filters
- **Saved Queries**: Save and reuse complex searches

### 📋 List Management
- **Virtual Lists**: Create lists from queries without duplicating data
- **Household Grouping**: Cluster voters by address for efficient door-knocking
- **Randomization**: Shuffle list order for call/walk assignments
- **Export Options**: CSV for call sheets, formatted PDF walk lists
- **Progress Tracking**: Track contact attempts and outcomes

### 🗺️ Turf Cutting & Mapping
- **Auto-Cut Turfs**: Divide lists into geographic segments (50-100 doors each)
- **Manual Polygon Drawing**: Draw custom turf boundaries on the map
- **Route Optimization**: Nearest-neighbor algorithm for walking efficiency
- **Voter Visualization**: See voters as map pins, colored by party
- **PostGIS Integration**: Fast geographic queries and spatial operations

### 📱 Mobile-Friendly Voter Lookup
- **Quick Search**: Find voters by name or address in the field
- **Voter Details**: Full profile with vote history
- **Contact Logging**: Record canvass results on the go
- **Responsive Design**: Works on any device

## 🏗️ Architecture

```
CivicVoice/
├── index.html              # Original Firebase-based frontend
├── query.html              # Advanced query builder interface
├── voter-query.js          # React components for query/map
├── react.js                # Original Firebase app code
├── server/                 # Node.js/Express backend
│   ├── src/
│   │   ├── index.js        # Express server entry point
│   │   ├── config/
│   │   │   └── database.js # PostgreSQL/PostGIS config
│   │   ├── db/
│   │   │   ├── migrate.js  # Database schema migrations
│   │   │   └── seed.js     # Initial data seeding
│   │   ├── ingestion/
│   │   │   ├── ncsbe-parser.js    # NC SBE file parsing
│   │   │   ├── ingest-ncsbe.js    # Voter file import
│   │   │   └── ingest-history.js  # Vote history import
│   │   ├── routes/
│   │   │   ├── voters.js   # Voter CRUD endpoints
│   │   │   ├── query.js    # Query builder API
│   │   │   ├── lists.js    # List management
│   │   │   ├── turfs.js    # Turf cutting
│   │   │   ├── export.js   # CSV/PDF exports
│   │   │   ├── stats.js    # Database statistics
│   │   │   ├── geocode.js  # Address geocoding
│   │   │   └── auth.js     # Authentication
│   │   └── scripts/
│   │       └── weekly-update.js   # Automated data refresh
│   └── package.json
└── firebase configs...
```

## 📋 Prerequisites

- **Node.js** 18+
- **PostgreSQL** 14+ with PostGIS extension
- **NC SBE Data Files** (downloaded from ncsbe.gov)

## 🛠️ Installation

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd CivicVoice

# Install backend dependencies
cd server
npm install
cp .env.example .env
```

### 2. Configure Database

Edit `server/.env`:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/civicvoice
DB_HOST=localhost
DB_PORT=5432
DB_NAME=civicvoice
DB_USER=postgres
DB_PASSWORD=your-secure-password
JWT_SECRET=your-super-secret-jwt-key
```

### 3. Create Database

```bash
# Create PostgreSQL database with PostGIS
createdb civicvoice
psql civicvoice -c "CREATE EXTENSION postgis;"
psql civicvoice -c "CREATE EXTENSION pg_trgm;"

# Run migrations
cd server
npm run db:migrate

# Seed initial data
npm run db:seed
```

### 4. Download NC SBE Data

Download from [NC State Board of Elections Data Portal](https://www.ncsbe.gov/results-data/voter-registration-data):

- `ncvoter_Statewide.zip` - Voter registration (updated weekly)
- `ncvhis_Statewide.zip` - Vote history

### 5. Import Data

```bash
cd server

# Import voter registration (full state ~30 min)
npm run ingest -- ../data/ncvoter_Statewide.zip

# Or filter to a single county (~2 min)
npm run ingest -- ../data/ncvoter_Statewide.zip --county=BUNCOMBE

# Import vote history
npm run ingest:history -- ../data/ncvhis_Statewide.zip --county=BUNCOMBE
```

### 6. Start Server

```bash
npm start
# Server runs on http://localhost:3001
```

### 7. Open Frontend

```bash
# Serve frontend files
cd ..
python3 -m http.server 8000

# Open http://localhost:8000/query.html
```

## 📡 API Reference

### Authentication
```
POST /api/auth/register - Create account
POST /api/auth/login    - Login
GET  /api/auth/me       - Current user
```

### Voters
```
GET  /api/voters                - List voters (with filters)
GET  /api/voters/:ncid          - Get voter details
GET  /api/voters/:ncid/history  - Get vote history
POST /api/voters/:ncid/contact  - Log contact attempt
```

### Query Builder
```
POST /api/query/build   - Execute query
POST /api/query/count   - Get count only
GET  /api/query/options - Get filter options
POST /api/query/save    - Save query
GET  /api/query/saved   - List saved queries
```

### Lists
```
GET  /api/lists           - List all lists
POST /api/lists           - Create from query
GET  /api/lists/:id       - Get list details
GET  /api/lists/:id/voters - Get voters in list
POST /api/lists/:id/household - Group by household
POST /api/lists/:id/randomize - Randomize order
```

### Turfs
```
GET  /api/turfs           - List turfs
POST /api/turfs/auto-cut  - Auto-cut list into turfs
POST /api/turfs/manual    - Create with polygon
GET  /api/turfs/:id/route - Get optimized route
GET  /api/turfs/:id/voters - Get voters in turf
```

### Export
```
GET /api/export/csv/list/:id  - Export list as CSV
GET /api/export/pdf/list/:id  - Export as PDF walk sheet
GET /api/export/csv/turf/:id  - Export turf as CSV
GET /api/export/pdf/turf/:id  - Export turf walk sheet
```

### Geocoding
```
POST /api/geocode/single  - Geocode one address
POST /api/geocode/batch   - Start batch geocoding
GET  /api/geocode/status  - Check geocoding progress
GET  /api/geocode/map-data - Get GeoJSON for mapping
```

## ⚙️ Automated Updates

Set up weekly data refresh:

```bash
# Add to crontab
crontab -e

# Run Sunday at 3 AM
0 3 * * 0 cd /path/to/CivicVoice/server && node src/scripts/weekly-update.js >> /var/log/civicvoice.log 2>&1
```

## 🗄️ Database Schema

### Core Tables
- **voters** - Main voter records (NCID, demographics, address, party, scores)
- **vote_history** - Individual voting records per election
- **elections** - Election reference data

### List Management
- **saved_queries** - Saved search configurations
- **lists** - Virtual voter lists
- **list_voters** - List membership with contact tracking
- **turfs** - Geographic segments

### Supporting
- **users** - Authentication
- **counties** - County reference
- **precincts** - Precinct boundaries
- **contact_history** - Contact logs
- **import_logs** - Data import history

## 📊 Performance

- **Import Speed**: ~10,000 voters/second
- **Query Response**: <100ms for most queries
- **Map Loading**: <2s for 5,000 voter pins
- **PDF Generation**: ~1 second per 100 voters

### Indexes
The schema includes optimized indexes for:
- Geographic queries (PostGIS GIST)
- Full-text name/address search (pg_trgm GIN)
- Composite filters (county+party, zip+age, etc.)

## 🔒 Security

- JWT-based authentication
- Password hashing (bcrypt)
- Per-user data isolation
- Rate limiting on API endpoints
- Input sanitization
- Parameterized SQL queries

## 🚧 Limitations

- Geocoding uses free services (rate-limited)
- Route optimization is nearest-neighbor (not TSP-optimal)
- PDF export limited to ~500 voters per file
- Real-time sync requires WebSocket (not implemented)

## 📈 Scaling

For larger deployments:
- Add Redis for caching
- Use PostgreSQL read replicas
- Deploy behind load balancer
- Enable connection pooling (PgBouncer)
- Consider batch geocoding services

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - See LICENSE file

## 🆘 Support

- [Create an issue](https://github.com/your-repo/issues)
- [Documentation](docs/)
- Email: support@civicvoice.org

---

**CivicVoice** - Empowering grassroots campaigns with modern technology.
