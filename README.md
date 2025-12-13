# CivicVoice - Voter Activation System

A secure, cloud-based voter database management system built with Firebase, React, and Firestore.

## Features

### 🔐 Secure Authentication
- Email/Password sign-in
- Google OAuth integration
- Firebase-powered authentication
- User-isolated data storage

### 📊 Data Management
- **Multi-format Support**: CSV, TSV, Excel (.xlsx, .xls), SQL dumps
- **Smart Column Mapping**: Auto-detect and map voter data fields
- **Bulk Upload**: Handle large datasets with progress tracking
- **Real-time Sync**: Data automatically synced across devices

### 🎯 Voter Database
- **Advanced Filtering**: Filter by party, city, contact status
- **Search**: Find voters by name or address
- **Pagination**: Handle large datasets efficiently
- **Contact Tracking**: Log canvassing, phone calls, and refusals

### 📈 Campaign Dashboard
- Total voters and contact statistics
- Party affiliation breakdown
- Recent activity tracking
- Contact rate metrics

### 💾 Cloud Persistence
- All data stored securely in Firestore
- Offline support with automatic sync
- Per-user data isolation
- Resume work from any device

## Technology Stack

- **Frontend**: React 18 (via CDN)
- **Styling**: Tailwind CSS
- **Authentication**: Firebase Auth + FirebaseUI
- **Database**: Cloud Firestore
- **Icons**: Lucide React
- **Build**: No build step required (uses Babel Standalone)

## Quick Start

### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd CivicVoice
```

### 2. Configure Firebase

Follow the detailed setup guide in [`FIREBASE_SETUP.md`](FIREBASE_SETUP.md)

**Quick version:**
1. Create a Firebase project at https://console.firebase.google.com/
2. Edit `firebase-config.js` with your credentials
3. Enable Authentication (Email/Password and Google)
4. Create a Firestore database
5. Deploy security rules: `firebase deploy --only firestore:rules`

### 3. Run Locally

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js
npx http-server

# Or just open index.html in a browser
```

Navigate to `http://localhost:8000`

### 4. Deploy to Firebase Hosting

```bash
firebase login
firebase init hosting
firebase deploy
```

Your app will be live at `https://your-project-id.firebaseapp.com`

## File Structure

```
CivicVoice/
├── index.html              # Main HTML entry point
├── react.js                # React application code
├── firebase-config.js      # Firebase configuration
├── firestore.rules         # Firestore security rules
├── firestore.indexes.json  # Database indexes
├── firebase.json           # Firebase project config
├── .firebaserc             # Firebase project ID
├── FIREBASE_SETUP.md       # Detailed setup guide
└── README.md               # This file
```

## Usage

### Import Voter Data

1. Click **"Import"** or select the upload view
2. Choose your file (CSV, Excel, or SQL)
3. Map columns to voter fields (auto-detected):
   - First Name
   - Last Name
   - Address
   - City
   - Party Affiliation
   - Age/DOB
   - Voter ID
4. Click **"Upload"** to save to Firestore

### Filter and Search

1. Navigate to **"My List"**
2. Use the sidebar filters:
   - Search by name or address
   - Filter by party affiliation
   - Filter by city
   - Filter by contact status
3. View filtered results in the table

### Track Contacts

1. Select voters using checkboxes
2. Click **"Canvassed"**, **"Phone"**, or **"Refused"**
3. Contact history is automatically saved
4. View recent activity on the Dashboard

### Export Data

1. Apply desired filters
2. Click **"Export List"** in the sidebar
3. Download filtered data as CSV

## Security

### Authentication
- Firebase Authentication ensures only authorized users access the system
- Support for Email/Password and Google sign-in
- Session management handled by Firebase

### Data Isolation
- Each user has a completely isolated data collection
- Firestore security rules prevent cross-user data access
- Rule: `/artifacts/{appId}/users/{userId}` - users can only access their own data

### Privacy
- No data sharing between users
- All data stored in your Firebase project
- You control data retention and deletion

## Firestore Data Structure

```
/artifacts/civicvoice-app/
  └── users/
      └── {userId}/
          ├── voters/
          │   └── {voterId}/
          │       ├── _id
          │       ├── _sys_firstName
          │       ├── _sys_lastName
          │       ├── _sys_address
          │       ├── _sys_city
          │       ├── _sys_party
          │       ├── _sys_age
          │       ├── _sys_voterId
          │       ├── _contactHistory[]
          │       └── [original columns...]
          ├── settings/
          └── campaigns/
```

## Performance Optimizations

- **Batch Writes**: Upload in chunks of 400 records
- **Pagination**: Display 50 records per page
- **Offline Persistence**: Works without internet connection
- **Real-time Listeners**: Automatic UI updates on data changes
- **Indexed Queries**: Composite indexes for fast filtering

## Browser Compatibility

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

Requires JavaScript enabled.

## Limitations

### Free Tier Limits (Firebase Spark Plan)
- 1GB Firestore storage
- 50,000 reads per day
- 20,000 writes per day
- Unlimited authentication

For larger campaigns, consider upgrading to Firebase Blaze (pay-as-you-go).

## Development

### No Build Required
This project uses CDN-loaded libraries and Babel Standalone, so no build step is needed.

### Adding Features
Edit `react.js` directly. Changes are reflected on page refresh.

### Modifying Security Rules
Edit `firestore.rules` and deploy:
```bash
firebase deploy --only firestore:rules
```

## Troubleshooting

See [`FIREBASE_SETUP.md`](FIREBASE_SETUP.md) for detailed troubleshooting steps.

**Common Issues:**
- **"Firebase initialization failed"**: Check `firebase-config.js` credentials
- **"Missing permissions"**: Deploy Firestore security rules
- **Data not syncing**: Check internet connection and browser console

## License

[Add your license here]

## Contributing

[Add contribution guidelines here]

## Support

For Firebase-specific issues, see [FIREBASE_SETUP.md](FIREBASE_SETUP.md)

For application issues, [create an issue](your-repo-issues-url)

---

**CivicVoice** - Empowering grassroots campaigns with modern technology.
