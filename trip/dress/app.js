/* ===================================================================
   👗 旅行穿搭台
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

function defaultState() {
  const T = window.TRIP;
  const days = (T?.days || []).map((d) => {
    const spots = [];
    const seen = new Set();
    const add = (title, time, key) => {
      if (!key || seen.has(key)) return;
      seen.add(key);
      spots.push({ id: uid(), title, time: time || '', base: IMG(key), custom: null });
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
      tip: d.outfit || null,
      spots,
      look: [],
    };
  });

  return {
    v: 1,
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
  renderTip();
  renderWardrobe();
  renderDayLook();
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
  $('#btn-replace-bg').textContent = src ? '📷 换这张照片' : '📷 加张照片';
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
    el.appendChild(handle('h-del', '✕', (e) => {
      e.stopPropagation();
      removeLayer(L.id);
    }));
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
    <span class="lb-group">透明<input type="range" id="lb-op" min="20" max="100" value="${Math.round(L.op * 100)}" /></span>
    <span class="lb-group">角度<input type="range" id="lb-rot" min="-180" max="180" value="${Math.round(L.rot)}" /></span>
    <button class="btn btn-sm" id="lb-flip">⇋ 镜像</button>
    <button class="btn btn-sm" id="lb-top">⬆ 置顶</button>
    <button class="btn btn-sm btn-danger" id="lb-del">✕ 删掉</button>
  `;

  const live = (id, fn) => {
    const input = $('#' + id, bar);
    input.oninput = () => { fn(+input.value); patchLayer(L); };
    input.onchange = save;
  };
  live('lb-size', (v) => { L.w = v / 100; });
  live('lb-op', (v) => { L.op = v / 100; });
  live('lb-rot', (v) => { L.rot = v; });

  $('#lb-flip', bar).onclick = () => { L.flip = !L.flip; save(); patchLayer(L); };
  $('#lb-top', bar).onclick = () => {
    const list2 = layersOf(spotKey());
    const i = list2.indexOf(L);
    list2.splice(i, 1); list2.push(L);
    save(); renderStage();
  };
  $('#lb-del', bar).onclick = () => removeLayer(L.id);
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
  save(); renderStage(); renderDayStrip();
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
        : '<div class="spot-blank"><span>＋<br />加照片</span></div>'}
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
  add.innerHTML = '<span>＋<br />加一个地点</span>';
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

/* ---------------------------------------------------- 当天穿搭小贴士 */
function renderTip() {
  const d = curDay();
  const box = $('#outfit-tip');
  if (!d?.tip) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML =
    `<h4>👖 这天的穿衣提醒 · ${esc(d.tip.summary || '')}</h4>` +
    (d.tip.lines?.length ? `<ul>${d.tip.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '');
}

/* ---------------------------------------------------------------- 衣橱 */
function renderWardrobe() {
  const box = $('#wd-cats');
  box.innerHTML = '';
  const d = curDay();

  S.cats.forEach((cat) => {
    const wrap = document.createElement('div');
    wrap.className = 'cat';
    wrap.dataset.cat = cat.id;
    wrap.innerHTML = `<div class="cat-head"><span>${esc(cat.emoji || '🧺')}</span><span>${esc(cat.name)}</span>
      ${cat.fixed ? '' : '<button class="cat-del" type="button">删类别</button>'}</div>`;

    const grid = document.createElement('div');
    grid.className = 'grid';

    S.items.filter((i) => i.cat === cat.id).forEach((it) => {
      const inDay = d?.look.includes(it.id);
      const el = document.createElement('div');
      el.className = 'piece' + (it.useCut ? ' cut' : '') + (inDay ? ' inday' : '');
      el.dataset.item = it.id;
      el.innerHTML = `
        <img src="${esc(it.useCut && it.cut ? it.cut : it.src)}" alt="${esc(it.name)}" />
        <div class="piece-n" title="${esc(it.name)}">${esc(it.name)}</div>
        <div class="piece-tools">
          <button type="button" data-a="cut" title="一键去白底">✂</button>
          <button type="button" data-a="ren" title="改名字">✎</button>
          <button type="button" data-a="del" title="删掉">✕</button>
        </div>`;
      el.querySelector('[data-a=cut]').onclick = (e) => { e.stopPropagation(); toggleCut(it); };
      el.querySelector('[data-a=ren]').onclick = (e) => {
        e.stopPropagation();
        const v = prompt('给它起个名字', it.name);
        if (v) { it.name = v.slice(0, 20); save(); renderWardrobe(); renderDayLook(); }
      };
      el.querySelector('[data-a=del]').onclick = (e) => {
        e.stopPropagation();
        if (!confirm(`把「${it.name}」从衣橱里删掉？已经搭到照片上的也会消失。`)) return;
        S.items = S.items.filter((x) => x.id !== it.id);
        S.days.forEach((dd) => { dd.look = dd.look.filter((x) => x !== it.id); });
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
      S.days.forEach((dd) => { dd.look = dd.look.filter((x) => !ids.includes(x)); });
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
  if (last && curDay() && !curDay().look.includes(last.id)) curDay().look.push(last.id);
  save(); renderWardrobe(); renderDayLook();
  return made;
}

function importPieces(catId) {
  pickFiles(true, async (files) => {
    const made = await addItemsFromFiles(files, catId);
    if (made.length) toast('导好了，拖到左边照片上试试');
  });
}

async function toggleCut(it) {
  if (it.cut) {
    it.useCut = !it.useCut;
  } else {
    toast('正在去白底…');
    try { it.cut = await cutoutWhite(it.src); it.useCut = true; }
    catch { toast('这张去不掉，换一张试试'); return; }
  }
  save(); renderWardrobe(); renderStage(); renderDayLook();
}

function toggleInDay(it) {
  const d = curDay();
  if (!d) return;
  const i = d.look.indexOf(it.id);
  if (i < 0) { d.look.push(it.id); toast(`已加进 ${d.date} 的穿搭`); }
  else { d.look.splice(i, 1); }
  save(); renderWardrobe(); renderDayLook();
}

/* ------------------------------------------------------------ Day 穿搭 */
function renderDayLook() {
  const box = $('#daylook');
  const d = curDay();
  box.innerHTML = '';
  if (!d || !d.look.length) {
    box.innerHTML = '<p class="empty">这一天还没用过单品。点上面衣橱里的，就会贴到照片上。</p>';
    return;
  }
  d.look.forEach((id) => {
    const it = itemById(id);
    if (!it) return;
    const el = document.createElement('div');
    el.className = 'dl-item';
    el.innerHTML = `<img src="${esc(it.useCut && it.cut ? it.cut : it.src)}" alt="${esc(it.name)}" title="${esc(it.name)}" />
      <button class="dl-x" type="button">✕</button>`;
    el.querySelector('.dl-x').onclick = (e) => {
      e.stopPropagation();
      d.look = d.look.filter((x) => x !== id);
      save(); renderWardrobe(); renderDayLook();
    };
    wirePieceDrag(el, it, () => placeOnPhoto(it));
    box.appendChild(el);
  });
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
  const d = curDay();
  if (d && !d.look.includes(it.id)) d.look.push(it.id);
  const L = {
    id: uid(), itemId: it.id, src: null,
    x: at.x, y: at.y, w: 0.36, rot: 0, op: 1, flip: false,
  };
  layersOf(spotKey()).push(L);
  sel = L.id;
  save(); renderStage(); renderRail(); renderDayStrip(); renderWardrobe(); renderDayLook();
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
    tip: o.outfit || null,
    spots: (o.spots || []).map((s) => ({
      id: uid(),
      title: s.title || '未命名地点',
      time: s.time || '',
      base: s.img || s.image || PLACEHOLDER,
      custom: null,
    })),
    look: [],
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
      ${S.cats.map((c) => `<button type="button" data-cat="${esc(c.id)}">${esc(c.emoji)} ${esc(c.name)}</button>`).join('')}
      ${fresh.map((p) => `<button type="button" data-new="${esc(p)}">＋ ${esc(p)}</button>`).join('')}
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
      const last = S.items[S.items.length - 1];
      if (curDay() && !curDay().look.includes(last.id)) curDay().look.push(last.id);
      save(); renderWardrobe(); renderDayLook(); close();
      toast(`加了 ${staged.length} 件进「${catOf(catId).name}」`);
    };

    paintCats();
    paintThumbs();
  });
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
  S = defaultState();
  sel = null;
  save(); renderAll();
  toast('已经清空');
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

/* ------------------------------------------------------------ 启动 */
(async function boot() {
  const saved = await dbGet();
  S = saved && saved.days ? saved : defaultState();
  // 老数据缺字段时补齐
  S.cats ||= [{ id: 'main', name: '衣服 / 裙子', emoji: '👗', fixed: true }];
  S.items ||= [];
  S.layers ||= {};
  S.days.forEach((d) => { d.look ||= []; });
  if (!curDay() && S.days[0]) S.curDay = S.days[0].id;
  if (!curSpot() && curDay()) S.curSpot = curDay().spots[0]?.id || null;
  renderAll();
  syncStickyTop();
})();

})();
