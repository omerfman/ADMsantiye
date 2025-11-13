// js/firebase-config.js
// Bu dosya: firebaseConfig export eder, app'i başlatır ve auth + db export eder.

export const firebaseConfig = {
  apiKey: "AIzaSyCydcyZB1EiQcRH4dGzaNcUbMvm6QSxlao",
  authDomain: "adm-studio-dev.firebaseapp.com",
  projectId: "adm-studio-dev",
  storageBucket: "adm-studio-dev.firebasestorage.app",
  messagingSenderId: "452574579053",
  appId: "1:452574579053:web:aca1f17dc1a026be3a7264",
  measurementId: "G-LT1GTL6JNG"
};

// Modular Firebase CDN importları (doğrudan tarayıcıda kullanılmak üzere)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Initialize app once
const app = initializeApp(firebaseConfig);

// Export hazır auth ve db objeleri
export const auth = getAuth(app);
export const db = getFirestore(app);

// — DEBUG yardımcıları: sadece yerelde test etmek için auth/db'yi konsola koy
// production'a asla deploy etme; iş bitince kaldır.
window.__AUTH = auth;
window.__DB = db;
console.log('DEBUG: window.__AUTH ve window.__DB olarak export edildi (sadece local test).');

