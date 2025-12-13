# Firebase Setup Guide for CivicVoice

This guide will walk you through setting up Firebase for the CivicVoice application.

## Prerequisites

- A Google account
- Basic understanding of web development
- Text editor for editing configuration files

## Step 1: Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** (or select an existing project)
3. Enter a project name (e.g., "CivicVoice")
4. (Optional) Enable Google Analytics
5. Click **"Create project"**

## Step 2: Register Your Web App

1. In your Firebase project dashboard, click the **Web icon** (`</>`)
2. Register your app with a nickname (e.g., "CivicVoice Web App")
3. **DO NOT** check "Also set up Firebase Hosting" (we'll do this later)
4. Click **"Register app"**
5. Copy the `firebaseConfig` object that appears

## Step 3: Configure Your Application

1. Open `firebase-config.js` in this directory
2. Replace the placeholder values with your actual Firebase configuration:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",  // Your actual API key
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

3. Update `.firebaserc` with your project ID:

```json
{
  "projects": {
    "default": "your-project-id"
  }
}
```

## Step 4: Enable Authentication

1. In the Firebase Console, click **"Authentication"** in the left sidebar
2. Click **"Get started"**
3. Click on the **"Sign-in method"** tab
4. Enable the following providers:
   - **Email/Password**: Click, toggle "Enable", then "Save"
   - **Google**: Click, toggle "Enable", select project support email, then "Save"

## Step 5: Create Firestore Database

1. In the Firebase Console, click **"Firestore Database"** in the left sidebar
2. Click **"Create database"**
3. Choose **"Start in production mode"** (we'll deploy custom rules)
4. Select a Cloud Firestore location (choose one closest to your users)
5. Click **"Enable"**

## Step 6: Deploy Firestore Security Rules

### Option A: Using Firebase CLI (Recommended)

1. Install Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Login to Firebase:
```bash
firebase login
```

3. Deploy security rules:
```bash
firebase deploy --only firestore:rules
```

4. Deploy indexes:
```bash
firebase deploy --only firestore:indexes
```

### Option B: Manual Deployment

1. In the Firebase Console, go to **Firestore Database** > **Rules**
2. Copy the contents of `firestore.rules` from this directory
3. Paste into the Firebase Console rules editor
4. Click **"Publish"**

For indexes:
1. Go to **Firestore Database** > **Indexes**
2. Click **"Add index"** for each index in `firestore.indexes.json`

## Step 7: Test Your Setup

1. Open `index.html` in a web browser (or use a local server):
```bash
# Using Python
python3 -m http.server 8000

# Using Node.js
npx http-server
```

2. Navigate to `http://localhost:8000`
3. Check the browser console for Firebase initialization messages:
   - ✅ Firebase initialized successfully
   - ✅ Offline persistence enabled
4. Try signing in with email or Google

## Step 8: (Optional) Deploy to Firebase Hosting

1. Initialize Firebase Hosting:
```bash
firebase init hosting
```

2. When prompted:
   - Public directory: Enter `.` (current directory)
   - Configure as single-page app: **Yes**
   - Set up automatic builds: **No**
   - Don't overwrite existing files

3. Deploy to Firebase Hosting:
```bash
firebase deploy --only hosting
```

4. Your app will be live at: `https://your-project-id.firebaseapp.com`

## Security Rules Explained

The `firestore.rules` file ensures:

- ✅ Users can only access their own data
- ✅ Each user has a private collection under `/artifacts/civicvoice-app/users/{userId}`
- ✅ All voter records are isolated per user
- ❌ Unauthenticated users cannot access any data
- ❌ Users cannot access other users' data

### Data Structure

```
/artifacts/{appId}/users/{userId}/voters/{voterId}
                                 /settings/{settingId}
                                 /campaigns/{campaignId}
```

## Firestore Indexes

The application uses composite indexes for efficient queries:

1. **Party + City Filter**: Query voters by party affiliation and city
2. **Name Sorting**: Sort voters by last name and first name
3. **Contact History**: Filter voters by contact status

These are automatically created when you deploy `firestore.indexes.json`.

## Cost Considerations

Firebase offers a generous free tier:

- **Firestore**: 1GB storage, 50K reads/day, 20K writes/day
- **Authentication**: Unlimited users
- **Hosting**: 10GB storage, 360MB/day bandwidth

For most voter activation campaigns, the free tier is sufficient.

## Troubleshooting

### "Firebase initialization failed"

- Check that you've replaced ALL placeholder values in `firebase-config.js`
- Verify your API key is correct (no extra spaces)
- Check browser console for specific error messages

### "Missing or insufficient permissions"

- Ensure you've deployed the security rules from `firestore.rules`
- Verify you're signed in (check the user icon in the app)
- Check that the rules allow access to your user ID

### "Network request failed"

- Check your internet connection
- Verify Firebase project is active in the Firebase Console
- Check browser console for CORS or network errors

### Offline Persistence Warning

If you see "Multiple tabs open" warning:
- This is normal when you have the app open in multiple browser tabs
- Offline persistence will work in the first tab that loads
- Data will still sync across all tabs

## Support

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firebase Console](https://console.firebase.google.com/)
- [Firestore Security Rules Guide](https://firebase.google.com/docs/firestore/security/get-started)

## Next Steps

After setup:
1. Upload a voter database (CSV, Excel, or SQL)
2. Configure column mappings
3. Start tracking voter contacts
4. Export filtered lists for canvassing

Your data is automatically synced to Firebase and accessible from any device where you sign in.
