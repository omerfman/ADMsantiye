// app.js - ADM Project MVP
// Tüm veriler localStorage'ta tutulur (demo). İleride backend'e bağlanması kolay.
// Kullanım: index.html, css/style.css ile birlikte çalışır.
// NOT: logo: images/adm_logo.png

// helpers
const $ = q => document.querySelector(q);
const $$ = q => Array.from(document.querySelectorAll(q));
const uid = () => 'id_' + Math.random().toString(36).slice(2,9);
const now = () => new Date().toISOString();
const escapeHtml = s => (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// DB wrapper (localStorage)
const DB = {
  prefix: 'adm_v2_',
  key(name){ return this.prefix + name; },
  getAll(name){ try{ return JSON.parse(localStorage.getItem(this.key(name))) || []; }catch(e){return []} },
  saveAll(name, arr){ localStorage.setItem(this.key(name), JSON.stringify(arr)); },
  upsert(name, item){
    const arr = this.getAll(name);
    const ix = arr.findIndex(x=>x.id===item.id);
    if(ix>=0) arr[ix] = item; else arr.unshift(item);
    this.saveAll(name, arr);
  },
  remove(name, id){
    const arr = this.getAll(name).filter(x=>x.id!==id);
    this.saveAll(name, arr);
  }
};

// initial seed
(function seed(){
  if(!DB.getAll('projects').length){
    DB.saveAll('projects',[
      { id: uid(), name:'Beyoğlu Konut Projesi', location:'İstanbul - Beyoğlu', desc:'Merkezi konumlu lüks konut', createdAt:now() },
      { id: uid(), name:'Çamburnu Müzesi', location:'Çanakkale - Eceabat', desc:'Sahil müze ve sergi alanı', createdAt:now() }
    ]);
  }
})();
  
// state
let state = {
  view: 'projects', // projects, project-detail, logs, stocks, payments, new-project, backup
  currentProjectId: null
};

// UI elements
const navBtns = $$('.nav-btn');
const content = $('#content');
const headerTitle = $('#header-title');
const btnAdd = $('#btn-add');
const searchInput = $('#search');

// navigation
navBtns.forEach(b=>{
  b.addEventListener('click', ()=>{
    navBtns.forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const view = b.getAttribute('data-view');
    navigate(view);
  });
});
btnAdd.addEventListener('click', ()=> {
  if(state.view === 'projects') openProjectModal();
  else if(state.view === 'new-project') openProjectModal();
  else if(state.view === 'backup') exportAll();
  else if(state.view === 'project-detail') openProjectModal(); // edit project from detail
});

// search
searchInput.addEventListener('input', () => {
  if(state.view === 'projects') renderProjects();
});

// navigation function
function navigate(view, opts={}){
  state.view = view;
  state.currentProjectId = opts.projectId || state.currentProjectId;
  // set header title
  if(view === 'projects'){ headerTitle.textContent = 'Projeler'; btnAdd.textContent = '+ Yeni'; }
  else if(view === 'new-project'){ headerTitle.textContent = 'Yeni Proje'; btnAdd.textContent = 'Oluştur'; }
  else if(view === 'project-detail'){ 
    const p = DB.getAll('projects').find(x=>x.id===state.currentProjectId);
    headerTitle.textContent = p ? p.name : 'Proje';
    btnAdd.textContent = '+ Yeni';
  }
  else if(view === 'logs'){ headerTitle.textContent = 'Şantiye Günlüğü'; btnAdd.textContent = '+ Yeni'; }
  else if(view === 'stocks'){ headerTitle.textContent = 'Stok Durumu'; btnAdd.textContent = '+ Yeni'; }
  else if(view === 'payments'){ headerTitle.textContent = 'Hakediş'; btnAdd.textContent = '+ Yeni Satır'; }
  else if(view === 'backup'){ headerTitle.textContent = 'Yedek / Geri Yükle'; btnAdd.textContent = 'Export'; }
  // update active nav buttons visual
  $$('.nav-btn').forEach(n => n.classList.toggle('active', n.getAttribute('data-view')===view));
  // render
  render();
}

// render dispatcher
function render(){
  if(state.view === 'projects') return renderProjects();
  if(state.view === 'new-project') return renderNewProject();
  if(state.view === 'project-detail') return renderProjectDetail(state.currentProjectId);
  if(state.view === 'logs') return renderLogs(state.currentProjectId);
  if(state.view === 'stocks') return renderStocks(state.currentProjectId);
  if(state.view === 'payments') return renderPayments(state.currentProjectId);
  if(state.view === 'backup') return renderBackup();
  content.innerHTML = '<div class="card">Burası boş</div>';
}

// -------- Projects list + create + delete + open -----------
function renderProjects(){
  const q = (searchInput.value||'').toLowerCase();
  const projects = DB.getAll('projects').filter(p => p.name.toLowerCase().includes(q) || (p.location||'').toLowerCase().includes(q));
  let html = `<div class="card"><h2>Projeler</h2><div class="grid" id="projects-grid">`;
  projects.forEach(p=>{
    html += `<div class="card project-card">
      <h3>${escapeHtml(p.name)}</h3>
      <div class="small">${escapeHtml(p.location||'')}</div>
      <div class="small">${escapeHtml(p.desc||'')}</div>
      <div class="project-actions">
        <button class="btn open-project" data-id="${p.id}">Aç</button>
        <button class="btn-ghost edit-project" data-id="${p.id}">Düzenle</button>
        <button class="btn-ghost del-project" data-id="${p.id}">Sil</button>
      </div>
    </div>`;
  });
  html += `</div></div>`;
  content.innerHTML = html;

  // bind
  $$('.open-project').forEach(btn => btn.addEventListener('click', e => {
    const id = e.target.getAttribute('data-id');
    navigate('project-detail', { projectId: id });
  }));
  $$('.edit-project').forEach(btn => btn.addEventListener('click', e => {
    const id = e.target.getAttribute('data-id');
    openProjectModal(id);
  }));
  $$('.del-project').forEach(btn => btn.addEventListener('click', e => {
    const id = e.target.getAttribute('data-id');
    if(confirm('Projeyi silmek istediğine emin misin? Bu işlem projeye ait tüm verileri silmez, sadece projeyi siler.')) {
      DB.remove('projects', id);
      // optionally also remove child records
      // remove logs, stocks, payments linked to project
      ['field_logs','stocks','payments'].forEach(k=>{
        const arr = DB.getAll(k).filter(x=> x.projectId !== id);
        DB.saveAll(k, arr);
      });
      renderProjects();
    }
  }));
}

// new project form
function renderNewProject(){
  content.innerHTML = '';
  openProjectModal();
}
function openProjectModal(id){
  const isEdit = !!id;
  let project = isEdit ? DB.getAll('projects').find(p=>p.id===id) : { id: uid(), name:'', location:'', desc:'', createdAt: now() };
  const modal = createModal(`
    <div class="modal-inner">
      <h3>${isEdit?'Projeyi Düzenle':'Yeni Proje'}</h3>
      <div class="form-row"><label>Proje Adı</label><input id="p-name" type="text" value="${escapeHtml(project.name)}" /></div>
      <div class="form-row"><label>Lokasyon</label><input id="p-loc" type="text" value="${escapeHtml(project.location)}" /></div>
      <div class="form-row"><label>Açıklama</label><textarea id="p-desc">${escapeHtml(project.desc)}</textarea></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" id="save-project">${isEdit?'Kaydet':'Oluştur'}</button>
        <button class="btn-ghost" id="cancel-project">İptal</button>
      </div>
    </div>
  `);
  modal.querySelector('#cancel-project').addEventListener('click', closeModal);
  modal.querySelector('#save-project').addEventListener('click', ()=>{
    const name = modal.querySelector('#p-name').value.trim();
    if(!name){ alert('Proje adı gerekli'); return; }
    project.name = name;
    project.location = modal.querySelector('#p-loc').value.trim();
    project.desc = modal.querySelector('#p-desc').value.trim();
    project.updatedAt = now();
    DB.upsert('projects', project);
    closeModal();
    navigate('projects');
  });
}

// -------- Project detail (with buttons to subpages) -----------
function renderProjectDetail(projectId){
  const p = DB.getAll('projects').find(x=>x.id===projectId);
  if(!p) { navigate('projects'); return; }
  // header area with quick buttons
  let html = `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <h2>${escapeHtml(p.name)}</h2>
        <div class="small">${escapeHtml(p.location||'')}</div>
        <div class="small">${escapeHtml(p.desc||'')}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn" id="btn-back">Geri</button>
        <button class="btn-ghost" id="btn-edit-project">Projeyi Düzenle</button>
      </div>
    </div>
  </div>`;

  html += `<div class="grid">
    <div class="card">
      <h3>Hızlı Erişim</h3>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn" id="go-logs">Şantiye Günlüğü</button>
        <button class="btn" id="go-stocks">Stok Durumu</button>
        <button class="btn" id="go-payments">Hakediş</button>
      </div>
    </div>

    <div class="card">
      <h3>Son Kayıtlar</h3>
      <div id="recent-snippets"></div>
    </div>
  </div>`;
  content.innerHTML = html;

  // recent snippets: latest 3 field logs
  const recent = DB.getAll('field_logs').filter(l=> l.projectId === projectId).slice(0,3);
  const snEl = $('#recent-snippets');
  snEl.innerHTML = recent.length ? recent.map(r=>`<div class="card"><strong>${escapeHtml(r.description||'')}</strong><div class="small">${new Date(r.createdAt).toLocaleString()}</div>${r.photo?`<img class="preview" src="${r.photo}" />`:''}</div>`).join('') : '<div class="small">Henüz kayıt yok.</div>';

  // bind quick buttons
  $('#btn-back').addEventListener('click', ()=> navigate('projects'));
  $('#btn-edit-project').addEventListener('click', ()=> openProjectModal(projectId));
  $('#go-logs').addEventListener('click', ()=> { navigate('logs', { projectId }); });
  $('#go-stocks').addEventListener('click', ()=> { navigate('stocks', { projectId }); });
  $('#go-payments').addEventListener('click', ()=> { navigate('payments', { projectId }); });
}

// -------- Field logs (project-scoped) -----------
function renderLogs(projectId){
  const logs = DB.getAll('field_logs').filter(l=> l.projectId === projectId).sort((a,b)=> b.createdAt.localeCompare(a.createdAt));
  let html = `<div class="card"><h2>Şantiye Günlüğü</h2>`;
  html += `<div style="display:flex;gap:8px;margin-bottom:12px"><button class="btn" id="new-log">Yeni Kayıt</button><button class="btn-ghost" id="back-proj">Geri</button></div>`;
  html += `<div id="logs-list" class="grid">`;
  if(!logs.length) html += `<div class="small">Bu projeye ait kayıt bulunmuyor.</div>`;
  logs.forEach(l=>{
    html += `<div class="card"><strong>${escapeHtml(l.description||'(Açıklama yok)')}</strong><div class="small">${new Date(l.createdAt).toLocaleString()}</div>${l.photo?`<img class="preview" src="${l.photo}" />`:''}
      <div style="display:flex;gap:8px;margin-top:8px"><button class="btn-ghost view-log" data-id="${l.id}">Görüntüle</button><button class="btn-ghost del-log" data-id="${l.id}">Sil</button></div></div>`;
  });
  html += `</div></div>`;
  content.innerHTML = html;
  $('#back-proj').addEventListener('click', ()=> navigate('project-detail', { projectId }));
  $('#new-log').addEventListener('click', ()=> openLogModal(projectId));

  $$('.view-log').forEach(b => b.addEventListener('click', e => {
    const id = e.target.dataset.id;
    const log = DB.getAll('field_logs').find(x=>x.id===id);
    if(!log) return;
    createModal(`<div class="modal-inner"><h3>Detay</h3><div class="small">${new Date(log.createdAt).toLocaleString()}</div><p>${escapeHtml(log.description)}</p>${log.photo?`<img class="preview" src="${log.photo}" />`:''}<div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn" id="close-log">Kapat</button></div></div>`);
    $('#close-log').addEventListener('click', closeModal);
  }));

  $$('.del-log').forEach(b => b.addEventListener('click', e => {
    const id = e.target.dataset.id;
    if(confirm('Kaydı silmek istiyor musunuz?')){ DB.remove('field_logs', id); renderLogs(projectId); }
  }));
}

function openLogModal(projectId, logId){
  const isEdit = !!logId;
  const log = isEdit ? DB.getAll('field_logs').find(x=>x.id===logId) : { id: uid(), projectId, description:'', photo:null, createdAt: now() };
  const modalHtml = `<div class="modal-inner">
    <h3>${isEdit?'Kaydı Düzenle':'Yeni Şantiye Kaydı'}</h3>
    <div class="form-row"><label>Açıklama</label><textarea id="log-desc">${escapeHtml(log.description)}</textarea></div>
    <div class="form-row"><label>Fotoğraf (opsiyonel)</label><input id="log-photo" type="file" accept="image/*" /></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn" id="save-log">${isEdit?'Güncelle':'Kaydet'}</button>
      <button class="btn-ghost" id="cancel-log">İptal</button>
    </div>
  </div>`;
  const modal = createModal(modalHtml);
  modal.querySelector('#cancel-log').addEventListener('click', closeModal);
  modal.querySelector('#save-log').addEventListener('click', async ()=>{
    const desc = modal.querySelector('#log-desc').value.trim();
    const file = modal.querySelector('#log-photo').files[0];
    let dataUrl = log.photo || null;
    if(file){
      dataUrl = await fileToDataURL(file);
    }
    const newLog = { id: log.id, projectId, description: desc, photo: dataUrl, createdAt: now() };
    DB.upsert('field_logs', newLog);
    closeModal();
    renderLogs(projectId);
  });
}

// -------- Stocks (project-scoped) -----------
function renderStocks(projectId){
  const stocks = DB.getAll('stocks').filter(s=> s.projectId === projectId);
  let html = `<div class="card"><h2>Stok Durumu</h2><div style="display:flex;gap:8px;margin-bottom:12px"><button class="btn" id="new-stock">Yeni Malzeme</button><button class="btn-ghost" id="back-proj">Geri</button></div>`;
  html += `<table class="table"><thead><tr><th>Malzeme</th><th>Birim</th><th>Miktar</th><th>Min Seviye</th><th>Aktion</th></tr></thead><tbody>`;
  if(!stocks.length) html += `<tr><td class="small" colspan="5">Bu projeye ait stok yok.</td></tr>`;
  stocks.forEach(s=>{
    html += `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.unit||'')}</td><td>${s.qty}</td><td>${s.minLevel||0}</td>
      <td><button class="btn-ghost edit-stock" data-id="${s.id}">Düzenle</button> <button class="btn-ghost del-stock" data-id="${s.id}">Sil</button></td></tr>`;
  });
  html += `</tbody></table></div>`;
  content.innerHTML = html;
  $('#back-proj').addEventListener('click', ()=> navigate('project-detail', { projectId }));
  $('#new-stock').addEventListener('click', ()=> openStockModal(projectId));
  $$('.edit-stock').forEach(b=> b.addEventListener('click', e => openStockModal(projectId, e.target.dataset.id)));
  $$('.del-stock').forEach(b=> b.addEventListener('click', e => {
    if(confirm('Silinsin mi?')){ DB.remove('stocks', e.target.dataset.id); renderStocks(projectId); }
  }));
}

function openStockModal(projectId, stockId){
  const isEdit = !!stockId;
  const stock = isEdit ? DB.getAll('stocks').find(s=>s.id===stockId) : { id:uid(), projectId, name:'', unit:'', qty:0, minLevel:0, createdAt: now() };
  const modal = createModal(`<div class="modal-inner">
    <h3>${isEdit?'Stok Düzenle':'Yeni Malzeme'}</h3>
    <div class="form-row"><label>Malzeme Adı</label><input id="stk-name" value="${escapeHtml(stock.name)}" /></div>
    <div class="form-row"><label>Birim</label><input id="stk-unit" value="${escapeHtml(stock.unit)}" /></div>
    <div class="form-row"><label>Miktar</label><input id="stk-qty" type="number" value="${stock.qty}" /></div>
    <div class="form-row"><label>Min Seviye</label><input id="stk-min" type="number" value="${stock.minLevel||0}" /></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="save-stock">Kaydet</button><button class="btn-ghost" id="cancel-stock">İptal</button></div>
  </div>`);
  modal.querySelector('#cancel-stock').addEventListener('click', closeModal);
  modal.querySelector('#save-stock').addEventListener('click', ()=>{
    stock.name = modal.querySelector('#stk-name').value.trim();
    stock.unit = modal.querySelector('#stk-unit').value.trim();
    stock.qty = Number(modal.querySelector('#stk-qty').value) || 0;
    stock.minLevel = Number(modal.querySelector('#stk-min').value) || 0;
    DB.upsert('stocks', stock);
    closeModal();
    renderStocks(projectId);
  });
}

// -------- Payments (Hakediş) project-scoped -----------
function renderPayments(projectId){
  const payments = DB.getAll('payments').filter(p=> p.projectId === projectId);
  let html = `<div class="card"><h2>Hakediş</h2><div style="display:flex;gap:8px;margin-bottom:12px"><button class="btn" id="new-payment">Yeni Satır Ekle</button><button class="btn-ghost" id="back-proj">Geri</button></div>`;
  html += `<table class="table"><thead><tr><th>İş</th><th>Ürün</th><th>Birim</th><th>Miktar</th><th>Birim Fiyat</th><th>Toplam</th><th>İşlemler</th></tr></thead><tbody>`;
  if(!payments.length) html += `<tr><td class="small" colspan="7">Henüz hakediş satırı yok.</td></tr>`;
  payments.forEach(row=>{
    const total = (Number(row.qty) || 0) * (Number(row.unitPrice) || 0);
    html += `<tr>
      <td>${escapeHtml(row.work||'')}</td>
      <td>${escapeHtml(row.item||'')}</td>
      <td>${escapeHtml(row.unit||'')}</td>
      <td>${row.qty}</td>
      <td>${row.unitPrice}</td>
      <td>${total.toFixed(2)}</td>
      <td><button class="btn-ghost edit-pay" data-id="${row.id}">Düzenle</button> <button class="btn-ghost del-pay" data-id="${row.id}">Sil</button></td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  content.innerHTML = html;
  $('#new-payment').addEventListener('click', ()=> openPaymentModal(projectId));
  $('#back-proj').addEventListener('click', ()=> navigate('project-detail', { projectId }));
  $$('.edit-pay').forEach(b=> b.addEventListener('click', e=> openPaymentModal(projectId, e.target.dataset.id)));
  $$('.del-pay').forEach(b=> b.addEventListener('click', e=> { if(confirm('Silinsin mi?')){ DB.remove('payments', e.target.dataset.id); renderPayments(projectId); } }));
}

function openPaymentModal(projectId, paymentId){
  const isEdit = !!paymentId;
  const row = isEdit ? DB.getAll('payments').find(x=>x.id===paymentId) : { id:uid(), projectId, work:'', item:'', unit:'', qty:0, unitPrice:0, createdAt: now() };
  const modal = createModal(`<div class="modal-inner">
    <h3>${isEdit?'Hakediş Satırını Düzenle':'Yeni Hakediş Satırı'}</h3>
    <div class="form-row"><label>Yapılan İş</label><input id="pay-work" value="${escapeHtml(row.work)}" /></div>
    <div class="form-row"><label>Ürün</label><input id="pay-item" value="${escapeHtml(row.item)}" /></div>
    <div class="form-row"><label>Birim</label><input id="pay-unit" value="${escapeHtml(row.unit)}" /></div>
    <div class="form-row"><label>Miktar</label><input id="pay-qty" type="number" value="${row.qty}" /></div>
    <div class="form-row"><label>Birim Fiyat</label><input id="pay-price" type="number" step="0.01" value="${row.unitPrice}" /></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="save-pay">Kaydet</button><button class="btn-ghost" id="cancel-pay">İptal</button></div>
  </div>`);
  modal.querySelector('#cancel-pay').addEventListener('click', closeModal);
  modal.querySelector('#save-pay').addEventListener('click', ()=>{
    row.work = modal.querySelector('#pay-work').value.trim();
    row.item = modal.querySelector('#pay-item').value.trim();
    row.unit = modal.querySelector('#pay-unit').value.trim();
    row.qty = Number(modal.querySelector('#pay-qty').value) || 0;
    row.unitPrice = parseFloat(modal.querySelector('#pay-price').value) || 0;
    DB.upsert('payments', row);
    closeModal();
    renderPayments(projectId);
  });
}

// -------- Backup / Export / Import -----------
function renderBackup(){
  const payload = {
    projects: DB.getAll('projects'),
    field_logs: DB.getAll('field_logs'),
    stocks: DB.getAll('stocks'),
    payments: DB.getAll('payments')
  };
  content.innerHTML = `<div class="card"><h2>Yedek / Geri Yükle</h2>
    <p class="small">Verileri JSON olarak export ve import edebilirsiniz.</p>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn" id="export-json">Export JSON</button>
      <input id="import-file" type="file" accept=".json" />
      <button class="btn-ghost" id="import-json">Import</button>
      <button class="btn-ghost" id="reset-all">Tüm Verileri Sıfırla</button>
    </div>
    <div class="small" style="margin-top:12px">Export içerisinde fotoğraflar dataURL şeklinde bulunur.</div>
  </div>`;
  $('#export-json').addEventListener('click', exportAll);
  $('#import-json').addEventListener('click', importAll);
  $('#reset-all').addEventListener('click', ()=> {
    if(confirm('Tüm veriler silinecek, emin misiniz?')){ localStorage.clear(); location.reload(); }
  });
}
function exportAll(){
  const payload = { projects: DB.getAll('projects'), field_logs: DB.getAll('field_logs'), stocks: DB.getAll('stocks'), payments: DB.getAll('payments') };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'adm_backup.json'; a.click();
  URL.revokeObjectURL(url);
}
function importAll(){
  const f = $('#import-file').files[0];
  if(!f) return alert('JSON dosyası seçin');
  const r = new FileReader();
  r.onload = ()=> {
    try {
      const obj = JSON.parse(r.result);
      if(obj.projects) DB.saveAll('projects', obj.projects);
      if(obj.field_logs) DB.saveAll('field_logs', obj.field_logs);
      if(obj.stocks) DB.saveAll('stocks', obj.stocks);
      if(obj.payments) DB.saveAll('payments', obj.payments);
      alert('Import tamamlandı');
      navigate('projects');
    } catch(e){ alert('Geçersiz JSON dosyası'); }
  };
  r.readAsText(f);
}

// -------- Modal helpers & utilities -----------
const modalRoot = document.getElementById('modal-root');
function createModal(innerHtml){
  modalRoot.innerHTML = `<div class="modal">${innerHtml}</div>`;
  return modalRoot.querySelector('.modal');
}
function closeModal(){ modalRoot.innerHTML = ''; }
function fileToDataURL(file){ return new Promise((res, rej)=>{ const r = new FileReader(); r.onload = ()=> res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }

// start
navigate('projects');
