// Firebase setup. Uses CDN module URLs so it runs as plain static files (no npm/bundler needed).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Web API keys identify your project; they are not secrets. Your Firestore rules are what protect the data.
const firebaseConfig = {
  apiKey: "AIzaSyClje9hZopkFXly_Gj7HFsdwaZX14ht3Eo",
  authDomain: "loginpage-82d3b.firebaseapp.com",
  projectId: "loginpage-82d3b",
  storageBucket: "loginpage-82d3b.firebasestorage.app",
  messagingSenderId: "1033881906944",
  appId: "1:1033881906944:web:2e7542faf5f3f3abf88de5",
  measurementId: "G-QWTS0WL399"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
