/**
 * Firebase Configuration Template
 *
 * This is an example configuration file. To use it:
 * 1. Copy this file to firebase-config.js
 * 2. Replace the placeholder values with your actual Firebase credentials
 * 3. Never commit firebase-config.js to version control (add to .gitignore)
 *
 * Get your Firebase config:
 * 1. Go to https://console.firebase.google.com/
 * 2. Select your project
 * 3. Click the gear icon → Project settings
 * 4. Scroll to "Your apps" → Select your web app
 * 5. Copy the firebaseConfig object
 */

const firebaseConfig = {
  apiKey: "AIzaSyC_YOUR_ACTUAL_API_KEY_HERE",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
  // measurementId: "G-XXXXXXXXXX" // Optional: Google Analytics
};

// App ID for Firestore collections
// Change this if you want to use a different collection name
const appId = 'civicvoice-app';

// Initialize Firebase
let firebaseApp;
let auth;
let db;

try {
  firebaseApp = firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();

  console.log('✅ Firebase initialized successfully');
  console.log('📍 Project ID:', firebaseConfig.projectId);

  // Enable offline persistence for Firestore
  db.enablePersistence({ synchronizeTabs: true })
    .then(() => {
      console.log('✅ Offline persistence enabled');
    })
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('⚠️ Persistence failed: Multiple tabs open');
      } else if (err.code === 'unimplemented') {
        console.warn('⚠️ Persistence not available in this browser');
      }
    });

} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
  alert('Firebase initialization failed. Please check your configuration in firebase-config.js');
}

// Export for use in the application
window.firebaseApp = firebaseApp;
window.auth = auth;
window.db = db;
window.__app_id = appId;
