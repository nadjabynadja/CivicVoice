# CivicVoice - Quick Start Guide

Get up and running with CivicVoice in 5 minutes!

## 🚀 Setup (One-time)

### 1. Create Firebase Project (2 minutes)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"**
3. Name it (e.g., "CivicVoice")
4. Click **"Create project"**

### 2. Get Your Configuration (1 minute)

1. Click the **Web icon** (`</>`) in Firebase Console
2. Register app with a nickname
3. **Copy** the `firebaseConfig` object shown

### 3. Configure Your App (1 minute)

```bash
# Copy the example config
cp firebase-config.example.js firebase-config.js

# Edit firebase-config.js and paste your config
# Replace the placeholder values with what you copied
```

### 4. Enable Authentication (30 seconds)

In Firebase Console:
1. Go to **Authentication** → **Get started**
2. Enable **Email/Password** and **Google**

### 5. Create Database (30 seconds)

In Firebase Console:
1. Go to **Firestore Database** → **Create database**
2. Choose **"Production mode"**
3. Select a location → **Enable**

### 6. Deploy Security Rules (30 seconds)

```bash
# Install Firebase CLI (first time only)
npm install -g firebase-tools

# Login
firebase login

# Deploy rules
firebase deploy --only firestore:rules,firestore:indexes
```

**Or use the deploy script:**
```bash
./deploy.sh
# Select option 1 (Deploy everything)
```

## ✅ You're Done!

### Test It Out

```bash
# Start local server
python3 -m http.server 8000

# Or with Node.js
npm start
```

Open http://localhost:8000

### First Steps

1. **Sign in** with email or Google
2. **Import data**:
   - Click "Import"
   - Upload a CSV/Excel file
   - Map columns
   - Click "Upload"
3. **View your data**:
   - Go to "Dashboard" for overview
   - Go to "My List" to see all voters
4. **Track contacts**:
   - Select voters
   - Click "Canvassed", "Phone", or "Refused"

## 🌐 Deploy to Web (Optional)

Make your app accessible online:

```bash
./deploy.sh
# Select option 1 or 4
```

Your app will be live at:
`https://your-project-id.web.app`

## 🆘 Troubleshooting

### "Firebase initialization failed"
- Check `firebase-config.js` has your actual credentials (not placeholders)

### "Missing permissions"
- Run `firebase deploy --only firestore:rules`

### "Network error"
- Check internet connection
- Verify Firebase project is active

## 📚 Next Steps

- Read [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for detailed setup info
- Read [README.md](README.md) for full documentation
- Check [Firebase Console](https://console.firebase.google.com/) for usage stats

## 💡 Pro Tips

1. **Test with sample data first** - Upload 10-20 rows to test
2. **Use filters** - Filter by party/city before taking action
3. **Export regularly** - Download filtered lists for canvassers
4. **Check Dashboard** - Monitor your contact rate
5. **Works offline** - Data syncs when you're back online

---

**Need help?** See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for detailed troubleshooting.
