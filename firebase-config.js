// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA1B0SmQRIbbZDp798VdAv-GPLpKt_sefg",
  authDomain: "civicvoice-be871.firebaseapp.com",
  projectId: "civicvoice-be871",
  storageBucket: "civicvoice-be871.firebasestorage.app",
  messagingSenderId: "960410287442",
  appId: "1:960410287442:web:bbe8f25b24f8a8de898e8b",
  measurementId: "G-TMPH2S1NBD"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
