// js/auth.js
// Auth yardımcıları — firebase-config'den auth/db alır ve beklenen fonksiyonları export eder.
import { auth as _auth, db } from "./firebase-config.js"; // firebase-config.js'in app, auth, db export ettiğini varsayar
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getIdTokenResult,
  getIdToken
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Re-export auth (ui.js expects to import auth)
export const auth = _auth;

// register (DEV) - production'da kullanıcı oluşturma admin tarafından yapılmalı
export async function registerUser(email, password, name='') {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    await setDoc(doc(db,'users',uid), {
      email,
      name,
      role: 'company_staff',
      companyId: null,
      createdAt: serverTimestamp()
    });
    return cred.user;
  } catch (err) {
    throw err;
  }
}

// login
export async function loginUser(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  } catch (err) {
    throw err;
  }
}

// logout
export async function logoutUser() {
  try {
    await signOut(auth);
  } catch (err) { console.error(err); }
}

// onAuthChange: callback({ uid, email, profile, claims }) or null
export function onAuthChange(callback) {
  onAuthStateChanged(auth, async (user) => {
    if(!user) { callback(null); return; }
    const idTokenResult = await getIdTokenResult(user, /* forceRefresh */ false);
    const claims = idTokenResult.claims || {};
    let profile = null;
    try {
      const snap = await getDoc(doc(db,'users', user.uid));
      if (snap.exists()) profile = snap.data();
    } catch(e) {
      console.warn('profile load error', e);
    }
    callback({ uid: user.uid, email: user.email, profile, claims });
  });
}

// helper to get fresh id token
export async function getFreshIdToken(force = false) {
  if(!auth.currentUser) throw new Error('no_auth_user');
  return await getIdToken(auth.currentUser, force);
}

// NOTE: createCompanyWithManager/createCompanyUserClientSide intentionally disabled for prod
export async function createCompanyWithManager() {
  throw new Error("Use admin-scripts (server-side) to create companies securely.");
}
export async function createCompanyUserClientSide() {
  throw new Error("Use admin-scripts (server-side) to create users securely.");
}
