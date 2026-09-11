/* ===================================================================
   👗 欧洲蜜月 OOTD
   ­
   行程和景点照片默认取自同目录的 ../data/trip-data.js（欧洲蜜月行 14 天），
   用户可以整份换掉。所有导入的图片和图层都存在浏览器的 IndexedDB 里，
   不上传任何服务器。
   =================================================================== */
(function () {
'use strict';

/* ------------------------------------------------------------ helpers */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

/* 抠图要跑一会儿，需要一条不会自己消失、能改文字的提示 */
function stickyToast(msg) {
  const t = $('#toast');
  clearTimeout(toastTimer);
  t.textContent = msg;
  t.hidden = false;
  return {
    set: (m) => { t.textContent = m; },
    done: (m) => { if (m) toast(m); else t.hidden = true; },
  };
}

function loadImg(src, cors) {
  return new Promise((res, rej) => {
    const im = new Image();
    if (cors && !src.startsWith('data:')) im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('图片加载失败: ' + src.slice(0, 60)));
    im.src = src;
  });
}

/* ------------------------------------------------- storage (IndexedDB) */
const DB_NAME = 'tripdress-wardrobe';
const STORE = 'kv';
const KEY = 'state';

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function dbGet() {
  try {
    const db = await openDB();
    return await new Promise((res) => {
      const r = db.transaction(STORE).objectStore(STORE).get(KEY);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => res(null);
    });
  } catch { return null; }
}

async function dbPut(val) {
  try {
    const db = await openDB();
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(val, KEY);
  } catch { /* 隐私模式下存不了，不影响当次使用 */ }
}

async function dbClear() {
  try {
    const db = await openDB();
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY);
  } catch { /* ignore */ }
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => dbPut(S), 350);
}

/* --------------------------------------------------------------- state */
let S = null;          // 见 defaultState()
let sel = null;        // 当前选中的图层 id
let lastCat = null;    // 最近导过东西的类别，粘贴时默认进这里
let pasteTarget = null;// 弹窗开着时，粘贴的图片先交给弹窗
const IMG = (key) => `../assets/img/${key}.jpg`;
/** trip-data.js 有改动时 +1，穿搭台会自动同步景点（保留衣橱） */
const TRIP_DATA_REV = 5;

function reloadTripScript() {
  return new Promise((resolve, reject) => {
    const url = new URL('../data/trip-data.js', document.baseURI);
    url.searchParams.set('v', String(TRIP_DATA_REV));
    url.searchParams.set('t', String(Date.now()));
    document.querySelectorAll('script[data-trip-data]').forEach((n) => n.remove());
    const s = document.createElement('script');
    s.src = url.href;
    s.dataset.tripData = '1';
    s.onload = () => resolve(window.TRIP);
    s.onerror = () => reject(new Error('行程数据加载失败'));
    document.head.appendChild(s);
  });
}

function defaultState() {
  const T = window.TRIP;
  const days = (T?.days || []).map((d) => {
    const spots = [];
    const seen = new Set();
    const add = (title, time, key) => {
      if (!key || title === '包车到米兰中央车站') return;
      const token = `${key}\0${title}`;
      if (seen.has(token)) return;
      seen.add(token);
      spots.push({ id: uid(), title, time: time || '', base: IMG(key), custom: null, cleared: false });
    };
    (d.items || []).forEach((it) => add(it.title, it.time, it.img));
    add(`${d.city} · ${d.theme}`, '当日主图', d.img);
    return {
      id: 'd' + d.n,
      label: 'Day ' + d.n,
      date: d.date,
      weekday: d.weekday || '',
      city: d.city,
      theme: d.theme || '',
      spots,
    };
  });

  return {
    v: 1,
    tripRev: TRIP_DATA_REV,
    title: T?.meta ? `${T.meta.title} · ${T.meta.subtitle}` : '我的行程',
    days,
    cats: [{ id: 'main', name: '衣服 / 裙子', emoji: '👗', fixed: true }],
    items: [],
    layers: {},
    curDay: days[0]?.id || null,
    curSpot: days[0]?.spots[0]?.id || null,
  };
}

const curDay = () => S.days.find((d) => d.id === S.curDay) || S.days[0] || null;
const curSpot = () => {
  const d = curDay();
  return d ? d.spots.find((s) => s.id === S.curSpot) || d.spots[0] || null : null;
};
const spotKey = () => `${S.curDay}:${S.curSpot}`;
/* 照片被删掉的地点：行程条目和搭配都留着，只是暂时没图 */
const spotSrc = (sp) => (sp && !sp.cleared ? sp.custom || sp.base : null);
const layersOf = (key) => (S.layers[key] ||= []);
const itemById = (id) => S.items.find((i) => i.id === id);

/** 当天所有景点图层里出现过的衣橱单品（去重，顺序按首次出现） */
function itemsOnDay(d) {
  if (!d) return [];
  const seen = new Set();
  const out = [];
  d.spots.forEach((sp) => {
    (S.layers[`${d.id}:${sp.id}`] || []).forEach((L) => {
      if (!L.itemId || seen.has(L.itemId)) return;
      const it = itemById(L.itemId);
      if (!it) return;
      seen.add(L.itemId);
      out.push(it);
    });
  });
  return out;
}
const catOf = (id) => S.cats.find((c) => c.id === id);
const layerSrc = (L) => {
  if (L.itemId) {
    const it = itemById(L.itemId);
    if (it) return it.useCut && it.cut ? it.cut : it.src;
  }
  return L.src;
};

/* --------------------------------------------------------- file → 图片 */
function pickFiles(multiple, cb) {
  const el = $('#filepick');
  el.multiple = !!multiple;
  el.value = '';
  el.onchange = () => { const fs = [...el.files]; if (fs.length) cb(fs); };
  el.click();
}

async function fileToSrc(file, max = 1500) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const alpha = /png|webp|gif/i.test(file.type);
    return c.toDataURL(alpha ? 'image/png' : 'image/jpeg', 0.88);
  } finally { URL.revokeObjectURL(url); }
}

/* 从四周往里洪水填充，把连通的白/浅色背景抠掉。电商图、白墙前的照片效果最好。 */
async function cutoutWhite(src) {
  const img = await loadImg(src);
  const k = Math.min(1, 1100 / Math.max(img.width, img.height));
  const W = Math.round(img.width * k);
  const H = Math.round(img.height * k);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H);
  const px = d.data;

  const light = (i) => {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mn > 214 && mx - mn < 26;
  };

  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
  for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }

  while (stack.length) {
    const p = stack.pop();
    if (p < 0 || p >= W * H || seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (!light(i)) continue;
    px[i + 3] = 0;
    const x = p % W;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    stack.push(p - W, p + W);
  }

  // 沿边缘再收一圈 alpha，去掉白毛边
  const out = new Uint8ClampedArray(px);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = (y * W + x);
      if (px[p * 4 + 3] === 0) continue;
      let clear = 0;
      for (const q of [p - 1, p + 1, p - W, p + W]) if (px[q * 4 + 3] === 0) clear++;
      if (clear) out[p * 4 + 3] = Math.round(255 * (1 - clear / 5));
    }
  }
  ctx.putImageData(new ImageData(out, W, H), 0, 0);
  return c.toDataURL('image/png');
}

/* =====================================================================
   渲染
   ===================================================================== */
function renderAll() {
  $('#trip-title').textContent = S.title;
  renderDayStrip();
  renderStage();
  renderRail();
  renderWardrobe();
  renderDaySummary();
}

/* 重画横向滚动条时别把滚动位置甩回开头，选中的那个也要留在视野里 */
function keepInView(box, el) {
  if (!el) return;
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.left < b.left + 10) box.scrollLeft -= b.left + 10 - r.left;
  else if (r.right > b.right - 10) box.scrollLeft += r.right - (b.right - 10);
}

/* ----------------------------------------------------------- 日期条 */
function renderDayStrip() {
  const box = $('#daystrip');
  const keep = box.scrollLeft;
  box.innerHTML = '';
  S.days.forEach((d) => {
    const dressed = d.spots.some((s) => (S.layers[`${d.id}:${s.id}`] || []).length);
    const b = document.createElement('button');
    b.className = 'daychip' + (d.id === S.curDay ? ' on' : '');
    b.type = 'button';
    b.innerHTML =
      `<b>${esc(d.date)} ${esc(d.weekday)}${dressed ? '<span class="dc-dot"></span>' : ''}</b>` +
      `<span class="dc-city">${esc(d.label)} · ${esc(d.city)}</span>`;
    b.onclick = () => {
      S.curDay = d.id;
      S.curSpot = d.spots[0]?.id || null;
      sel = null;
      save(); renderAll();
    };
    box.appendChild(b);
  });
  if (!S.days.length) {
    box.innerHTML = '<span class="wd-note">还没有行程，点右上角「导入行程」。</span>';
    return;
  }
  box.scrollLeft = keep;
  keepInView(box, $('.daychip.on', box));
}

/* ------------------------------------------------------------ 预览台 */
function renderStage() {
  const d = curDay();
  const sp = curSpot();
  const stage = $('#stage');
  const bg = $('#stage-bg');

  $('#stage-title').textContent = sp ? sp.title : (d ? `${d.date} ${d.city}` : '选一张景点照片');
  $('#stage-sub').textContent = d ? `${d.label} · ${d.date} ${d.weekday} · ${d.city}${sp?.time ? ' · ' + sp.time : ''}` : '';
  const src = spotSrc(sp);
  $('#btn-replace-bg').disabled = !sp;
  $('#btn-replace-bg').textContent = src ? '换一张' : '加一张';
  $('#btn-export').disabled = !src;
  $('#btn-restore-bg').hidden = !(sp && sp.base && (sp.custom || sp.cleared));

  $$('.layer', stage).forEach((n) => n.remove());

  if (!src) {
    bg.removeAttribute('src');
    bg.style.visibility = 'hidden';
    $('#stage-empty-t').textContent = sp
      ? `「${sp.title}」的照片删掉了，行程还留着`
      : '这一天还没有照片';
    $('#btn-empty-add').textContent = sp ? '给这个地点加张照片' : '导入一张景点照片';
    $('#stage-empty').hidden = false;
    $('#layerbar').hidden = true;
    return;
  }

  $('#stage-empty').hidden = true;
  bg.style.visibility = 'visible';
  if (bg.getAttribute('src') !== src) bg.src = src;
  const fit = () => stage.style.setProperty('--ar', (bg.naturalWidth / bg.naturalHeight) || 1.3333);
  if (bg.complete && bg.naturalWidth) fit(); else bg.onload = fit;

  layersOf(spotKey()).forEach((L) => stage.appendChild(buildLayer(L)));
  renderLayerBar();
}

function buildLayer(L) {
  const el = document.createElement('div');
  el.className = 'layer' + (L.id === sel ? ' sel' : '');
  el.dataset.id = L.id;
  el.style.width = (L.w * 100) + '%';
  el.style.left = (L.x * 100) + '%';
  el.style.top = (L.y * 100) + '%';
  el.style.opacity = L.op;
  el.style.transform = `translate(-50%,-50%) rotate(${L.rot}deg) scaleX(${L.flip ? -1 : 1})`;

  const im = document.createElement('img');
  im.src = layerSrc(L);
  im.alt = '';
  im.draggable = false;
  el.appendChild(im);
  el.addEventListener('dragstart', (e) => e.preventDefault());

  if (L.id === sel) {
    el.appendChild(handle('h-scale', '↘'));
    el.appendChild(handle('h-rotate', '↻'));
  }

  el.addEventListener('pointerdown', (e) => startLayerDrag(e, L, el));
  return el;
}

function handle(cls, txt, onclick) {
  const b = document.createElement('button');
  b.className = 'handle ' + cls;
  b.type = 'button';
  b.textContent = txt;
  if (onclick) b.addEventListener('pointerdown', (e) => e.stopPropagation());
  if (onclick) b.onclick = onclick;
  return b;
}

/* ------------------------------------------------------- 图层工具条 */
function renderLayerBar() {
  const bar = $('#layerbar');
  const list = layersOf(spotKey());
  const L = list.find((x) => x.id === sel);
  if (!L) {
    bar.hidden = true;
    $('#stage-hint').textContent = isNarrow()
      ? '点下面衣橱里的单品就会贴到这张照片上 · 贴上去后按住就能挪、拖角上的圈能缩放'
      : (list.length
        ? '点一下画面里的单品可以调整它 · 也可以继续从右边拖新的进来'
        : '把右边衣橱里的单品拖进来 · 也可以直接把电脑里的图片拖到这张照片上');
    return;
  }
  bar.hidden = false;
  const it = L.itemId ? itemById(L.itemId) : null;

  bar.innerHTML = `
    <span class="lb-name">${esc(it?.name || '图层')}</span>
    <span class="lb-group">大小<input type="range" id="lb-size" min="6" max="130" value="${Math.round(L.w * 100)}" /></span>
    <span class="lb-group">角度<input type="range" id="lb-rot" min="-180" max="180" value="${Math.round(L.rot)}" /></span>
  `;

  const live = (id, fn) => {
    const input = $('#' + id, bar);
    input.oninput = () => { fn(+input.value); patchLayer(L); };
    input.onchange = save;
  };
  live('lb-size', (v) => { L.w = v / 100; });
  live('lb-rot', (v) => { L.rot = v; });
}

function patchLayer(L) {
  const el = $(`.layer[data-id="${L.id}"]`);
  if (!el) return;
  el.style.width = (L.w * 100) + '%';
  el.style.left = (L.x * 100) + '%';
  el.style.top = (L.y * 100) + '%';
  el.style.opacity = L.op;
  el.style.transform = `translate(-50%,-50%) rotate(${L.rot}deg) scaleX(${L.flip ? -1 : 1})`;
}

function removeLayer(id) {
  const list = layersOf(spotKey());
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  list.splice(i, 1);
  if (sel === id) sel = null;
  save(); renderStage(); renderDayStrip(); renderDaySummary(); renderWardrobe();
}

/* --------------------------------------------------- 图层拖动 / 缩放 */
function startLayerDrag(e, L, el) {
  const stage = $('#stage');
  const box = stage.getBoundingClientRect();
  const handleEl = e.target.closest('.handle');
  const mode = handleEl?.classList.contains('h-scale') ? 'scale'
    : handleEl?.classList.contains('h-rotate') ? 'rotate' : 'move';

  if (sel !== L.id) { sel = L.id; renderStage(); }
  e.preventDefault();
  e.stopPropagation();

  const cx = L.x * box.width, cy = L.y * box.height;
  const start = { px: e.clientX - box.left, py: e.clientY - box.top };
  const startW = L.w, startRot = L.rot;
  const startDist = Math.hypot(start.px - cx, start.py - cy) || 1;
  const startAng = Math.atan2(start.py - cy, start.px - cx);
  const grab = { dx: cx - start.px, dy: cy - start.py };

  const target = $(`.layer[data-id="${L.id}"]`) || el;
  target.classList.add('dragging');
  target.setPointerCapture?.(e.pointerId);

  const onMove = (ev) => {
    const px = ev.clientX - box.left, py = ev.clientY - box.top;
    if (mode === 'move') {
      L.x = clamp((px + grab.dx) / box.width, -0.25, 1.25);
      L.y = clamp((py + grab.dy) / box.height, -0.25, 1.25);
    } else if (mode === 'scale') {
      const dist = Math.hypot(px - cx, py - cy);
      L.w = clamp(startW * (dist / startDist), 0.05, 1.6);
    } else {
      const ang = Math.atan2(py - cy, px - cx);
      L.rot = Math.round(startRot + (ang - startAng) * 180 / Math.PI);
    }
    patchLayer(L);
  };
  const onUp = () => {
    target.classList.remove('dragging');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    save();
    renderLayerBar();
    renderDayStrip();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

$('#stage').addEventListener('pointerdown', (e) => {
  if (e.target.closest('.layer')) return;
  if (sel) { sel = null; renderStage(); }
});

/* ------------------------------------------------------- 景点照片轨 */
function renderRail() {
  const rail = $('#spot-rail');
  const d = curDay();
  const keep = rail.dataset.day === S.curDay ? rail.scrollLeft : 0;
  rail.dataset.day = S.curDay || '';
  rail.innerHTML = '';
  if (!d) return;

  d.spots.forEach((sp) => {
    const n = (S.layers[`${d.id}:${sp.id}`] || []).length;
    const src = spotSrc(sp);
    const card = document.createElement('div');
    card.className = 'spot' + (sp.id === S.curSpot ? ' on' : '') + (src ? '' : ' blank');
    card.dataset.spot = sp.id;
    card.innerHTML = `
      ${src
        ? `<img class="spot-thumb" src="${esc(src)}" alt="" loading="lazy" />`
        : '<div class="spot-blank"><span>＋ 加照片</span></div>'}
      ${n ? `<span class="spot-badge">${n} 件</span>` : ''}
      <button class="spot-x" type="button" title="${src ? '删掉这张照片（行程还留着）' : '删掉这个地点'}">✕</button>
      <div class="spot-meta">
        <div class="spot-t">${esc(sp.title)}</div>
        <div class="spot-time">${esc(sp.time || '')}${src && sp.custom ? ' · 自己的图' : ''}</div>
      </div>`;
    card.onclick = (e) => {
      if (e.target.closest('.spot-x')) {
        e.stopPropagation();
        // 有图就只删图：行程条目和搭好的衣服都留着，加回照片就又出来了
        if (spotSrc(sp)) {
          sp.custom = null;
          sp.cleared = true;
          save(); renderAll();
          toast('照片删了，行程还在 · 点这张卡片能再加一张');
          return;
        }
        // 已经是空卡片了，再点一次才真的把这个地点去掉
        if (!confirm(`「${sp.title}」这个地点也从今天去掉？${n ? '搭好的 ' + n + ' 件衣服会一起没。' : ''}`)) return;
        delete S.layers[`${d.id}:${sp.id}`];
        d.spots = d.spots.filter((x) => x.id !== sp.id);
        if (S.curSpot === sp.id) S.curSpot = d.spots[0]?.id || null;
        save(); renderAll();
        return;
      }
      S.curSpot = sp.id;
      sel = null;
      save(); renderStage(); renderRail();
      if (!src) replaceSpotPhoto(sp);     // 空卡片点一下就直接挑照片
    };
    card.ondblclick = () => replaceSpotPhoto(sp);
    rail.appendChild(card);
  });

  const add = document.createElement('button');
  add.className = 'spot-add';
  add.type = 'button';
  add.innerHTML = '<span>＋ 加地点</span>';
  add.onclick = addSpot;
  rail.appendChild(add);

  rail.scrollLeft = keep;
  keepInView(rail, $('.spot.on', rail));
}

async function addSpotFromFile(f) {
  const d = curDay();
  if (!d) return null;
  const sp = {
    id: uid(),
    title: f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 24) || '新地点',
    time: '',
    base: await fileToSrc(f, 1800),
    custom: null,
  };
  d.spots.push(sp);
  return sp;
}

function addSpot() {
  const d = curDay();
  if (!d) { toast('先导入行程'); return; }
  pickFiles(true, async (files) => {
    let last = null;
    for (const f of files) last = (await addSpotFromFile(f)) || last;
    if (last) S.curSpot = last.id;
    save(); renderAll();
    toast('加好了，拖张图片到卡片上还能再换');
  });
}

function replaceSpotPhoto(sp) {
  pickFiles(false, async (files) => {
    sp.custom = await fileToSrc(files[0], 1800);
    sp.cleared = false;
    save(); renderStage(); renderRail();
    toast('换好了');
  });
}

/* ---------------------------------------------------------------- 衣橱 */
function renderWardrobe() {
  const box = $('#wd-cats');
  box.innerHTML = '';

  const onDay = new Set(itemsOnDay(curDay()).map((it) => it.id));

  S.cats.forEach((cat) => {
    const wrap = document.createElement('div');
    wrap.className = 'cat';
    wrap.dataset.cat = cat.id;
    wrap.innerHTML = `<div class="cat-head"><span>${esc(cat.name)}</span>
      ${cat.fixed ? '' : '<button class="cat-del" type="button">删类别</button>'}</div>`;

    const grid = document.createElement('div');
    grid.className = 'grid';

    S.items.filter((i) => i.cat === cat.id).forEach((it) => {
      const el = document.createElement('div');
      el.className = 'piece' + (it.useCut ? ' cut' : '') + (onDay.has(it.id) ? ' inday' : '');
      el.dataset.item = it.id;
      el.innerHTML = `
        <img src="${esc(it.useCut && it.cut ? it.cut : it.src)}" alt="${esc(it.name)}" />
        <div class="piece-n" title="${esc(it.name)}">${esc(it.name)}</div>
        <div class="piece-tools">
          <button type="button" data-a="crop" title="裁剪">⛶</button>
          <button type="button" data-a="cut" title="一键抠图（只留这件东西）">✂</button>
          <button type="button" data-a="ren" title="改名字">✎</button>
          <button type="button" data-a="del" title="删掉">✕</button>
        </div>`;
      el.querySelector('[data-a=crop]').onclick = (e) => { e.stopPropagation(); openCrop(it); };
      el.querySelector('[data-a=cut]').onclick = (e) => { e.stopPropagation(); toggleCut(it); };
      el.querySelector('[data-a=ren]').onclick = (e) => {
        e.stopPropagation();
        const v = prompt('给它起个名字', it.name);
        if (v) { it.name = v.slice(0, 20); save(); renderWardrobe(); }
      };
      el.querySelector('[data-a=del]').onclick = (e) => {
        e.stopPropagation();
        if (!confirm(`把「${it.name}」从衣橱里删掉？已经搭到照片上的也会消失。`)) return;
        S.items = S.items.filter((x) => x.id !== it.id);
        Object.keys(S.layers).forEach((k) => {
          S.layers[k] = S.layers[k].filter((L) => L.itemId !== it.id);
        });
        save(); renderAll();
      };
      wirePieceDrag(el, it, () => placeOnPhoto(it));
      grid.appendChild(el);
    });

    const add = document.createElement('button');
    add.className = 'piece-add';
    add.type = 'button';
    add.innerHTML = '＋<span>导入照片</span>';
    add.onclick = () => importPieces(cat.id);
    grid.appendChild(add);

    wrap.appendChild(grid);
    const delBtn = wrap.querySelector('.cat-del');
    if (delBtn) delBtn.onclick = () => {
      if (!confirm(`删掉「${cat.name}」这个类别？里面的单品也会删掉。`)) return;
      const ids = S.items.filter((i) => i.cat === cat.id).map((i) => i.id);
      S.items = S.items.filter((i) => i.cat !== cat.id);
      S.cats = S.cats.filter((c) => c.id !== cat.id);
      Object.keys(S.layers).forEach((k) => {
        S.layers[k] = S.layers[k].filter((L) => !ids.includes(L.itemId));
      });
      save(); renderAll();
    };
    box.appendChild(wrap);
  });
}

function addItem(src, name, catId) {
  const it = {
    id: uid(),
    cat: catId,
    name: (name || '新单品').replace(/\.[a-z0-9]+$/i, '').slice(0, 16) || '新单品',
    src, cut: null, useCut: false,
  };
  S.items.push(it);
  lastCat = catId;
  return it;
}

/* 选文件、拖进来、粘贴，三条路最后都走这里 */
async function addItemsFromFiles(files, catId, name) {
  const imgs = [...files].filter((f) => /^image\//.test(f.type));
  if (!imgs.length) { toast('没找到图片'); return []; }
  const made = [];
  for (const f of imgs) made.push(addItem(await fileToSrc(f, 1200), name || f.name, catId));
  const last = made[made.length - 1];
  save(); renderWardrobe();
  return made;
}

function importPieces(catId) {
  pickFiles(true, async (files) => {
    const made = await addItemsFromFiles(files, catId);
    if (made.length) toast('导好了，拖到左边照片上试试');
  });
}

/* -------------------------------------------------------------- 裁剪单品 */
/* 裁剪框用「占整张图的比例」存，这样显示多大都能换算回原图像素 */
function openCrop(it) {
  const shown = it.useCut && it.cut ? it.cut : it.src;
  let box = { x: 0.06, y: 0.06, w: 0.88, h: 0.88 };
  const MIN = 0.08;

  openModal(`
    <h3>裁剪「${esc(it.name)}」</h3>
    <p class="m-note">拖框里面挪位置，拖四个角改大小。裁掉多余的背景，贴到照片上会更像一体的。</p>
    <div class="cropwrap">
      <div class="cropbox" id="cr-box">
        <img id="cr-img" src="${esc(shown)}" alt="" draggable="false" />
        <div class="crop-rect" id="cr-rect">
          <span class="cr-h" data-h="nw"></span><span class="cr-h" data-h="ne"></span>
          <span class="cr-h" data-h="sw"></span><span class="cr-h" data-h="se"></span>
        </div>
      </div>
    </div>
    <div class="m-actions">
      <button class="btn btn-go" id="cr-ok" type="button">裁好了</button>
      <button class="btn" id="cr-all" type="button">选整张</button>
      <button class="btn" id="cr-cancel" type="button">取消</button>
    </div>
  `, (close) => {
    const rect = $('#cr-rect');
    const area = $('#cr-box');

    const paint = () => {
      rect.style.left = box.x * 100 + '%';
      rect.style.top = box.y * 100 + '%';
      rect.style.width = box.w * 100 + '%';
      rect.style.height = box.h * 100 + '%';
    };
    paint();

    const grab = (e, mode) => {
      if (e.button > 0) return;
      e.preventDefault();
      e.stopPropagation();
      const bounds = area.getBoundingClientRect();
      const s = { ...box };
      const sx = e.clientX, sy = e.clientY;

      const move = (ev) => {
        const dx = (ev.clientX - sx) / bounds.width;
        const dy = (ev.clientY - sy) / bounds.height;
        if (mode === 'move') {
          box.x = clamp(s.x + dx, 0, 1 - s.w);
          box.y = clamp(s.y + dy, 0, 1 - s.h);
        } else {
          const west = mode.includes('w'), north = mode.includes('n');
          const r = s.x + s.w, b = s.y + s.h;
          if (west) { box.x = clamp(s.x + dx, 0, r - MIN); box.w = r - box.x; }
          else { box.w = clamp(s.w + dx, MIN, 1 - s.x); }
          if (north) { box.y = clamp(s.y + dy, 0, b - MIN); box.h = b - box.y; }
          else { box.h = clamp(s.h + dy, MIN, 1 - s.y); }
        }
        paint();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
    };

    rect.addEventListener('pointerdown', (e) => {
      if (e.target.dataset.h) grab(e, e.target.dataset.h); else grab(e, 'move');
    });

    $('#cr-all').onclick = () => { box = { x: 0, y: 0, w: 1, h: 1 }; paint(); };
    $('#cr-cancel').onclick = close;
    $('#cr-ok').onclick = async () => {
      if (box.w > 0.995 && box.h > 0.995) { close(); return; }
      toast('正在裁…');
      try {
        it.src = await cropSrc(it.src, box);
        if (it.cut) it.cut = await cropSrc(it.cut, box);   // 去白底那张要跟着裁，不然切回去就错位
        save(); renderWardrobe(); renderStage();
        close();
        toast('裁好了');
      } catch { toast('裁剪失败，换一张试试'); }
    };
  });
}

async function cropSrc(src, box) {
  const im = await loadImg(src, true);
  const sx = Math.round(box.x * im.naturalWidth);
  const sy = Math.round(box.y * im.naturalHeight);
  const sw = Math.max(1, Math.round(box.w * im.naturalWidth));
  const sh = Math.max(1, Math.round(box.h * im.naturalHeight));
  const k = Math.min(1, 1200 / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k));
  c.height = Math.max(1, Math.round(sh * k));
  c.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const alpha = /^data:image\/png/i.test(src);
  return c.toDataURL(alpha ? 'image/png' : 'image/jpeg', 0.9);
}

/* =====================================================================
   一键抠图：用在浏览器里跑的分割模型（帽子、包、鞋、人都能整体抠出来）
   模型和 wasm 第一次要下载约 50MB，之后浏览器自己缓存，不用再下。
   ===================================================================== */
/* 必须用 jsDelivr 的 +esm 版本：原始 dist 里有 onnxruntime-web 这种裸模块名，浏览器解析不了 */
const CUTOUT_LIB = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';
const MODEL_FLAG = 'tripdress-cutout-ready';
let removeBg = null;

async function cutoutSubject(src, onStep) {
  if (!removeBg) {
    onStep?.('正在准备抠图模型…');
    const mod = await import(CUTOUT_LIB);
    removeBg = mod.removeBackground || mod.default;
  }
  const blob = await removeBg(src, {
    model: 'isnet_quint8',                          // 三档里最小的一档
    output: { format: 'image/png' },
    progress: (key, cur, total) => {
      if (/fetch/.test(key) && total) {
        onStep?.(`正在下载模型 ${Math.round(cur / total * 100)}%（只用下这一次）`);
      } else {
        onStep?.('正在抠图…');
      }
    },
  });
  localStorage.setItem(MODEL_FLAG, '1');
  return await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function toggleCut(it) {
  if (it.cut) {                                     // 抠过了，就只是切换用不用
    it.useCut = !it.useCut;
    save(); renderWardrobe(); renderStage();
    return;
  }
  if (!localStorage.getItem(MODEL_FLAG)
      && !confirm(
        '【轻量 AI 抠图 · 方案 A】\n'
        + '第一次约 50MB（浏览器缓存，以后本机抠图几秒就好）。\n'
        + '帽子、包、鞋、穿在展厅/街景里的人像，都能整体抠出来。\n\n'
        + '确定 = 下载并抠图\n'
        + '取消 = 不下载，改用「仅去白底」（秒出，只适合白墙/电商白底图）'
      )) {
    return fallbackCut(it);
  }
  const tip = stickyToast('正在准备抠图模型…');
  try {
    it.cut = await cutoutSubject(it.src, tip.set);
    it.useCut = true;
    save(); renderWardrobe(); renderStage();
    tip.done('抠好了，再点一次 ✂ 可以换回原图');
  } catch (e) {
    tip.done();
    console.warn('抠图失败', e);
    toast('抠图模型加载不了，先用白底去背顶一下');
    return fallbackCut(it);
  }
}

/* 模型下不下来（断网、网络被挡）时的退路：只能去掉白色背景 */
async function fallbackCut(it) {
  const tip = stickyToast('正在去白底…');
  try {
    it.cut = await cutoutWhite(it.src);
    it.useCut = true;
    save(); renderWardrobe(); renderStage();
    tip.done('去好了');
  } catch {
    tip.done('这张去不掉，换一张试试');
  }
}

/* =====================================================================
   把单品拖到照片上（鼠标 + 触屏都走 pointer 事件）
   ===================================================================== */
function wirePieceDrag(el, it, onTap) {
  // 不拦的话浏览器会用自己的「拖图片」接管，我们的拖拽就被 pointercancel 掐断
  el.addEventListener('dragstart', (e) => e.preventDefault());
  $$('img', el).forEach((im) => { im.draggable = false; });

  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const startX = e.clientX, startY = e.clientY;
    const touch = e.pointerType === 'touch';
    let dragging = false;
    const ghost = $('#dragghost');

    // 触屏：拖起来之后要一直吃掉 touchmove，否则浏览器会把手势当成翻页
    const eatScroll = (ev) => { if (dragging) ev.preventDefault(); };
    if (touch) document.addEventListener('touchmove', eatScroll, { passive: false });

    let holdTimer = touch
      ? setTimeout(() => { dragging = true; showGhost(it, startX, startY); }, 220)
      : null;

    const move = (ev) => {
      if (!dragging) {
        if (touch) return;
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        dragging = true;
        showGhost(it, ev.clientX, ev.clientY);
      }
      ev.preventDefault();
      ghost.style.left = ev.clientX + 'px';
      ghost.style.top = ev.clientY + 'px';
      hoverTargets(ev.clientX, ev.clientY);
    };
    const unbind = () => {
      clearTimeout(holdTimer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      document.removeEventListener('touchmove', eatScroll);
    };
    const up = (ev) => {
      unbind();
      if (!dragging) { onTap?.(); return; }
      ghost.hidden = true;
      clearHover();
      dropAt(it, ev.clientX, ev.clientY);
    };
    const cancel = () => {
      // 手势被系统收走（比如页面开始滚动）：当成点一下处理，别让用户白按
      const wasDragging = dragging;
      unbind();
      dragging = false;
      ghost.hidden = true;
      clearHover();
      if (wasDragging) placeOnPhoto(it);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  });
}

function showGhost(it, x, y) {
  const g = $('#dragghost');
  g.src = it.useCut && it.cut ? it.cut : it.src;
  g.style.left = x + 'px';
  g.style.top = y + 'px';
  g.hidden = false;
}

function hoverTargets(x, y) {
  clearHover();
  const node = document.elementFromPoint(x, y);
  const stage = node?.closest?.('#stage');
  if (stage) { stage.classList.add('drop-on'); return; }
  node?.closest?.('.spot')?.classList.add('drop-on');
}
function clearHover() {
  $('#stage').classList.remove('drop-on');
  $$('.spot.drop-on').forEach((n) => n.classList.remove('drop-on'));
}

function dropAt(it, x, y) {
  const node = document.elementFromPoint(x, y);
  const stage = node?.closest?.('#stage');
  if (stage && curSpot()) {
    const box = stage.getBoundingClientRect();
    dropItemOnStage(it, {
      x: clamp((x - box.left) / box.width, 0.05, 0.95),
      y: clamp((y - box.top) / box.height, 0.05, 0.95),
    });
    return;
  }
  const spotCard = node?.closest?.('.spot');
  if (spotCard) {
    S.curSpot = spotCard.dataset.spot;
    renderStage(); renderRail();
    dropItemOnStage(it, { x: 0.5, y: 0.55 });
    return;
  }
  toast('要放到上面那张照片上才算贴好');
}

const isNarrow = () => window.innerWidth <= 940;
const stageVisible = () => {
  const r = $('#stage').getBoundingClientRect();
  return r.bottom > 60 && r.top < window.innerHeight - 40;
};

/* 吸顶的照片要正好贴在日期条下面，高度按实际渲染出来的算 */
function syncStickyTop() {
  const h = $('.topbar').offsetHeight + $('#daystrip').offsetHeight;
  document.documentElement.style.setProperty('--sticky-top', h + 'px');
}
window.addEventListener('resize', syncStickyTop);

/* 手机上衣橱在照片下面，点一下直接贴上去，再把照片滚到眼前 */
function placeOnPhoto(it) {
  if (!spotSrc(curSpot())) { toast('这个地点还没有照片，先加一张'); return; }
  dropItemOnStage(it, { x: 0.5, y: 0.55 });
  if (isNarrow()) {
    // 照片被滚出去了才拉回来；smooth 在部分内置浏览器里会被忽略，所以用瞬时滚动
    if (!stageVisible()) $('.stage-wrap').scrollIntoView({ block: 'center' });
    toast('贴上去了，按住就能挪位置');
  }
}

function dropItemOnStage(it, at) {
  const sp = curSpot();
  if (!spotSrc(sp)) { toast('这个地点还没有照片，先加一张'); return; }
  const L = {
    id: uid(), itemId: it.id, src: null,
    x: at.x, y: at.y, w: 0.36, rot: 0, op: 1, flip: false,
  };
  layersOf(spotKey()).push(L);
  sel = L.id;
  save(); renderStage(); renderRail(); renderDayStrip(); renderWardrobe(); renderDaySummary();
}

/* ---------------------------------------- 当前景点搭配 → 当日全部景点 */
function copyOutfitToAllDaySpots() {
  const d = curDay();
  const sp = curSpot();
  if (!d || !sp) { toast('先选一天和一个景点'); return; }
  const src = layersOf(spotKey());
  if (!src.length) { toast('当前这张图上还没有单品'); return; }
  const others = d.spots.filter((t) => t.id !== sp.id);
  if (!others.length) { toast('今天没有别的景点了'); return; }
  if (!confirm(`把「${sp.title}」上的 ${src.length} 件单品（位置大小一起）复制到今日另外 ${others.length} 个景点？\n已有搭配会被覆盖。`)) return;

  others.forEach((target) => {
    const key = `${d.id}:${target.id}`;
    S.layers[key] = src.map((L) => ({
      id: uid(),
      itemId: L.itemId,
      src: L.src,
      x: L.x,
      y: L.y,
      w: L.w,
      rot: L.rot,
      op: L.op,
      flip: !!L.flip,
    }));
  });
  sel = null;
  save();
  renderStage();
  renderRail();
  renderDayStrip();
  renderDaySummary();
  toast(`已复制到今日 ${others.length} 个景点`);
}

/* ------------------------------------------------------ 今日穿搭汇总 */
function renderDaySummary() {
  const box = $('#day-summary');
  if (!box) return;
  const items = itemsOnDay(curDay());
  box.innerHTML = '';
  if (!items.length) {
    box.innerHTML = '<p class="empty">今日还没有单品</p>';
    return;
  }
  items.forEach((it) => {
    const el = document.createElement('div');
    el.className = 'dl-item';
    el.title = it.name;
    el.innerHTML = `<img src="${esc(it.useCut && it.cut ? it.cut : it.src)}" alt="${esc(it.name)}" />`;
    wirePieceDrag(el, it, () => placeOnPhoto(it));
    box.appendChild(el);
  });
}

/* ---------------------------------------------- 粘贴导入（⌘/Ctrl + V） */
document.addEventListener('paste', async (e) => {
  const files = [...(e.clipboardData?.files || [])].filter((f) => /^image\//.test(f.type));
  if (!files.length) return;
  e.preventDefault();
  if (pasteTarget) { pasteTarget(files); return; }
  const cat = catOf(lastCat) || S.cats[0];
  const made = await addItemsFromFiles(files, cat.id);
  if (made.length) toast(`粘贴了 ${made.length} 张进「${cat.name}」`);
});

/* -------------------------------------------- 图片直接拖进衣橱就导入 */
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
const wdPanel = $('.wardrobe');

wdPanel.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  const zone = e.target.closest('.cat') || wdPanel;
  if (!zone.classList.contains('drop-on')) {
    $$('.drop-on', wdPanel).forEach((n) => n.classList.remove('drop-on'));
    wdPanel.classList.remove('drop-on');
    zone.classList.add('drop-on');
  }
});
wdPanel.addEventListener('dragleave', (e) => {
  if (e.relatedTarget && wdPanel.contains(e.relatedTarget)) return;
  wdPanel.classList.remove('drop-on');
  $$('.cat.drop-on', wdPanel).forEach((n) => n.classList.remove('drop-on'));
});
wdPanel.addEventListener('drop', async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  const catId = e.target.closest('.cat')?.dataset.cat || lastCat || S.cats[0].id;
  wdPanel.classList.remove('drop-on');
  $$('.cat.drop-on', wdPanel).forEach((n) => n.classList.remove('drop-on'));
  const made = await addItemsFromFiles(e.dataTransfer.files, catId);
  if (made.length) toast(`收进「${catOf(catId).name}」了`);
});

/* ------------------------------ 图片拖到景点卡片上 = 换掉那张景点照片 */
const railEl = $('#spot-rail');
const clearRail = () => $$('.drop-on', railEl).forEach((n) => n.classList.remove('drop-on'));

railEl.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  const zone = e.target.closest('.spot, .spot-add');
  if (zone && !zone.classList.contains('drop-on')) { clearRail(); zone.classList.add('drop-on'); }
  if (!zone) clearRail();
});
railEl.addEventListener('dragleave', (e) => {
  if (e.relatedTarget && railEl.contains(e.relatedTarget)) return;
  clearRail();
});
railEl.addEventListener('drop', async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  clearRail();
  const files = [...e.dataTransfer.files].filter((f) => /^image\//.test(f.type));
  const d = curDay();
  if (!files.length || !d) return;

  const card = e.target.closest('.spot');
  if (card) {
    const sp = d.spots.find((s) => s.id === card.dataset.spot);
    sp.custom = await fileToSrc(files[0], 1800);
    sp.cleared = false;
    S.curSpot = sp.id;
    for (const f of files.slice(1)) await addSpotFromFile(f);   // 多拖的当新地点
    save(); renderStage(); renderRail();
    toast(`「${sp.title}」换成你的照片了`);
    return;
  }
  let last = null;
  for (const f of files) last = (await addSpotFromFile(f)) || last;
  if (last) S.curSpot = last.id;
  save(); renderAll();
  toast(`加了 ${files.length} 个新地点`);
});

/* 图片掉到页面空白处时别让浏览器跳去打开它，那样页面就没了 */
['dragover', 'drop'].forEach((t) => {
  document.addEventListener(t, (e) => { if (hasFiles(e)) e.preventDefault(); });
});

/* 从桌面直接拖图片文件进来 */
['dragover', 'drop'].forEach((type) => {
  $('#stage').addEventListener(type, async (e) => {
    e.preventDefault();
    if (type === 'dragover') { $('#stage').classList.add('drop-on'); return; }
    $('#stage').classList.remove('drop-on');
    const files = [...(e.dataTransfer?.files || [])].filter((f) => /^image\//.test(f.type));
    if (!files.length) return;
    const box = $('#stage').getBoundingClientRect();
    const src = await fileToSrc(files[0], 1200);
    const it = addItem(src, files[0].name, lastCat || S.cats[0].id);
    dropItemOnStage(it, {
      x: clamp((e.clientX - box.left) / box.width, 0.05, 0.95),
      y: clamp((e.clientY - box.top) / box.height, 0.05, 0.95),
    });
  });
});
$('#stage').addEventListener('dragleave', () => $('#stage').classList.remove('drop-on'));

/* =====================================================================
   导出成片
   ===================================================================== */
async function compose() {
  const sp = curSpot();
  const bg = await loadImg(spotSrc(sp), true);
  const W = Math.min(bg.naturalWidth || 1600, 2400);
  const H = Math.round(W * (bg.naturalHeight / bg.naturalWidth));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.drawImage(bg, 0, 0, W, H);

  for (const L of layersOf(spotKey())) {
    const im = await loadImg(layerSrc(L), true);
    const w = L.w * W;
    const h = w * (im.naturalHeight / im.naturalWidth);

    ctx.save();
    ctx.translate(L.x * W, L.y * H);
    ctx.rotate(L.rot * Math.PI / 180);
    ctx.globalAlpha = L.op;

    ctx.shadowColor = 'rgba(0,0,0,.34)';
    ctx.shadowBlur = w * 0.05;
    ctx.shadowOffsetY = w * 0.02;
    if (L.flip) ctx.scale(-1, 1);

    ctx.drawImage(im, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  return c;
}

async function exportPNG() {
  const sp = curSpot();
  const d = curDay();
  if (!spotSrc(sp)) { toast('这个地点还没有照片'); return; }
  toast('正在合成…');
  try {
    const c = await compose();
    const name = `${(d?.date || 'trip').replace(/\./g, '-')}_${(sp.title || '成片').replace(/[\/\\:*?"<>|\s]+/g, '')}.png`;
    c.toBlob((blob) => {
      if (!blob) { toast('导出失败'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('已经下载啦');
    }, 'image/png');
  } catch (err) {
    console.error(err);
    toast(location.protocol === 'file:'
      ? '本地直接打开文件时浏览器不让导出，起个本地服务或用线上版本'
      : '导出失败：' + err.message);
  }
}

/* =====================================================================
   弹窗：导入行程 / 加类别
   ===================================================================== */
let closeModal = () => {};

function openModal(html, wire) {
  const m = $('#modal');
  $('#modal-card').innerHTML = html;
  m.hidden = false;
  closeModal = () => {
    m.hidden = true;
    $('#modal-card').innerHTML = '';
    pasteTarget = null;
    closeModal = () => {};
  };
  m.onclick = (e) => { if (e.target === m) closeModal(); };
  wire?.(closeModal);
}

const SAMPLE_TEXT = `9.25 周四 巴黎 落地即开卷
- 10:00 卢浮宫
- 15:00 凯旋门
- 19:00 埃菲尔铁塔
9.26 周五 巴黎 左岸文艺日
- 09:00 卢森堡花园
- 12:30 巴黎圣母院`;

function openImport() {
  openModal(`
    <h3>导入每天的旅游计划</h3>
    <p class="m-note">两种写法都行：直接按下面的格式敲，或者丢一份 JSON 进来。导入后原来的行程会被替换，衣橱里的衣服不受影响。</p>
    <div class="chiprow">
      <button type="button" id="im-sample">填个示例看看</button>
      <button type="button" id="im-file">选一个 JSON 文件</button>
      <button type="button" id="im-default">恢复欧洲蜜月行</button>
    </div>
    <label for="im-title">行程名字</label>
    <input type="text" id="im-title" value="${esc(S.title)}" />
    <label for="im-text">每天的安排</label>
    <textarea id="im-text" placeholder="${esc(SAMPLE_TEXT)}"></textarea>
    <pre>格式：一行「日期 星期 城市 主题」开一天，下面用 - 开头的行是当天的地点
JSON：{"title":"…","days":[{"date":"9.25","city":"巴黎","spots":[{"title":"卢浮宫","time":"10:00","img":"图片网址"}]}]}</pre>
    <div class="m-actions">
      <button class="btn btn-go" id="im-ok" type="button">导入</button>
      <button class="btn" id="im-cancel" type="button">取消</button>
    </div>
  `, (close) => {
    $('#im-sample').onclick = () => { $('#im-text').value = SAMPLE_TEXT; };
    $('#im-default').onclick = () => {
      if (!confirm('恢复成默认的欧洲蜜月行行程？这一份行程上搭好的图会清掉。')) return;
      const keep = { cats: S.cats, items: S.items };
      S = defaultState();
      S.cats = keep.cats; S.items = keep.items;
      save(); renderAll(); close();
      toast('已经恢复默认行程');
    };
    $('#im-file').onclick = () => {
      const el = document.createElement('input');
      el.type = 'file'; el.accept = '.json,application/json';
      el.onchange = async () => {
        const f = el.files[0];
        if (!f) return;
        $('#im-text').value = await f.text();
      };
      el.click();
    };
    $('#im-cancel').onclick = close;
    $('#im-ok').onclick = () => {
      const raw = $('#im-text').value.trim();
      if (!raw) { toast('还没写内容'); return; }
      let days;
      try {
        days = /^[[{]/.test(raw) ? parseJSONTrip(raw) : parseTextTrip(raw);
      } catch (err) { toast('没看懂：' + err.message); return; }
      if (!days.length) { toast('一天都没解析出来'); return; }
      S.title = $('#im-title').value.trim() || '我的行程';
      S.days = days;
      S.layers = {};
      S.curDay = days[0].id;
      S.curSpot = days[0].spots[0]?.id || null;
      sel = null;
      save(); renderAll(); close();
      toast(`导入了 ${days.length} 天`);
    };
  });
}

function mkDay(i, o) {
  return {
    id: 'u' + i + uid(),
    label: 'Day ' + (i + 1),
    date: o.date || `第 ${i + 1} 天`,
    weekday: o.weekday || '',
    city: o.city || '',
    theme: o.theme || '',
    spots: (o.spots || []).map((s) => ({
      id: uid(),
      title: s.title || '未命名地点',
      time: s.time || '',
      base: s.img || s.image || PLACEHOLDER,
      custom: null,
    })),
  };
}

const PLACEHOLDER =
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
       <rect width="800" height="600" fill="#f0dcc0"/>
       <text x="400" y="300" font-size="34" fill="#9d8877" text-anchor="middle"
         font-family="sans-serif">双击卡片导入这里的照片</text>
     </svg>`);

function parseJSONTrip(raw) {
  const o = JSON.parse(raw);
  const src = Array.isArray(o) ? o : (o.days || []);
  return src.map((d, i) => mkDay(i, {
    ...d,
    spots: d.spots || (d.items || []).filter((x) => x.title).map((x) => ({
      title: x.title, time: x.time, img: x.img && !/^https?:|^data:|\//.test(x.img) ? IMG(x.img) : x.img,
    })),
  }));
}

function parseTextTrip(raw) {
  const days = [];
  raw.split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (!t) return;
    const spotMatch = t.match(/^[-·•*]\s*(.+)$/);
    if (spotMatch && days.length) {
      const body = spotMatch[1].trim();
      const m = body.match(/^([\d:：.\-–—\s]{3,20}?)\s+(.+)$/);
      days[days.length - 1].spots.push(
        m ? { title: m[2].trim(), time: m[1].trim() } : { title: body }
      );
      return;
    }
    const parts = t.replace(/^#\s*/, '').split(/\s+/);
    const date = parts.shift() || '';
    let weekday = '';
    if (/^(周|星期)/.test(parts[0] || '')) weekday = parts.shift();
    days.push({ date, weekday, city: parts.shift() || '', theme: parts.join(' '), spots: [] });
  });
  return days.map((d, i) => mkDay(i, d));
}

const CAT_PRESETS = ['👠 鞋子', '💇‍♀️ 发型', '👜 包包', '🧢 帽子', '💍 首饰', '🕶 墨镜',
  '🧥 外套', '👙 泳衣', '🧣 围巾', '👖 下装'];

function splitEmoji(label) {
  const m = label.trim().match(/^(\p{Extended_Pictographic}[\u200d\p{Extended_Pictographic}\ufe0f]*)?\s*(.*)$/u);
  return { emoji: m?.[1] || '🧺', name: (m?.[2] || label).trim() };
}

function openAddPiece(presetCat) {
  const staged = [];                                   // 待加入的图片
  let pickedCat = presetCat || lastCat || S.cats[0]?.id;
  let newCat = null;                                   // 现场新建的类别名

  const fresh = CAT_PRESETS.filter((p) => !S.cats.some((c) => splitEmoji(p).name === c.name));

  openModal(`
    <h3>加单品</h3>
    <p class="m-note">衣服、鞋子、发型、包包都算单品。图片可以拖进下面的框，也可以直接 ⌘/Ctrl + V 粘贴。</p>

    <div class="dropzone" id="ap-drop" tabindex="0">
      <span class="dz-tip">把图片拖到这里 · 点一下选文件 · 或者直接粘贴</span>
      <div class="ap-thumbs" id="ap-thumbs"></div>
    </div>

    <label>放进哪一类</label>
    <div class="chiprow" id="ap-cats">
      ${S.cats.map((c) => `<button type="button" data-cat="${esc(c.id)}">${esc(c.name)}</button>`).join('')}
      ${fresh.map((p) => `<button type="button" data-new="${esc(p)}">＋ ${esc(splitEmoji(p).name)}</button>`).join('')}
    </div>
    <input type="text" id="ap-custom" placeholder="或者自己写一类，例如：手链 / 美甲 / 香水" />

    <label for="ap-name">名字（留空就用文件名）</label>
    <input type="text" id="ap-name" placeholder="例如：碎花吊带裙" />

    <div class="m-actions">
      <button class="btn btn-go" id="ap-ok" type="button">加进衣橱</button>
      <button class="btn" id="ap-cancel" type="button">取消</button>
    </div>
  `, (close) => {
    const drop = $('#ap-drop');
    const thumbs = $('#ap-thumbs');
    const custom = $('#ap-custom');

    const paintCats = () => {
      $$('#ap-cats button').forEach((b) => {
        b.classList.toggle('on', (b.dataset.cat && b.dataset.cat === pickedCat)
          || (b.dataset.new && b.dataset.new === newCat));
      });
    };
    const paintThumbs = () => {
      thumbs.innerHTML = staged.map((s, i) =>
        `<img src="${esc(s.src)}" alt="${esc(s.name)}" title="${esc(s.name)}" data-i="${i}" />`).join('');
      $('.dz-tip', drop).textContent = staged.length
        ? `已经放了 ${staged.length} 张，点缩略图可以去掉`
        : '把图片拖到这里 · 点一下选文件 · 或者直接粘贴';
      $$('img', thumbs).forEach((im) => {
        im.onclick = (e) => { e.stopPropagation(); staged.splice(+im.dataset.i, 1); paintThumbs(); };
      });
    };
    const stage = async (files) => {
      const imgs = [...files].filter((f) => /^image\//.test(f.type));
      if (!imgs.length) { toast('没找到图片'); return; }
      for (const f of imgs) staged.push({ src: await fileToSrc(f, 1200), name: f.name });
      paintThumbs();
    };

    pasteTarget = stage;                      // 弹窗开着时，粘贴的图落到这里
    drop.onclick = () => pickFiles(true, stage);
    drop.ondragover = (e) => { if (hasFiles(e)) { e.preventDefault(); drop.classList.add('on'); } };
    drop.ondragleave = () => drop.classList.remove('on');
    drop.ondrop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      drop.classList.remove('on');
      stage(e.dataTransfer.files);
    };

    $$('#ap-cats button').forEach((b) => {
      b.onclick = () => {
        if (b.dataset.cat) { pickedCat = b.dataset.cat; newCat = null; }
        else { newCat = b.dataset.new; pickedCat = null; }
        custom.value = '';
        paintCats();
      };
    });
    custom.oninput = () => {
      newCat = custom.value.trim() || null;
      if (newCat) pickedCat = null;
      $$('#ap-cats button').forEach((b) => b.classList.remove('on'));
    };

    $('#ap-cancel').onclick = close;
    $('#ap-ok').onclick = async () => {
      if (!staged.length) { toast('先放一张图片进来'); return; }
      let catId = pickedCat;
      if (!catId) {
        const label = newCat || custom.value.trim();
        if (!label) { toast('挑一个类别'); return; }
        const { emoji, name } = splitEmoji(label);
        const exist = S.cats.find((c) => c.name === name);
        catId = exist ? exist.id : (S.cats.push({ id: uid(), name, emoji }), S.cats[S.cats.length - 1].id);
      }
      const name = $('#ap-name').value.trim();
      staged.forEach((s, i) => addItem(s.src, name ? (staged.length > 1 ? `${name}${i + 1}` : name) : s.name, catId));
      save(); renderWardrobe(); close();
      toast(`加了 ${staged.length} 件进「${catOf(catId).name}」`);
    };

    paintCats();
    paintThumbs();
  });
}

/* =====================================================================
   去人物（粗）：BodyPix 识别人形 + 从边缘向内填色，不追求精细
   模型权重放在 ../assets/models/bodypix/，不依赖 Google Storage。
   ===================================================================== */
const TFJS_VER = '3.21.0';
const TF_SCRIPTS = [
  `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core@${TFJS_VER}/dist/tf-core.min.js`,
  `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter@${TFJS_VER}/dist/tf-converter.min.js`,
  `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl@${TFJS_VER}/dist/tf-backend-webgl.min.js`,
  `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@${TFJS_VER}/dist/tf-backend-wasm.min.js`,
  `https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix@2.2.0/dist/body-pix.min.js`,
];
// Pages 不提供目录索引，必须指向具体 model JSON（权重 shard 与 JSON 同目录即可）
const BODYPIX_MODEL_URL = new URL('../assets/models/bodypix/model-stride16.json', document.baseURI).href;
let bodyPixNet = null;
const scriptOnce = new Map();

function loadScriptOnce(src) {
  if (scriptOnce.has(src)) return scriptOnce.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`脚本加载失败：${src}`));
    document.head.appendChild(s);
  });
  scriptOnce.set(src, p);
  return p;
}

async function ensureBodyPixNet(onStep) {
  if (bodyPixNet) return bodyPixNet;
  onStep?.('正在加载 TensorFlow.js…');
  for (const url of TF_SCRIPTS) await loadScriptOnce(url);
  const tf = window.tf;
  const bodyPix = window.bodyPix;
  if (!tf?.setBackend || !bodyPix?.load) throw new Error('运行库未就绪');
  onStep?.('正在初始化计算后端…');
  let backendOk = await tf.setBackend('webgl');
  await tf.ready();
  if (!backendOk) {
    if (tf.wasm?.setWasmPaths) {
      tf.wasm.setWasmPaths(`https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@${TFJS_VER}/dist/`);
    }
    backendOk = await tf.setBackend('wasm');
    await tf.ready();
  }
  if (!backendOk) throw new Error('无法启用 WebGL / WASM 计算后端');
  onStep?.('正在加载人物模型（本站）…');
  bodyPixNet = await bodyPix.load({
    architecture: 'MobileNetV1',
    outputStride: 16,
    multiplier: 0.75,
    quantBytes: 2,
    modelUrl: BODYPIX_MODEL_URL,
  });
  return bodyPixNet;
}

function dilatePersonMask(mask, w, h, radius) {
  const out = new Uint8Array(mask.length);
  const r2 = radius * radius;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const nx = x + dx; const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) out[ny * w + nx] = 1;
        }
      }
    }
  }
  mask.set(out);
}

function inpaintFromEdges(data, mask, w, h, maxIter) {
  const todo = new Uint8Array(mask);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    const next = new Uint8Array(todo);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!todo[i]) continue;
        let r = 0; let g = 0; let b = 0; let n = 0;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const j = (y + dy) * w + (x + dx);
          if (!todo[j]) {
            r += data[j * 4]; g += data[j * 4 + 1]; b += data[j * 4 + 2];
            n++;
          }
        }
        if (n) {
          data[i * 4] = r / n; data[i * 4 + 1] = g / n; data[i * 4 + 2] = b / n;
          next[i] = 0;
          changed = true;
        }
      }
    }
    if (!changed) break;
    todo.set(next);
  }
}

async function removePeopleFromImage(src, onStep) {
  const net = await ensureBodyPixNet(onStep);
  const im = await loadImg(src, true);
  const maxW = 900;
  const scale = Math.min(1, maxW / im.naturalWidth);
  const w = Math.max(1, Math.round(im.naturalWidth * scale));
  const h = Math.max(1, Math.round(im.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(im, 0, 0, w, h);

  onStep?.('正在识别画面里的人…');
  const segCfg = { internalResolution: 'medium', segmentationThreshold: 0.45, nmsRadius: 20 };
  const mask = new Uint8Array(w * h);
  if (typeof net.segmentMultiPerson === 'function') {
    const people = await net.segmentMultiPerson(c, segCfg);
    people.forEach((seg) => {
      seg.data.forEach((v, i) => { if (v) mask[i] = 1; });
    });
  }
  if (!mask.some((v) => v)) {
    const one = await net.segmentPerson(c, segCfg);
    one.data.forEach((v, i) => { if (v) mask[i] = 1; });
  }
  if (!mask.some((v) => v)) throw new Error('no person');

  dilatePersonMask(mask, w, h, 10);
  onStep?.('正在填背景（粗略）…');
  const imgData = ctx.getImageData(0, 0, w, h);
  inpaintFromEdges(imgData.data, mask, w, h, 140);
  ctx.putImageData(imgData, 0, 0);

  if (scale >= 1) return c.toDataURL('image/jpeg', 0.9);
  const full = document.createElement('canvas');
  full.width = im.naturalWidth;
  full.height = im.naturalHeight;
  full.getContext('2d').drawImage(c, 0, 0, full.width, full.height);
  return full.toDataURL('image/jpeg', 0.9);
}

async function despersonSpotPhoto() {
  const sp = curSpot();
  const src = sp && spotSrc(sp);
  if (!sp || !src) { toast('先选一张有照片的景点'); return; }
  if (!confirm(
    '【去人物 · 粗略】\n'
    + '用浏览器里的小模型认出人体，再把那块区域用周围颜色糊满。\n'
    + '第一次约 5MB 下载；效果不精细，远处小人可能还在。\n\n'
    + '确定继续？'
  )) return;
  const tip = stickyToast('准备中…');
  try {
    const out = await removePeopleFromImage(src, tip.set);
    sp.custom = out;
    sp.cleared = false;
    save(); renderStage(); renderRail();
    tip.done('好了，可继续贴穿搭 · 不满意点「恢复原图」');
  } catch (e) {
    console.warn('desperson', e);
    bodyPixNet = null;
    tip.done(`去人物失败：${e?.message || '未知错误'}`);
  }
}

/* =====================================================================
   顶部按钮 & 键盘
   ===================================================================== */
$('#btn-import').onclick = openImport;
$('#btn-add-piece').onclick = () => openAddPiece();
$('#btn-add-spot').onclick = addSpot;
$('#btn-empty-add').onclick = () => {
  const sp = curSpot();
  if (sp && !spotSrc(sp)) replaceSpotPhoto(sp); else addSpot();
};
$('#btn-export').onclick = exportPNG;
$('#btn-replace-bg').onclick = () => { const sp = curSpot(); if (sp) replaceSpotPhoto(sp); };
$('#btn-copy-day').onclick = () => copyOutfitToAllDaySpots();
$('#btn-desperson').onclick = () => despersonSpotPhoto();
$('#btn-restore-bg').onclick = () => {
  const sp = curSpot();
  if (!sp) return;
  sp.custom = null;
  sp.cleared = false;
  save(); renderStage(); renderRail();
};
$('#btn-reset').onclick = async () => {
  if (!confirm('清空所有导入的衣服、照片和搭配，回到刚打开的样子？')) return;
  await dbClear();
  try {
    await reloadTripScript();
  } catch {
    toast('行程数据没刷新，请强刷页面后再试');
    return;
  }
  S = defaultState();
  sel = null;
  save(); renderAll();
  toast('已经清空，行程已同步最新版');
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#modal').hidden) { closeModal(); return; }
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (!sel) return;
  const L = layersOf(spotKey()).find((x) => x.id === sel);
  if (!L) return;
  const step = e.shiftKey ? 0.02 : 0.005;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (moves[e.key]) {
    e.preventDefault();
    L.x = clamp(L.x + moves[e.key][0], -0.25, 1.25);
    L.y = clamp(L.y + moves[e.key][1], -0.25, 1.25);
    patchLayer(L); save();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    removeLayer(L.id);
  } else if (e.key === 'Escape') {
    sel = null; renderStage();
  }
});

function refreshDaysFromTrip(keepWardrobe) {
  const prev = S;
  const fresh = defaultState();
  S.days = fresh.days;
  S.title = fresh.title;
  S.tripRev = fresh.tripRev;
  if (keepWardrobe) {
    S.items = prev.items || [];
    S.cats = prev.cats || fresh.cats;
    S.layers = {};
  }
  const dayIds = new Set(S.days.map((d) => d.id));
  if (!dayIds.has(S.curDay)) S.curDay = S.days[0]?.id || null;
  if (!curSpot() && curDay()) S.curSpot = curDay().spots[0]?.id || null;
}

/* ------------------------------------------------------------ 启动 */
(async function boot() {
  const saved = await dbGet();
  S = saved && saved.days ? saved : defaultState();
  S.cats ||= [{ id: 'main', name: '衣服 / 裙子', emoji: '👗', fixed: true }];
  S.items ||= [];
  S.layers ||= {};

  if ((S.tripRev || 0) < TRIP_DATA_REV) {
    try {
      await reloadTripScript();
      refreshDaysFromTrip(true);
      save();
    } catch { /* 仍用缓存里的 TRIP，至少跑起来 */ }
  }

  S.days.forEach((d) => {
    d.spots = (d.spots || []).filter((s) => s.title !== '包车到米兰中央车站');
    d.spots.forEach((s) => {
      if (s.title === '打车前往梵蒂冈圣彼得广场') s.title = '梵蒂冈圣彼得广场';
      if (s.title === '退房寄行李，打车去真理之口') s.title = '真理之口';
      if (s.title === '真理之口步行上山 → 橘子公园') s.title = '橘子公园';
      if (s.title === 'Tibidabo 圣心大教堂') s.title = '圣心大教堂';
      if (s.title === '厦门 T3 → 新加坡樟宜 T1') s.title = '厦门 T3 起飞';
    });
  });
  if (!curDay() && S.days[0]) S.curDay = S.days[0].id;
  if (!curSpot() && curDay()) S.curSpot = curDay().spots[0]?.id || null;
  renderAll();
  syncStickyTop();
})();

})();
