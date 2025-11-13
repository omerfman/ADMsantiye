// js/ui.js (GÜNCELLENMİŞ - proje detay, düzenleme, çalışan yönetimi, hatalar düzeltildi)
// Beklenen diğer dosyalar: ./auth.js (export: auth, onAuthChange, loginUser, logoutUser), ./db.js (exports used), ./firebase-config.js (export: db, auth)
// Eğer import yolların farklıysa düzelt.

import { auth, onAuthChange, loginUser, logoutUser } from "./auth.js";
import { db, saveProjectForCompany, getProjectsOfCompany, createCompanyDoc, listAllCompanies, listUsersByCompany, addAudit } from "./db.js";
// ui.js - tek, birleşik import bloğu (dosyanın en üstüne koy)
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";


// ADMIN API endpoint (server kurduğunda çalışacak). Şu an server yoksa çağrı yapılmaz.
// Eğer ileride sunucunu localhost yerine gerçek domain'de çalıştıracaksan bu URL'yi değiştir.
const ADMIN_API = 'http://localhost:4000';

// route detection
const path = window.location.pathname;
const isIndex = path.endsWith('/html/index.html') || path.endsWith('/index.html') || path.endsWith('/html/');
const isDashboard = path.endsWith('/html/dashboard.html') || path.endsWith('/dashboard.html');

// modal root helper
const modalRoot = document.getElementById('modal-root') || (() => {
  const el = document.createElement('div'); el.id = 'modal-root'; document.body.appendChild(el); return el;
})();
function createModalInner(innerHtml){
  modalRoot.innerHTML = `<div class="modal"><div class="modal-inner">${innerHtml}</div></div>`;
  return modalRoot.querySelector('.modal');
}
function closeModal(){ modalRoot.innerHTML = ''; }
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function $$(sel){ return Array.from(document.querySelectorAll(sel)); }

// ---------- INDEX PAGE (login only) ----------
if(isIndex){
  const loginForm = document.getElementById('loginForm');
  const authMsg = document.getElementById('auth-msg');

  loginForm && loginForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    authMsg.textContent = '';
    const email = loginForm.email.value.trim();
    const password = loginForm.password.value.trim();
    try {
      await loginUser(email, password);
      authMsg.textContent = 'Giriş başarılı, yönlendiriliyorsunuz...';
      setTimeout(()=> location.href = 'dashboard.html', 400);
    } catch(err){
      console.error('login error', err);
      authMsg.textContent = 'Giriş hatası: ' + (err.message || err);
    }
  });

  // IMPORTANT: public register UI should be removed in production.
}

// ---------- DASHBOARD PAGE ----------
if(isDashboard){
  const userEmailEl = document.getElementById('user-email');
  const btnLogout = document.getElementById('btn-logout');
  const navProjects = document.getElementById('nav-projects');
  const navCompanies = document.getElementById('nav-companies');
  // NOTE: ensure you added this button in dashboard.html (see instructions below)
  const navEmployees = document.getElementById('nav-employees');
  const navAudit = document.getElementById('nav-audit');

  const headerTitle = document.getElementById('header-title');
  const btnNew = document.getElementById('btn-new');
  const search = document.getElementById('search');
  const content = document.getElementById('content');

  let currentUser = null; // { uid, email, profile, claims, role }

  // Auth listener
  onAuthChange(async (user) => {
    if(!user) { location.href = 'index.html'; return; }
    // user = { uid, email, profile, claims }
    currentUser = user;
    currentUser.role = user.claims?.role || user.profile?.role || 'company_staff';
    userEmailEl.textContent = user.email || '—';

    // hide Companies menu for non-super-admin
    if(currentUser.role !== 'super_admin') {
      if(navCompanies) navCompanies.style.display = 'none';
    } else {
      if(navCompanies) navCompanies.style.display = 'inline-block';
    }

    // show/hide Employees menu: available for company_admin & super_admin
    if(navEmployees){
      if(currentUser.role === 'super_admin' || currentUser.role === 'company_admin'){
        navEmployees.style.display = 'inline-block';
      } else {
        navEmployees.style.display = 'none';
      }
    }

    // default view
    if(currentUser.role === 'super_admin'){
      setActive(navCompanies);
      await renderCompaniesView();
    } else {
      setActive(navProjects);
      await renderProjectsForCompanyView();
    }
  });

  btnLogout.addEventListener('click', async ()=> { await logoutUser(); location.href='index.html'; });

  navProjects && navProjects.addEventListener('click', ()=> { setActive(navProjects); renderProjectsForCompanyView(); });
  navCompanies && navCompanies.addEventListener('click', ()=> { setActive(navCompanies); renderCompaniesView(); });
  navEmployees && navEmployees.addEventListener('click', ()=> { setActive(navEmployees); renderEmployeesView(); });
  navAudit && navAudit.addEventListener('click', ()=> { setActive(navAudit); renderAuditView(); });

  btnNew && btnNew.addEventListener('click', ()=> {
    if(navProjects && navProjects.classList.contains('active')) openNewProjectModal();
    else if(navCompanies && navCompanies.classList.contains('active')) openCreateCompanyModal(); // but super_admin only
    else if(navEmployees && navEmployees.classList.contains('active')) openCreateEmployeeModal(currentUser.profile?.companyId || currentUser.claims?.companyId);
  });

  function setActive(el){ [navProjects, navCompanies, navEmployees, navAudit].forEach(n=> n && n.classList.remove('active')); el && el.classList.add('active'); }

  // ---------- Projects (company-scoped) ----------
  async function renderProjectsForCompanyView(){
    headerTitle.textContent = 'Projeler';
    const companyId = currentUser.claims?.companyId || currentUser.profile?.companyId;
    if(!companyId){
      content.innerHTML = `<div class="card"><div class="small">Bu kullanıcı henüz bir şirkete bağlı değil.</div></div>`;
      return;
    }

    let projects = [];
    try {
      projects = await getProjectsOfCompany(companyId);
    } catch(err){
      console.error('getProjectsOfCompany error', err);
      // fallback: try getting all and filter client-side (only for dev)
      if(String(err.message).toLowerCase().includes('requires an index')){
        try {
          const snap = await getDocs(collection(db,'projects'));
          const all = snap.docs.map(d=>({ id:d.id, ...d.data() }));
          projects = all.filter(p => p.companyId === companyId);
        } catch(e2){
          content.innerHTML = `<div class="card"><div class="small">Projeler yüklenemedi: ${err.message||err}</div></div>`;
          return;
        }
      } else {
        content.innerHTML = `<div class="card"><div class="small">Projeler yüklenemedi: ${err.message||err}</div></div>`;
        return;
      }
    }

    content.innerHTML = `<div class="card"><h3>Projeler (${projects.length})</h3><div class="grid" id="projects-grid"></div></div>`;
    const grid = document.getElementById('projects-grid');
    if(!projects.length) grid.innerHTML = '<div class="small">Henüz proje yok.</div>';
    projects.forEach(p=>{
      const card = document.createElement('div'); card.className='card';
      card.innerHTML = `
        <h4>${escapeHtml(p.name)}</h4>
        <div class="small">${escapeHtml(p.desc || '')}</div>
        <div style="margin-top:8px">
          <button class="btn open-project" data-id="${p.id}">Aç</button>
          <button class="btn-ghost edit-project" data-id="${p.id}">Düzenle</button>
        </div>
      `;
      grid.appendChild(card);
    });

    // bind events (use currentTarget to avoid errors)
    $$('.open-project').forEach(btn => btn.addEventListener('click', (ev) => {
      const id = ev.currentTarget.getAttribute('data-id');
      openProjectDetailModal(id);
    }));

    $$('.edit-project').forEach(btn => btn.addEventListener('click', (ev) => {
      const id = ev.currentTarget.getAttribute('data-id');
      openEditProjectModalById(id);
    }));
  }

  function openNewProjectModal(){
    const html = `
      <h3>Yeni Proje</h3>
      <div class="form-row"><label>Ad</label><input id="mp-name" /></div>
      <div class="form-row"><label>Lokasyon</label><input id="mp-loc" /></div>
      <div class="form-row"><label>Açıklama</label><textarea id="mp-desc"></textarea></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="mp-save">Oluştur</button><button class="btn-ghost" id="mp-cancel">İptal</button></div>
    `;
    const modal = createModalInner(html);
    modal.querySelector('#mp-cancel').addEventListener('click', closeModal);
    modal.querySelector('#mp-save').addEventListener('click', async ()=>{
      const name = document.getElementById('mp-name').value.trim();
      const desc = document.getElementById('mp-desc').value.trim();
      if(!name) return alert('Proje adı gerekli');
      try {
        const companyId = currentUser.claims?.companyId || currentUser.profile?.companyId;
        const id = await saveProjectForCompany(currentUser.uid, companyId, name, desc);
        await addAudit({ action:'create_project', performedBy: currentUser.uid, companyId, detail:{ projectId: id, name } });
        closeModal();
        await renderProjectsForCompanyView();
        openProjectDetailModal(id);
      } catch(err){
        console.error(err);
        alert('Projeyi kaydederken hata: ' + (err.message||err));
      }
    });
  }

  // ---------- Project detail + edit ----------
  async function openProjectDetailModal(projectId){
    try {
      const projRef = doc(db, 'projects', projectId);
      const snap = await getDoc(projRef);
      if(!snap.exists()) return alert('Proje bulunamadı');
      const project = { id: snap.id, ...snap.data() };

      const html = `
        <h3>Proje: ${escapeHtml(project.name)}</h3>
        <div class="small">Açıklama: ${escapeHtml(project.desc || '')}</div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn" id="pt-logs">Şantiye Günlüğü</button>
          <button class="btn" id="pt-stocks">Stok</button>
          <button class="btn" id="pt-pay">Hakediş</button>
          <button class="btn-ghost" id="pt-edit">Düzenle</button>
          <button class="btn-ghost" id="pt-close">Kapat</button>
        </div>
        <div id="project-detail-body" style="margin-top:12px"></div>
      `;
      const modal = createModalInner(html);
      modal.querySelector('#pt-close').addEventListener('click', closeModal);
      modal.querySelector('#pt-logs').addEventListener('click', ()=> renderProjectLogs(project));
      modal.querySelector('#pt-stocks').addEventListener('click', ()=> renderProjectStocks(project));
      modal.querySelector('#pt-pay').addEventListener('click', ()=> renderProjectPayments(project));
      modal.querySelector('#pt-edit').addEventListener('click', ()=> openEditProjectModal(project));
    } catch(err){
      console.error('openProjectDetailModal error', err);
      alert('Proje detayı açılırken hata: ' + (err.message||err));
    }
  }

  function openEditProjectModal(project){
    const html = `
      <h3>Proje Düzenle</h3>
      <div class="form-row"><label>Proje Adı</label><input id="edit-name" value="${escapeHtml(project.name)}" /></div>
      <div class="form-row"><label>Açıklama</label><textarea id="edit-desc">${escapeHtml(project.desc||'')}</textarea></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="edit-save">Kaydet</button><button class="btn-ghost" id="edit-cancel">İptal</button></div>
    `;
    const modal = createModalInner(html);
    modal.querySelector('#edit-cancel').addEventListener('click', closeModal);
    modal.querySelector('#edit-save').addEventListener('click', async ()=>{
      const name = document.getElementById('edit-name').value.trim();
      const desc = document.getElementById('edit-desc').value.trim();
      if(!name) return alert('Proje adı gerekli');
      try {
        const projRef = doc(db,'projects', project.id);
        await updateDoc(projRef, { name, desc });
        await addAudit({ action:'edit_project', performedBy: currentUser.uid, companyId: project.companyId, detail:{ projectId: project.id, name } });
        closeModal();
        // refresh
        await renderProjectsForCompanyView();
        openProjectDetailModal(project.id);
      } catch(err){
        console.error(err);
        alert('Güncelleme hatası: ' + (err.message||err));
      }
    });
  }

  async function openEditProjectModalById(projectId){
    // helper to fetch project and call the editor
    const snap = await getDoc(doc(db,'projects',projectId));
    if(!snap.exists()) return alert('Proje bulunamadı');
    openEditProjectModal({ id: snap.id, ...snap.data() });
  }

  // ---------- Project detail placeholders (logs/stocks/payments) ----------
  async function renderProjectLogs(project){
  const body = modalRoot.querySelector('#project-detail-body');
  body.innerHTML = `
    <div class="card">
      <h4>Şantiye Günlüğü — ${escapeHtml(project.name)}</h4>
      <div class="form-row"><textarea id="log-text" placeholder="Yeni kayıt..."></textarea></div>
      <div class="form-row"><label>Fotoğraflar (isteğe bağlı)</label><input id="log-photos" type="file" accept="image/*" multiple /></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="log-add">Ekle</button></div>
      <div id="log-list" style="margin-top:12px"><div class="small">Yükleniyor...</div></div>
    </div>
  `;

  const listEl = document.getElementById('log-list');
  const btnAdd = document.getElementById('log-add');

  // load logs
  async function loadLogs(){
    listEl.innerHTML = '<div class="small">Yükleniyor...</div>';
    try {
      const q = query(collection(db, 'projects', project.id, 'field_logs'), orderBy('createdAt','desc'), limit(50));
      const snap = await getDocs(q);
      if(snap.empty){ listEl.innerHTML = '<div class="small">Henüz kayıt yok.</div>'; return; }
      listEl.innerHTML = '';
      snap.docs.forEach(d=>{
        const data = d.data();
        const time = data.createdAt ? new Date(data.createdAt.toMillis()).toLocaleString() : '-';
        const el = document.createElement('div'); el.className='card';
        el.innerHTML = `<div style="display:flex;justify-content:space-between"><div class="small">${escapeHtml(data.authorName || data.authorUid || '—')}</div><div class="small">${escapeHtml(time)}</div></div>
          <div style="margin-top:6px">${escapeHtml(data.text||'')}</div>
          ${data.photos && data.photos.length ? `<div style="display:flex;gap:6px;margin-top:8px">${data.photos.map(p=>`<img src="${p}" style="max-width:120px;max-height:80px;border-radius:6px;"/>`).join('')}</div>` : ''}`;
        listEl.appendChild(el);
      });
    } catch(err){
      console.error(err);
      listEl.innerHTML = `<div class="small">Günlükler yüklenemedi: ${err.message||err}</div>`;
    }
  }

  // upload helper
  const storage = getStorage();
  async function uploadFiles(files){
    const urls = [];
    for(const f of files){
      const path = `projects/${project.id}/logs/${Date.now()}_${f.name}`;
      const sref = storageRef(storage, path);
      const snap = await uploadBytes(sref, f);
      const url = await getDownloadURL(sref);
      urls.push(url);
    }
    return urls;
  }

  btnAdd.addEventListener('click', async ()=>{
    const text = document.getElementById('log-text').value.trim();
    const input = document.getElementById('log-photos');
    const files = input.files;
    if(!text && files.length === 0) return alert('En az yazı veya fotoğraf ekleyin.');
    try {
      btnAdd.disabled = true; btnAdd.textContent='Ekleniyor...';
      let photoUrls = [];
      if(files && files.length) {
        photoUrls = await uploadFiles(files);
      }
      const newDoc = await addDoc(collection(db, 'projects', project.id, 'field_logs'), {
        text,
        photos: photoUrls,
        authorUid: currentUser.uid,
        authorName: currentUser.profile?.name || '',
        createdAt: serverTimestamp()
      });
      // audit
      await addAudit({ action:'create_log', performedBy: currentUser.uid, companyId: project.companyId, detail:{ projectId: project.id, logId: newDoc.id, text: text.slice(0,120) } });
      document.getElementById('log-text').value = '';
      input.value = '';
      await loadLogs();
    } catch(err){
      console.error(err);
      alert('Günlük eklenemedi: ' + (err.message||err));
    } finally {
      btnAdd.disabled = false; btnAdd.textContent='Ekle';
    }
  });

  await loadLogs();
}

  async function renderProjectStocks(project){
  const body = modalRoot.querySelector('#project-detail-body');
  body.innerHTML = `
    <div class="card">
      <h4>Stok — ${escapeHtml(project.name)}</h4>
      <div class="form-row"><label>Malzeme Adı</label><input id="stk-name"/></div>
      <div class="form-row"><label>Birim</label><input id="stk-unit" placeholder="adet/kg/m2"/></div>
      <div class="form-row"><label>Miktar</label><input id="stk-qty" type="number" value="0"/></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="stk-add">Ekle/Güncelle</button></div>
      <div id="stk-list" style="margin-top:12px"><div class="small">Yükleniyor...</div></div>
    </div>
  `;

  const listEl = document.getElementById('stk-list');
  const btnAdd = document.getElementById('stk-add');

  async function loadStocks(){
    listEl.innerHTML = '<div class="small">Yükleniyor...</div>';
    try {
      const q = query(collection(db,'projects',project.id,'stocks'), orderBy('createdAt','desc'));
      const snap = await getDocs(q);
      if(snap.empty){ listEl.innerHTML = '<div class="small">Henüz stok yok.</div>'; return; }
      listEl.innerHTML = '';
      snap.docs.forEach(d=>{
        const data = d.data();
        const el = document.createElement('div'); el.className='card';
        el.innerHTML = `<div style="display:flex;justify-content:space-between"><div><strong>${escapeHtml(data.name)}</strong><div class="small">Birim: ${escapeHtml(data.unit||'—')}</div></div><div style="text-align:right"><div class="small">Miktar: ${escapeHtml(String(data.qty||0))}</div><button class="btn-ghost btn-stk-edit" data-id="${d.id}">Düzenle</button> <button class="btn-ghost btn-stk-del" data-id="${d.id}">Sil</button></div></div>`;
        listEl.appendChild(el);
      });
      // bind edit/del
      $$('.btn-stk-edit').forEach(b => b.addEventListener('click', async (ev)=>{
        const id = ev.currentTarget.getAttribute('data-id');
        const snap = await getDoc(doc(db,'projects',project.id,'stocks',id));
        const data = snap.data();
        document.getElementById('stk-name').value = data.name;
        document.getElementById('stk-unit').value = data.unit || '';
        document.getElementById('stk-qty').value = data.qty || 0;
        // save button behavior: update instead of new
        btnAdd.dataset.editId = id;
        btnAdd.textContent = 'Güncelle';
      }));
      $$('.btn-stk-del').forEach(b => b.addEventListener('click', async (ev)=>{
        if(!confirm('Silinsin mi?')) return;
        const id = ev.currentTarget.getAttribute('data-id');
        await deleteDoc(doc(db,'projects',project.id,'stocks',id));
        await addAudit({ action:'delete_stock', performedBy: currentUser.uid, companyId: project.companyId, detail:{ projectId: project.id, stockId: id } });
        await loadStocks();
      }));
    } catch(err){
      console.error(err);
      listEl.innerHTML = `<div class="small">Stoklar yüklenemedi: ${err.message||err}</div>`;
    }
  }

  btnAdd.addEventListener('click', async ()=>{
    const name = document.getElementById('stk-name').value.trim();
    const unit = document.getElementById('stk-unit').value.trim();
    const qty = parseFloat(document.getElementById('stk-qty').value) || 0;
    if(!name) return alert('Malzeme adı gerekli');

    try {
      btnAdd.disabled = true; btnAdd.textContent='Kaydediliyor...';
      const editId = btnAdd.dataset.editId;
      if(editId){
        const ref = doc(db,'projects',project.id,'stocks', editId);
        await updateDoc(ref, { name, unit, qty, lastUpdated: serverTimestamp(), updatedBy: currentUser.uid });
        delete btnAdd.dataset.editId;
        btnAdd.textContent = 'Ekle/Güncelle';
        await addAudit({ action:'edit_stock', performedBy: currentUser.uid, companyId: project.companyId, detail:{ projectId: project.id, stockId: editId, name } });
      } else {
        const newRef = await addDoc(collection(db,'projects',project.id,'stocks'), { name, unit, qty, createdAt: serverTimestamp(), createdBy: currentUser.uid });
        await addAudit({ action:'create_stock', performedBy: currentUser.uid, companyId: project.companyId, detail:{ projectId: project.id, stockId: newRef.id, name } });
      }
      document.getElementById('stk-name').value = '';
      document.getElementById('stk-unit').value = '';
      document.getElementById('stk-qty').value = 0;
      await loadStocks();
    } catch(err){
      console.error(err);
      alert('Stok kaydedilemedi: ' + (err.message||err));
    } finally {
      btnAdd.disabled = false; btnAdd.textContent='Ekle/Güncelle';
    }
  });

  await loadStocks();
}

 async function renderProjectPayments(project){
  const body = modalRoot.querySelector('#project-detail-body');
  body.innerHTML = `
    <div class="card">
      <h4>Hakediş — ${escapeHtml(project.name)}</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr 80px 100px 100px;gap:8px">
        <input id="pay-work" placeholder="Yapılan iş / Ürün" />
        <input id="pay-unit" placeholder="Birim" />
        <input id="pay-qty" placeholder="Adet" type="number" />
        <input id="pay-unitprice" placeholder="Birim Fiyatı" type="number" />
        <div style="display:flex;gap:8px"><button class="btn" id="pay-add">Ekle</button><button class="btn-ghost" id="pay-calc">Hesapla</button></div>
      </div>
      <div id="pay-list" style="margin-top:12px"><div class="small">Yükleniyor...</div></div>
    </div>
  `;

  const listEl = document.getElementById('pay-list');
  const btnAdd = document.getElementById('pay-add');
  const btnCalc = document.getElementById('pay-calc');

  async function loadPayments(){
    listEl.innerHTML = '<div class="small">Yükleniyor...</div>';
    try {
      const q = query(collection(db, 'projects', project.id, 'payments'), orderBy('createdAt','desc'));
      const snap = await getDocs(q);
      if(snap.empty){ listEl.innerHTML = '<div class="small">Henüz hakediş yok.</div>'; return; }
      let totalAll = 0;
      listEl.innerHTML = `<div class="small">Toplam Ödeme: <span id="pay-total">0</span></div>`;
      snap.docs.forEach(d=>{
        const data = d.data();
        const total = (data.quantity||0) * (data.unitPrice||0);
        totalAll += total;
        const el = document.createElement('div'); el.className='card';
        el.innerHTML = `<div style="display:flex;justify-content:space-between"><div><strong>${escapeHtml(data.work||'—')}</strong><div class="small">${escapeHtml(data.unit||'')}</div></div><div class="small">${(data.quantity||0)} x ${(data.unitPrice||0).toLocaleString()}</div></div>
          <div class="small">Toplam: ${total.toLocaleString()}</div>
          <div style="margin-top:8px"><button class="btn-ghost btn-pay-edit" data-id="${d.id}">Düzenle</button> <button class="btn-ghost btn-pay-del" data-id="${d.id}">Sil</button></div>`;
        listEl.appendChild(el);
      });
      document.getElementById('pay-total').textContent = totalAll.toLocaleString();

      $$('.btn-pay-edit').forEach(b => b.addEventListener('click', async (ev)=>{
        const id = ev.currentTarget.getAttribute('data-id');
        const snap = await getDoc(doc(db,'projects',project.id,'payments',id));
        const data = snap.data();
        document.getElementById('pay-work').value = data.work || '';
        document.getElementById('pay-unit').value = data.unit || '';
        document.getElementById('pay-qty').value = data.quantity || 0;
        document.getElementById('pay-unitprice').value = data.unitPrice || 0;
        btnAdd.dataset.editId = id;
        btnAdd.textContent = 'Güncelle';
      }));
      $$('.btn-pay-del').forEach(b => b.addEventListener('click', async (ev)=>{
        if(!confirm('Silinsin mi?')) return;
        const id = ev.currentTarget.getAttribute('data-id');
        await deleteDoc(doc(db,'projects',project.id,'payments',id));
        await addAudit({ action:'delete_payment', performedBy: currentUser.uid, companyId: project.companyId, detail:{ projectId: project.id, paymentId: id } });
        await loadPayments();
      }));

    } catch(err){
      console.error(err);
      listEl.innerHTML = `<div class="small">Hakedişler yüklenemedi: ${err.message||err}</div>`;
    }
  }

  btnCalc.addEventListener('click', ()=>{
    const q = parseFloat(document.getElementById('pay-qty').value) || 0;
    const p = parseFloat(document.getElementById('pay-unitprice').value) || 0;
    alert('Satır toplamı: ' + (q * p));
  });

  btnAdd.addEventListener('click', async ()=>{
    const work = document.getElementById('pay-work').value.trim();
    const unit = document.getElementById('pay-unit').value.trim();
    const quantity = parseFloat(document.getElementById('pay-qty').value) || 0;
    const unitPrice = parseFloat(document.getElementById('pay-unitprice').value) || 0;
    if(!work) return alert('Yapılan işi girin.');
    try {
      btnAdd.disabled = true; btnAdd.textContent='Kaydediliyor...';
      const editId = btnAdd.dataset.editId;
      if(editId){
        const ref = doc(db,'projects',project.id,'payments', editId);
        await updateDoc(ref, { work, unit, quantity, unitPrice, total: quantity*unitPrice, updatedAt: serverTimestamp(), updatedBy: currentUser.uid });
        delete btnAdd.dataset.editId;
        btnAdd.textContent = 'Ekle';
        await addAudit({ action:'edit_payment', performedBy: currentUser.uid, companyId: project.companyId, detail:{ projectId: project.id, paymentId: editId, work } });
      } else {
        const newRef = await addDoc(collection(db,'projects',project.id,'payments'), { work, unit, quantity, unitPrice, total: quantity*unitPrice, createdAt: serverTimestamp(), createdBy: currentUser.uid, status: 'pending' });
        await addAudit({ action:'create_payment', performedBy: currentUser.uid, companyId: project.companyId, detail:{ projectId: project.id, paymentId: newRef.id, work } });
      }
      document.getElementById('pay-work').value = '';
      document.getElementById('pay-unit').value = '';
      document.getElementById('pay-qty').value = 0;
      document.getElementById('pay-unitprice').value = 0;
      await loadPayments();
    } catch(err){
      console.error(err);
      alert('Hakediş kaydedilemedi: ' + (err.message||err));
    } finally {
      btnAdd.disabled = false; btnAdd.textContent='Ekle';
    }
  });

  await loadPayments();
}


  // ---------- Companies (super_admin only) ----------
  async function renderCompaniesView(){
    headerTitle.textContent = 'Şirketler';
    if(currentUser.role !== 'super_admin'){
      content.innerHTML = `<div class="card"><div class="small">Bu bölüme yalnızca süper yönetici erişebilir. Kendi şirketinizi görmek için "Projeler" bölümüne gidin.</div></div>`;
      return;
    }
    let companies = [];
    try {
      companies = await listAllCompanies();
    } catch(err){
      console.error(err);
      content.innerHTML = `<div class="card"><div class="small">Şirketler yüklenemedi: ${err.message||err}</div></div>`;
      return;
    }
    content.innerHTML = `<div class="card"><h3>Firmalar (${companies.length})</h3><div style="display:flex;gap:8px;margin-bottom:10px"><button class="btn" id="btn-create-company">Şirket Oluştur</button></div><div class="grid" id="companies-grid"></div></div>`;
    const grid = document.getElementById('companies-grid');
    if(!companies.length) grid.innerHTML = '<div class="small">Henüz şirket yok.</div>';
    companies.forEach(c=>{
      const el = document.createElement('div'); el.className='card';
      el.innerHTML = `<h4>${escapeHtml(c.name)}</h4><div class="small">ID: ${c.id}</div><div style="margin-top:8px"><button class="btn-ghost open-company" data-id="${c.id}">Aç</button></div>`;
      grid.appendChild(el);
    });
    document.getElementById('btn-create-company')?.addEventListener('click', openCreateCompanyModal);
    $$('.open-company').forEach(b => b.addEventListener('click', ev => {
      const id = ev.currentTarget.getAttribute('data-id');
      openCompanyDetail(id);
    }));
  }

  function openCreateCompanyModal(){
    const html = `
      <h3>Yeni Şirket Oluştur (Sadece süper admin)</h3>
      <div class="form-row"><label>Şirket Adı</label><input id="cmp-name" /></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="cmp-create">Oluştur</button><button class="btn-ghost" id="cmp-cancel">İptal</button></div>
    `;
    const modal = createModalInner(html);
    modal.querySelector('#cmp-cancel').addEventListener('click', closeModal);
    modal.querySelector('#cmp-create').addEventListener('click', async ()=>{
      const name = document.getElementById('cmp-name').value.trim();
      if(!name) return alert('Şirket adı gerekli');
      try {
        // production: call admin script / backend. For convenience we call client createCompanyDoc (dev)
        const createdId = await createCompanyDoc(name, currentUser.uid);
        await addAudit({ action:'create_company', performedBy: currentUser.uid, companyId: createdId, detail:{ name }});
        closeModal();
        await renderCompaniesView();
      } catch(err){
        console.error(err);
        alert('Şirket oluşturma hatası: ' + (err.message||err));
      }
    });
  }

  async function openCompanyDetail(companyId){
    const snap = await getDocs(collection(db,'companies'));
    const company = snap.docs.map(d=>({ id:d.id, ...d.data() })).find(x=>x.id===companyId);
    if(!company) return alert('Şirket bulunamadı');
    const html = `
      <h3>Şirket: ${escapeHtml(company.name)}</h3>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn" id="cmp-tab-users">Kullanıcılar</button>
        <button class="btn" id="cmp-tab-projects">Projeler</button>
        <button class="btn-ghost" id="cmp-close">Kapat</button>
      </div>
      <div id="cmp-body" style="margin-top:12px"></div>
    `;
    const modal = createModalInner(html);
    modal.querySelector('#cmp-close').addEventListener('click', closeModal);
    modal.querySelector('#cmp-tab-users').addEventListener('click', ()=> renderCompanyUsers(companyId));
    modal.querySelector('#cmp-tab-projects').addEventListener('click', ()=> renderCompanyProjects(companyId));
    renderCompanyUsers(companyId);
  }

  async function renderCompanyUsers(companyId){
    const body = modalRoot.querySelector('#cmp-body');
    body.innerHTML = `<div class="card"><h4>Kullanıcılar</h4><div class="small">Yükleniyor...</div></div>`;
    try {
      const users = await listUsersByCompany(companyId);
      body.innerHTML = `<div class="card"><h4>Kullanıcılar (${users.length})</h4><div style="display:flex;gap:8px;margin-bottom:8px"><button class="btn" id="cmp-add-user">Kullanıcı Oluştur</button></div><div class="grid" id="cmp-users-grid"></div></div>`;
      const grid = document.getElementById('cmp-users-grid');
      users.forEach(u=>{
        const el = document.createElement('div'); el.className='card';
        el.innerHTML = `<strong>${escapeHtml(u.name||'—')}</strong><div class="small">${escapeHtml(u.email||'—')}</div><div class="small">Rol: ${escapeHtml(u.role||'—')}</div>`;
        grid.appendChild(el);
      });
      document.getElementById('cmp-add-user').addEventListener('click', ()=> openCreateCompanyUserModal(companyId));
    } catch(err) {
      console.error(err);
      body.innerHTML = `<div class="card"><div class="small">Kullanıcılar yüklenemedi: ${err.message||err}</div></div>`;
    }
  }

  function openCreateCompanyUserModal(companyId){
    const html = `
      <h3>Şirkete Kullanıcı Ekle</h3>
      <div class="form-row"><label>Ad Soyad</label><input id="cu-name" /></div>
      <div class="form-row"><label>E-posta</label><input id="cu-email" /></div>
      <div class="form-row"><label>Parola</label><input id="cu-pass" type="password" /></div>
      <div class="form-row"><label>Rol</label>
        <select id="cu-role"><option value="company_staff">Çalışan</option><option value="company_admin">Yönetici</option></select>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="cu-save">Oluştur</button><button class="btn-ghost" id="cu-cancel">İptal</button></div>
    `;
    const modal = createModalInner(html);
    modal.querySelector('#cu-cancel').addEventListener('click', closeModal);
    modal.querySelector('#cu-save').addEventListener('click', async () => {
      const name = document.getElementById('cu-name').value.trim();
      const email = document.getElementById('cu-email').value.trim();
      const pass = document.getElementById('cu-pass').value.trim();
      const role = document.getElementById('cu-role').value;
      if(!email || !pass || !name) return alert('Tüm alanları doldurun');
      // If ADMIN_API is running, call it (secure). Otherwise inform the user to run server.
      if(!ADMIN_API){
        alert('Sunucu yapılandırılmadı. Lütfen admin-scripts server kurulumunu yapın.');
        return;
      }
      try {
        // get id token to authenticate
        const token = await auth.currentUser.getIdToken(/* forceRefresh */ true);
        const res = await fetch(`${ADMIN_API}/create-user`, {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ companyId, email, password: pass, name, role })
        });
        const data = await res.json();
        if(!res.ok) throw new Error(data.error || 'Sunucu hatası');
        alert('Kullanıcı oluşturuldu: ' + data.uid);
        closeModal();
        renderCompanyUsers(companyId);
      } catch(err){
        console.error(err);
        alert('Kullanıcı oluşturulamadı: ' + (err.message || err));
      }
    });
  }

  async function renderCompanyProjects(companyId){
    const body = modalRoot.querySelector('#cmp-body');
    body.innerHTML = `<div class="card"><h4>Projeler</h4><div class="small">Yükleniyor...</div></div>`;
    try {
      const projects = await getProjectsOfCompany(companyId);
      body.innerHTML = `<div class="card"><h4>Projeler (${projects.length})</h4><div class="grid">${projects.map(p=>`<div class="card"><strong>${escapeHtml(p.name)}</strong><div class="small">${escapeHtml(p.desc||'')}</div></div>`).join('')}</div></div>`;
    } catch(err) {
      console.error(err);
      body.innerHTML = `<div class="card"><div class="small">Projeler yüklenemedi: ${err.message||err}</div></div>`;
    }
  }

  // ---------- Employees view (company-scoped) ----------
  async function renderEmployeesView(){
    headerTitle.textContent = 'Şirket Çalışanları';
    const companyId = currentUser.claims?.companyId || currentUser.profile?.companyId;
    if(!companyId){
      content.innerHTML = `<div class="card"><div class="small">Çalışanları görebilmek için bir şirkete bağlı olmalısınız.</div></div>`;
      return;
    }
    try {
      const users = await listUsersByCompany(companyId);
      content.innerHTML = `<div class="card"><h3>Çalışanlar (${users.length})</h3><div style="display:flex;gap:8px;margin-bottom:10px"><button class="btn" id="btn-new-employee">+ Yeni Çalışan</button></div><div class="grid" id="employees-grid"></div></div>`;
      const grid = document.getElementById('employees-grid');
      users.forEach(u=>{
        const el = document.createElement('div'); el.className='card';
        el.innerHTML = `<strong>${escapeHtml(u.name||'—')}</strong><div class="small">${escapeHtml(u.email||'—')}</div><div class="small">Rol: ${escapeHtml(u.role||'—')}</div>`;
        grid.appendChild(el);
      });
      document.getElementById('btn-new-employee').addEventListener('click', ()=> openCreateEmployeeModal(companyId));
    } catch(err){
      console.error(err);
      content.innerHTML = `<div class="card"><div class="small">Çalışanlar yüklenemedi: ${err.message||err}</div></div>`;
    }
  }

  function openCreateEmployeeModal(companyId){
    // reuse employee modal from company detail
    openCreateCompanyUserModal(companyId);
  }

  // ---------- Audit view (basic) ----------
  // Replace or add this function in ui.js
async function renderAuditView(){
  headerTitle.textContent = 'Loglar';
  content.innerHTML = `
    <div class="card">
      <h3>Loglar</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <select id="audit-filter-action"><option value="">Tümü (Action)</option><option value="create_user">create_user</option><option value="create_project">create_project</option><option value="edit_project">edit_project</option><option value="create_company">create_company</option><option value="create_log">create_log</option></select>
        <input id="audit-filter-search" placeholder="Ara (email, kullanıcı, detay)"/>
        <input id="audit-filter-from" type="date"/>
        <input id="audit-filter-to" type="date"/>
        <button id="audit-filter-apply" class="btn">Filtrele</button>
        <button id="audit-filter-clear" class="btn-ghost">Temizle</button>
      </div>
      <div id="audit-list"><div class="small">Yükleniyor...</div></div>
      <div style="text-align:center;margin-top:8px"><button id="audit-loadmore" class="btn-ghost">Daha fazla</button></div>
    </div>
  `;

  const listEl = document.getElementById('audit-list');
  const btnApply = document.getElementById('audit-filter-apply');
  const btnClear = document.getElementById('audit-filter-clear');
  const btnLoadMore = document.getElementById('audit-loadmore');

  // paging state
  let lastVisible = null;
  const PAGE_SIZE = 20;

  async function loadLogs(reset=false){
    if(reset){
      listEl.innerHTML = '<div class="small">Yükleniyor...</div>';
      lastVisible = null;
    }
    try {
      const actionVal = document.getElementById('audit-filter-action').value;
      const searchVal = document.getElementById('audit-filter-search').value.trim().toLowerCase();
      const fromVal = document.getElementById('audit-filter-from').value;
      const toVal = document.getElementById('audit-filter-to').value;

      // build base query
      let q;
      const baseColl = collection(db,'audit_logs');

      if(currentUser.role === 'super_admin'){
        q = query(baseColl, orderBy('createdAt','desc'), limit(PAGE_SIZE));
      } else {
        const myCompany = currentUser.claims?.companyId || currentUser.profile?.companyId;
        q = query(baseColl, where('companyId','==', myCompany), orderBy('createdAt','desc'), limit(PAGE_SIZE));
      }
      if(lastVisible && !reset){
        q = query(baseColl, orderBy('createdAt','desc'), startAfter(lastVisible), limit(PAGE_SIZE));
      }

      // Note: Firestore composite filters (e.g. where + orderBy) may need indexes.
      const snap = await getDocs(q);
      if(snap.empty){
        if(reset) listEl.innerHTML = '<div class="small">Kayıt yok.</div>';
        else {
          btnLoadMore.style.display = 'none';
        }
        return;
      }
      if(reset) listEl.innerHTML = '';
      snap.docs.forEach(d=>{
        const data = d.data();
        // simple client-side filtering for action/date/search (keeps queries simple)
        if(actionVal && data.action !== actionVal) return;
        if(fromVal){
          const fromTs = new Date(fromVal).getTime();
          if(!data.createdAt || data.createdAt.toMillis() < fromTs) return;
        }
        if(toVal){
          const toTs = new Date(toVal).getTime() + 24*3600*1000 - 1;
          if(!data.createdAt || data.createdAt.toMillis() > toTs) return;
        }
        if(searchVal){
          const text = JSON.stringify(data).toLowerCase();
          if(!text.includes(searchVal)) return;
        }

        const time = data.createdAt ? new Date(data.createdAt.toMillis()).toLocaleString() : '-';
        const item = document.createElement('div'); item.className='card';
        item.innerHTML = `<div style="display:flex;justify-content:space-between"><div><strong>${escapeHtml(data.action || '—')}</strong> <span class="small">by ${escapeHtml(data.performedBy||'—')}</span></div><div class="small">${escapeHtml(time)}</div></div>
          <div class="small">${escapeHtml(JSON.stringify(data.detail || {}))}</div>`;
        listEl.appendChild(item);
      });

      lastVisible = snap.docs[snap.docs.length-1];
      btnLoadMore.style.display = snap.size < PAGE_SIZE ? 'none' : 'inline-block';

    } catch(err){
      console.error(err);
      listEl.innerHTML = `<div class="small">Loglar yüklenemedi: ${err.message||err}</div>`;
    }
  }

  btnApply.addEventListener('click', ()=> loadLogs(true));
  btnClear.addEventListener('click', ()=>{
    document.getElementById('audit-filter-action').value = '';
    document.getElementById('audit-filter-search').value = '';
    document.getElementById('audit-filter-from').value = '';
    document.getElementById('audit-filter-to').value = '';
    loadLogs(true);
  });
  btnLoadMore.addEventListener('click', ()=> loadLogs(false));

  // initial load
  await loadLogs(true);
}

}
