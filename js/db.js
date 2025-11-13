// js/db.js
// Firebase config ve Firestore'un export edildiği db modülü.
// Bu dosya ui.js ve diğer modüller tarafından 'db' olarak import ediliyor.

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// initialize app (do not re-init if already)
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Fonksiyonlar (export)
export async function saveProjectForCompany(userUid, companyId, projectName, projectDesc='') {
  const ref = await addDoc(collection(db,'projects'), {
    ownerUid: userUid,
    companyId: companyId || null,
    name: projectName,
    desc: projectDesc,
    createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function getProjectsOfCompany(companyId) {
  const q = query(collection(db,'projects'), where('companyId','==',companyId), orderBy('createdAt','desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

export async function createCompanyDoc(companyName, createdByUid) {
  const ref = await addDoc(collection(db,'companies'), {
    name: companyName,
    createdBy: createdByUid || null,
    createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function listAllCompanies() {
  const snap = await getDocs(collection(db,'companies'));
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

export async function listUsersByCompany(companyId) {
  const q = query(collection(db,'users'), where('companyId','==',companyId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

export async function addAudit(entry) {
  await addDoc(collection(db,'audit_logs'), {
    ...entry,
    createdAt: serverTimestamp()
  });
}
