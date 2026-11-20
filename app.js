'use strict';
/* Surau Al-Nur SMK Taman Medan — PWA Eviden Imarah 2026 */

const MAXD = 1600;           // sisi terpanjang gambar (px)
const JPEG_Q = 0.84;
const cfg = window.APP_CONFIG || {};

/* ---------- util ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('sia_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sia_' + k, JSON.stringify(v)); } catch { } },
  del(k) { try { localStorage.removeItem('sia_' + k); } catch { } }
};
const pad = n => String(n).padStart(2, '0');
const fmtDT = ts => { const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtStamp = ts => { const d = new Date(ts); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; };
const fmtSize = b => !b ? '' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
let toastT;
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }

/* ---------- keadaan ---------- */
const S = {
  url: store.get('url', '') || cfg.APPS_SCRIPT_URL || '',
  pin: store.get('pin', '') || cfg.APPS_SCRIPT_PIN || '',
  wm: store.get('wm', true)
};
let root, idx = new Map(), parentOf = new Map(), live = false, loading = false;
const configured = () => !!(S.url && S.pin);

const NATURAL = new Intl.Collator('ms', { numeric: true, sensitivity: 'base' });
const rank = n => /^sokongan/i.test(n.name) ? 1 : 0;
function sortTree(n) {
  if (!n.children) return;
  n.children.sort((a, b) => (b.folder - a.folder) || (rank(a) - rank(b)) || NATURAL.compare(a.name, b.name));
  n.children.forEach(sortTree);
}
function setTree(t, isLive) {
  root = t; sortTree(root);
  idx = new Map(); parentOf = new Map();
  (function walk(n, p) { idx.set(n.id, n); parentOf.set(n.id, p); (n.children || []).forEach(c => walk(c, n)); })(root, null);
  live = isLive;
}
const cached = store.get('tree', null);
setTree(cached || JSON.parse(JSON.stringify(window.SNAPSHOT)), !!cached);

const kids = n => n.children || [];
const filesOf = n => kids(n).filter(k => !k.folder);
const countFiles = n => kids(n).reduce((a, k) => a + (k.folder ? countFiles(k) : 1), 0);
function leaves(n, out = []) {
  const fs = kids(n).filter(k => k.folder);
  if (!fs.length && n !== root) out.push(n);
  fs.forEach(f => leaves(f, out));
  return out;
}
const codeOf = n => (n.name.match(/^([A-Z]\d+|\d+\.\d+)\b/) || [])[1] || n.name.replace(/\s+/g, '').slice(0, 10);
function pathOf(n) { const p = []; for (let c = n; c && c !== root; c = parentOf.get(c.id)) p.unshift(c.name); return p; }
const bahagian = () => kids(root).filter(k => k.folder && /^BAHAGIAN/i.test(k.name));
const topOf = n => { let c = n; while (c && parentOf.get(c.id) && parentOf.get(c.id) !== root) c = parentOf.get(c.id); return c; };

/* ---------- ikon fail ---------- */
function ficon(n) {
  if (n.folder) return `<div class="fi fo"><svg viewBox="0 0 24 24"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></div>`;
  const m = n.mime || '';
  if (/^image\//.test(m)) return n.thumb ? `<div class="fi img" style="background-image:url('${esc(n.thumb)}')"></div>` : `<div class="fi img">IMG</div>`;
  if (/document|msword|wordprocessing/.test(m)) return `<div class="fi doc">DOC</div>`;
  if (/spreadsheet|excel/.test(m)) return `<div class="fi xls">XLS</div>`;
  if (/presentation|powerpoint/.test(m)) return `<div class="fi ppt">PPT</div>`;
  if (/pdf/.test(m)) return `<div class="fi pdf">PDF</div>`;
  if (/^video\//.test(m)) return `<div class="fi img">VID</div>`;
  return `<div class="fi oth">FAIL</div>`;
}
const chevron = `<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>`;
const camSvg = `<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="14" r="3.5"/></svg>`;

/* ---------- API Apps Script ---------- */
async function api(body) {
  if (!configured()) throw new Error('Belum disambungkan ke Drive');
  const r = await fetch(S.url, {
    method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, key: S.pin })
  });
  let j;
  try { j = await r.json(); } catch { throw new Error('Jawapan tidak sah daripada Apps Script (semak URL & deploy "Anyone")'); }
  if (!j.ok) throw new Error(j.error || 'Ralat tidak diketahui');
  return j;
}
const isNet = e => e instanceof TypeError || !navigator.onLine;

async function refreshTree(silent) {
  if (!configured()) { if (!silent) { toast('Sambung ke Drive di Tetapan dahulu'); } return false; }
  if (loading) return false;
  loading = true; $('#btnRefresh').classList.add('spin');
  try {
    const j = await api({ action: 'tree' });
    setTree(j.tree, true); store.set('tree', j.tree); store.set('treeAt', Date.now());
    if (!silent) toast('Data dikemas kini daripada Drive');
    rerenderSoft();
    return true;
  } catch (e) {
    if (!silent) toast(isNet(e) ? 'Tiada sambungan internet' : e.message, 3600);
    return false;
  } finally { loading = false; $('#btnRefresh').classList.remove('spin'); }
}

/* ---------- penghala ---------- */
const view = $('#view');
function setTab(t) { document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === t)); }
function route() {
  const [, a, b] = (location.hash.slice(1) || '/').split('/');
  closeFab();
  if (a === 'f') viewFiles(b === 'root' || !b ? root.id : b);
  else if (a === 'cam') viewCam(b);
  else if (a === 'set') viewSet();
  else viewHome();
  window.scrollTo(0, 0);
}
function rerenderSoft() {
  if (!$('#camov').hidden || (uploading)) return;
  const q = $('#q'); const keep = q ? q.value : null;
  route(); if (keep) { const nq = $('#q'); if (nq) { nq.value = keep; nq.dispatchEvent(new Event('input')); } }
}
function closeFab() { document.querySelectorAll('.fab').forEach(f => f.remove()); }
addEventListener('hashchange', route);

/* ---------- paparan: Utama ---------- */
function viewHome() {
  setTab('home');
  const bs = bahagian();
  const docs = [];
  (function w(n) { kids(n).forEach(k => k.folder ? w(k) : (/^image\//.test(k.mime || '') ? 0 : docs.push(k))); })(root);
  const at = store.get('treeAt', 0);
  let h = `<section class="hero"><h1>Penilaian Surau Imarah 2026</h1><p>Surau Al-Nur · SMK Taman Medan</p>
    ${live ? `<span class="chip live"><i></i>Tersambung ke Drive${at ? ' · ' + fmtDT(at) : ''}</span>`
      : `<span class="chip snap"><i></i>Data simpanan · belum tersambung</span>`}</section>`;
  if (!live) h += `<div class="note warn">Struktur folder dipaparkan daripada salinan tersimpan. Untuk status eviden terkini dan muat naik gambar, <a href="#/set">sambungkan ke Drive di Tetapan</a>.</div>`;

  h += `<div class="row" style="margin-bottom:6px"><a class="btn gold" href="#/cam">${camSvg.replace('<svg', '<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"')} Ambil gambar eviden</a>
    <a class="btn sec" href="#/f/root">Semua fail</a></div>`;

  h += `<h2>Status eviden</h2>`;
  for (const b of bs) {
    const [h1, h2] = b.name.split(':').map(s => s.trim());
    const ls = leaves(b); const filled = ls.filter(l => filesOf(l).length).length;
    const pct = ls.length ? Math.round(filled / ls.length * 100) : 0;
    h += `<div class="card bah"><a class="bah-h" href="#/f/${b.id}"><div class="bah-k">${esc(h1.slice(-1))}</div>
      <div class="bah-t"><b>${esc(h1)}</b><span class="sm mut">${esc(h2 || '')}</span>
      ${live ? `<div class="bar"><i style="width:${pct}%"></i></div><span class="xs mut">${filled} / ${ls.length} kriteria ada eviden</span>` : ''}</div>${chevron}</a>
      <details class="bah-d"><summary>Senarai kriteria (${ls.length})</summary>
      ${ls.map(l => {
        const n = filesOf(l).length, par = parentOf.get(l.id);
        const nm = par && par !== b ? `${codeOf(par)} › ${l.name}` : l.name;
        return `<div class="lf"><a class="nm" href="#/f/${l.id}">${esc(nm)}</a>
          ${live ? (n ? `<span class="pill ok">${n} fail</span>` : `<span class="pill no">Kosong</span>`) : ''}
          <a class="mini" href="#/cam/${l.id}" aria-label="Tambah eviden">${camSvg}</a></div>`;
      }).join('')}</details></div>`;
  }

  h += `<h2>Dokumen utama</h2><div class="list">${docs.length ? docs.map(d => `
    <a class="it" href="${esc(d.url)}" target="_blank" rel="noopener">${ficon(d)}
    <div class="t"><b>${esc(d.name)}</b><small>${esc(pathOf(parentOf.get(d.id)).join(' › ') || 'Folder utama')}</small></div>${chevron}</a>`).join('')
      : '<div class="empty">Tiada dokumen.</div>'}</div>
    <p style="margin:16px 0"><a class="btn sec block" href="${esc(root.url)}" target="_blank" rel="noopener">Buka folder utama di Google Drive</a></p>`;
  view.innerHTML = h;
}

/* ---------- paparan: Fail ---------- */
function viewFiles(id) {
  setTab('files');
  const node = idx.get(id) && idx.get(id).folder ? idx.get(id) : root;
  const trail = []; for (let c = node; c; c = parentOf.get(c.id)) trail.unshift(c);
  const crumbs = trail.map((c, i) => i === trail.length - 1 ? `<b>${esc(c === root ? 'Semua fail' : c.name)}</b>`
    : `<a href="#/f/${c === root ? 'root' : c.id}">${esc(c === root ? 'Semua fail' : c.name.split(':')[0].trim())}</a>`).join('<span>›</span>');
  view.innerHTML = `<div class="crumbs">${crumbs}</div>
    <div class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
    <input id="q" class="in" type="search" placeholder="Cari fail atau folder…" autocomplete="off"></div>
    <div class="tools">
      ${live ? `<button class="btn sec" id="btnMk">+ Folder baharu</button>` : ''}
      <a class="btn sec" href="${esc(node.url)}" target="_blank" rel="noopener">Buka di Drive</a></div>
    <div id="list"></div>`;
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase(); const box = $('#list');
    let rows;
    if (q) {
      rows = []; idx.forEach(n => { if (n !== root && n.name.toLowerCase().includes(q)) rows.push(n); });
      rows.sort((a, b) => (b.folder - a.folder) || NATURAL.compare(a.name, b.name));
    } else rows = kids(node);
    if (!rows.length) { box.innerHTML = `<div class="list"><div class="empty">${q ? 'Tiada padanan.' : 'Folder ini masih kosong.'}${live && !q && node !== root ? '<br><a href="#/cam/' + node.id + '" style="color:var(--g700);font-weight:700">Tambah gambar eviden</a>' : ''}</div></div>`; return; }
    box.innerHTML = `<div class="list">${rows.map(n => {
      const href = n.folder ? `#/f/${n.id}` : esc(n.url), tgt = n.folder ? '' : ' target="_blank" rel="noopener"';
      const sub = q ? pathOf(parentOf.get(n.id)).join(' › ') || 'Folder utama' :
        (n.folder ? (live ? '' : '') : [n.modified ? fmtDT(n.modified) : '', fmtSize(n.size)].filter(Boolean).join(' · '));
      const c = n.folder && live ? countFiles(n) : 0;
      return `<a class="it" href="${href}"${tgt}>${ficon(n)}<div class="t"><b>${esc(n.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>
        ${n.folder && live ? `<span class="cnt">${c}</span>` : ''}${chevron}</a>`;
    }).join('')}</div>`;
  };
  $('#q').addEventListener('input', draw); draw();
  const mk = $('#btnMk');
  if (mk) mk.onclick = async () => {
    const name = prompt('Nama folder baharu di dalam "' + node.name + '":'); if (!name || !name.trim()) return;
    try { await api({ action: 'mkdir', parentId: node.id, name: name.trim() }); toast('Folder dicipta'); await refreshTree(true); } catch (e) { toast(e.message, 3500); }
  };
  if (node !== root) {
    const f = document.createElement('a'); f.className = 'fab'; f.href = '#/cam/' + node.id;
    f.innerHTML = camSvg + 'Tambah eviden'; document.body.appendChild(f);
  }
}

/* ---------- paparan: Kamera / muat naik ---------- */
const camState = { folder: '', caption: '' };
let batch = [], seq = 0, uploading = false, lastMsg = null, camStream = null, facing = 'environment';

function folderOptions() {
  let h = '<option value="">— Pilih kriteria / folder —</option>';
  for (const b of bahagian()) {
    const ls = leaves(b);
    h += `<optgroup label="${esc(b.name.split(':')[0].trim() + ' · ' + (b.name.split(':')[1] || '').trim())}">` +
      ls.map(l => { const par = parentOf.get(l.id); const nm = par && par !== b ? `${codeOf(par)} › ${l.name}` : l.name;
        return `<option value="${l.id}"${camState.folder === l.id ? ' selected' : ''}>${esc(nm)}</option>`; }).join('') + '</optgroup>';
  }
  const others = leaves(root).filter(l => !bahagian().includes(topOf(l)));
  if (others.length) h += `<optgroup label="Lain-lain">${others.map(l => `<option value="${l.id}"${camState.folder === l.id ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</optgroup>`;
  return h;
}

async function viewCam(fid) {
  setTab('cam');
  if (fid && idx.get(fid)) {
    let t = idx.get(fid);
    if (kids(t).some(k => k.folder)) t = leaves(t)[0] || t;   // folder induk → pilih anak pertama
    camState.folder = t.id;
  }
  const q = await qAll().catch(() => []);
  view.innerHTML = `
    <div class="card">
      <h3>Ambil &amp; muat naik eviden</h3>
      <p class="sm mut" style="margin:4px 0 0">Pilih kriteria, ambil gambar menggunakan kamera, kemudian muat naik terus ke folder Drive.</p>
      ${!configured() ? `<div class="note warn">Belum tersambung ke Drive. <a href="#/set">Buka Tetapan</a> untuk memasukkan URL Apps Script dan PIN.</div>` : ''}
      ${q.length ? `<div class="note warn" id="qnote">⏳ ${q.length} gambar menunggu muat naik (tiada internet semasa dihantar). <a href="#" id="qgo">Cuba hantar sekarang</a></div>` : ''}
      <label class="f" for="selF">Kriteria / folder tujuan</label>
      <select id="selF" class="in">${folderOptions()}</select>
      <label class="f" for="cap">Keterangan gambar (pilihan)</label>
      <input id="cap" class="in" maxlength="80" placeholder="cth: Tempat wuduk selepas gotong-royong" value="${esc(camState.caption)}">
      <div class="sw"><div><b class="sm">Cop tarikh &amp; masa pada gambar</b><div class="xs mut">Dicetak di bahagian bawah gambar sebagai bukti</div></div>
        <input type="checkbox" id="wm" ${S.wm ? 'checked' : ''} aria-label="Cop tarikh dan masa"></div>
      <div class="row" style="margin-top:6px">
        <button class="btn" id="btnCam">${camSvg.replace('<svg', '<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"')} Buka kamera</button>
        <button class="btn sec" id="btnGal">Pilih dari galeri</button>
      </div>
    </div>
    <div id="batch"></div>`;
  $('#selF').onchange = e => camState.folder = e.target.value;
  $('#cap').oninput = e => camState.caption = e.target.value;
  $('#wm').onchange = e => { S.wm = e.target.checked; store.set('wm', S.wm); };
  $('#btnCam').onclick = openCam;
  $('#btnGal').onclick = () => $('#fileGal').click();
  const qg = $('#qgo'); if (qg) qg.onclick = async e => { e.preventDefault(); await flushQueue(true); route(); };
  paintBatch();
}

function paintBatch() {
  const box = $('#batch'); if (!box) return;
  const pend = batch.filter(p => !p.done);
  let h = '';
  if (lastMsg) h += `<div class="note ${lastMsg.cls}">${lastMsg.html}</div>`;
  if (batch.length) {
    h += `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h3>${batch.length} gambar sedia</h3>
      ${uploading ? '' : '<button class="btn sec" id="btnClr" style="padding:6px 12px;min-height:34px;font-size:.82rem">Kosongkan</button>'}</div>
      <div class="grid">${batch.map(p => `<div class="ph">${p.pdf ? '<div class="pdf">PDF</div>' : `<img src="${p.prev}" alt="">`}
        ${p.status === 'up' ? '<div class="st">Menghantar…</div>' : p.status === 'ok' ? '<div class="st ok">✓</div>' : p.status === 'queued' ? '<div class="st q">Dalam giliran</div>' : p.status === 'err' ? `<div class="st err">Gagal</div>` : ''}
        ${uploading ? '' : `<button class="x" data-rm="${p.id}" aria-label="Buang">×</button>`}</div>`).join('')}</div>
      ${batch.some(p => p.status === 'err') ? `<div class="note bad">${esc(batch.find(p => p.status === 'err').err || 'Ralat')}</div>` : ''}
      <div class="prog" ${uploading ? '' : 'hidden'}><i id="pbar"></i></div>
      <button class="btn gold block" id="btnUp" ${uploading || !pend.length ? 'disabled' : ''}>${uploading ? 'Sedang memuat naik…' : `Muat naik ${pend.length} gambar`}</button></div>`;
  }
  box.innerHTML = h;
  const c = $('#btnClr'); if (c) c.onclick = () => { batch.forEach(p => URL.revokeObjectURL(p.prev)); batch = []; lastMsg = null; paintBatch(); };
  box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const i = batch.findIndex(p => p.id == b.dataset.rm); if (i > -1) { URL.revokeObjectURL(batch[i].prev); batch.splice(i, 1); paintBatch(); } });
  const u = $('#btnUp'); if (u) u.onclick = uploadBatch;
}

/* ---- pemprosesan gambar ---- */
function loadImg(file) {
  return new Promise((res, rej) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => { res(i); }; i.onerror = rej; i.src = u; });
}
function toBlob(src, w, h, q = JPEG_Q, drawExtra) {
  const sc = Math.min(1, MAXD / Math.max(w, h)), cw = Math.round(w * sc), ch = Math.round(h * sc);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const x = c.getContext('2d'); x.drawImage(src, 0, 0, cw, ch);
  if (drawExtra) drawExtra(x, cw, ch);
  return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', q));
}
async function resizeFile(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await loadImg(file); }
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
  const b = await toBlob(bmp, w, h);
  if (bmp.close) bmp.close();
  return b;
}
function stamp(x, w, h, text) {
  let fs = Math.max(13, Math.round(w / 34));
  x.font = `600 ${fs}px system-ui,sans-serif`;
  while (x.measureText(text).width > w - fs * 1.4 && fs > 9) { fs--; x.font = `600 ${fs}px system-ui,sans-serif`; }
  const bh = Math.round(fs * 2.2);
  x.fillStyle = 'rgba(0,0,0,.58)'; x.fillRect(0, h - bh, w, bh);
  x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.fillText(text, Math.round(fs * .7), h - bh / 2);
}
async function stampBlob(blob, text) {
  const bmp = await createImageBitmap(blob);
  const out = await toBlob(bmp, bmp.width, bmp.height, 0.86, (x, w, h) => stamp(x, w, h, text));
  bmp.close && bmp.close(); return out;
}
async function addFiles(files, source) {
  lastMsg = null;
  for (const f of files) {
    try {
      if (/pdf/.test(f.type)) { batch.push({ id: ++seq, blob: f, pdf: true, ts: f.lastModified || Date.now(), prev: '' }); continue; }
      const b = await resizeFile(f);
      batch.push({ id: ++seq, blob: b, ts: source === 'cam' ? Date.now() : (f.lastModified || Date.now()), prev: URL.createObjectURL(b) });
    } catch (e) { toast('Gambar tidak dapat diproses: ' + (f.name || '')); }
  }
  paintBatch();
}
$('#fileCam').onchange = async e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) { await addFiles(fs, 'cam'); toast('Gambar ditambah'); } };
$('#fileGal').onchange = async e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) { await addFiles(fs, 'gal'); } };

/* ---- kamera langsung ---- */
async function openCam() {
  if (!camState.folder) { toast('Pilih kriteria / folder dahulu'); $('#selF').focus(); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('#fileCam').click(); return; }
  try { await startStream(); }
  catch (e) { toast('Kamera tidak boleh dibuka — menggunakan kamera telefon'); $('#fileCam').click(); return; }
  const f = idx.get(camState.folder);
  $('#camLbl').textContent = f ? (parentOf.get(f.id) !== topOf(f) && parentOf.get(f.id) !== root ? codeOf(parentOf.get(f.id)) + ' › ' : '') + f.name : '';
  $('#camov').hidden = false; document.body.style.overflow = 'hidden'; camCount();
}
async function startStream() {
  stopStream();
  camStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
  const v = $('#vid'); v.srcObject = camStream; await v.play().catch(() => { });
}
function stopStream() { if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; } const v = $('#vid'); if (v) v.srcObject = null; }
function closeCam() { stopStream(); $('#camov').hidden = true; document.body.style.overflow = ''; paintBatch(); }
const camCount = () => { $('#camCnt').textContent = batch.filter(p => !p.done).length + ' gambar'; };
$('#camClose').onclick = closeCam; $('#camDone').onclick = closeCam;
$('#camFlip').onclick = async () => { facing = facing === 'environment' ? 'user' : 'environment'; try { await startStream(); } catch { toast('Tidak dapat menukar kamera'); } };
$('#shutter').onclick = async () => {
  const v = $('#vid'); if (!v.videoWidth) return;
  const fl = $('#flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
  if (navigator.vibrate) navigator.vibrate(30);
  const b = await toBlob(v, v.videoWidth, v.videoHeight);
  lastMsg = null; batch.push({ id: ++seq, blob: b, ts: Date.now(), prev: URL.createObjectURL(b) }); camCount();
};

/* ---- muat naik ---- */
const slug = s => String(s || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40);
const toB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
const send = rec => toB64(rec.blob).then(data => api({ action: 'upload', folderId: rec.folderId, name: rec.name, mime: rec.blob.type || 'image/jpeg', data, note: rec.note }));

async function uploadBatch() {
  if (!configured()) { toast('Sambung ke Drive di Tetapan dahulu'); location.hash = '#/set'; return; }
  const f = idx.get(camState.folder); if (!f) { toast('Pilih kriteria / folder dahulu'); return; }
  const items = batch.filter(p => !p.done); if (!items.length) return;
  uploading = true; lastMsg = null; paintBatch();
  const code = codeOf(f).replace(/[^\w.-]/g, ''), cap = slug(camState.caption);
  let ok = 0, queued = 0, failed = 0, n = 0;
  for (const p of items) {
    p.status = 'up'; p.err = ''; paintBatch(); const bar = $('#pbar'); if (bar) bar.style.width = (n / items.length * 100) + '%';
    try {
      let blob = p.blob;
      if (!p.pdf && S.wm) blob = await stampBlob(p.blob, `${fmtDT(p.ts)} • ${f.name} • Surau Al-Nur SMK Taman Medan`);
      const rec = { id: 'q' + Date.now() + '_' + p.id, folderId: f.id, folderName: f.name, blob, note: camState.caption,
        name: `${code}_${fmtStamp(p.ts)}_${p.id}${cap ? '_' + cap : ''}${p.pdf ? '.pdf' : '.jpg'}` };
      try { await send(rec); p.status = 'ok'; p.done = true; ok++; }
      catch (e) {
        if (isNet(e)) { await qPut(rec); p.status = 'queued'; p.done = true; queued++; }
        else throw e;
      }
    } catch (e) { p.status = 'err'; p.err = e.message; failed++; }
    n++;
  }
  uploading = false;
  const bits = [];
  if (ok) bits.push(`✓ ${ok} gambar dimuat naik ke <b>${esc(f.name)}</b>. <a href="#/f/${f.id}">Lihat folder</a>`);
  if (queued) bits.push(`⏳ ${queued} gambar disimpan dalam giliran dan akan dihantar apabila ada internet.`);
  if (failed) bits.push(`${failed} gambar gagal — tekan Muat naik untuk cuba semula.`);
  lastMsg = { cls: failed ? 'bad' : queued ? 'warn' : 'good', html: bits.join('<br>') };
  batch = batch.filter(p => { if (p.done) { URL.revokeObjectURL(p.prev); } return !p.done; });
  paintBatch();
  if (ok) refreshTree(true);
}

/* ---- giliran luar talian (IndexedDB) ---- */
const DB = () => new Promise((res, rej) => { const r = indexedDB.open('surau-q', 1); r.onupgradeneeded = () => r.result.createObjectStore('q', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = async (mode, fn) => { const d = await DB(); return new Promise((res, rej) => { const t = d.transaction('q', mode); const out = fn(t.objectStore('q')); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }); };
const qPut = rec => tx('readwrite', s => s.put(rec));
const qDel = id => tx('readwrite', s => s.delete(id));
const qAll = () => tx('readonly', s => s.getAll()).then(r => r || []);
let flushing = false;
async function flushQueue(manual) {
  if (flushing || !configured()) return;
  flushing = true; let sent = 0;
  try {
    for (const rec of await qAll()) {
      try { await send(rec); await qDel(rec.id); sent++; }
      catch (e) { if (isNet(e)) break; if (manual) toast(e.message, 3500); break; }
    }
  } finally { flushing = false; }
  if (sent) { toast(`${sent} gambar dalam giliran berjaya dihantar`); refreshTree(true); }
  else if (manual) toast('Tiada yang dapat dihantar sekarang');
}

/* ---------- paparan: Tetapan ---------- */
function viewSet() {
  setTab('set');
  view.innerHTML = `
    <div class="card"><h3>Sambungan ke Google Drive</h3>
      <p class="sm mut" style="margin:4px 0 0">Diperlukan untuk status eviden terkini, muat naik gambar dan folder baharu. Folder anda kekal peribadi.</p>
      <label class="f" for="iUrl">URL Apps Script (berakhir dengan <code>/exec</code>)</label>
      <input id="iUrl" class="in" inputmode="url" autocapitalize="off" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(S.url)}">
      <label class="f" for="iPin">PIN</label>
      <input id="iPin" class="in" type="password" autocomplete="off" placeholder="PIN yang ditetapkan dalam Code.gs" value="${esc(S.pin)}">
      <div class="row" style="margin-top:16px"><button class="btn" id="bSave">Simpan &amp; uji</button><button class="btn sec" id="bSync">Segarkan data</button></div>
      <div id="setMsg"></div>
    </div>
    `;
  const msg = (cls, t) => $('#setMsg').innerHTML = `<div class="note ${cls}">${t}</div>`;
  $('#bSave').onclick = async () => {
    S.url = $('#iUrl').value.trim(); S.pin = $('#iPin').value.trim();
    store.set('url', S.url); store.set('pin', S.pin); store.del('user');
    if (!configured()) { msg('warn', 'Disimpan. Masukkan URL dan PIN untuk menyambung.'); return; }
    msg('warn', 'Menguji sambungan…');
    try { const j = await api({ action: 'ping' }); msg('good', `✓ Tersambung ke folder: <b>${esc(j.name)}</b>. Memuat data…`); await refreshTree(true); flushQueue(); }
    catch (e) { msg('bad', esc(isNet(e) ? 'Tiada sambungan internet atau URL salah.' : e.message)); }
  };
  $('#bSync').onclick = async () => { const ok = await refreshTree(false); if (ok) msg('good', '✓ Data dikemas kini.'); };
}

/* ---------- permulaan ---------- */
$('#btnRefresh').onclick = () => refreshTree(false);
function netState() { const b = $('#netbar'); b.hidden = navigator.onLine; b.textContent = 'Tiada internet — gambar akan disimpan dalam giliran'; }
addEventListener('online', () => { netState(); flushQueue(); refreshTree(true); });
addEventListener('offline', netState);
netState(); route();
if (configured()) { refreshTree(true); flushQueue(); }
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
