/* Renders the itinerary page from window.TRIP (data/trip-data.js). */
(function () {
  'use strict';

  const T = window.TRIP;
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const img = (key) => `assets/img/${key}.jpg`;

  // Tall phone photos shouldn't be forced into a 3:2 crop.
  function markPhotoOrientation(im, onPortrait) {
    const apply = () => {
      if (!im.naturalWidth) return;
      const portrait = im.naturalHeight > im.naturalWidth;
      im.classList.toggle('is-portrait', portrait);
      im.classList.toggle('is-landscape', !portrait);
      if (onPortrait) onPortrait(portrait);
    };
    if (im.complete) apply();
    else im.addEventListener('load', apply, { once: true });
  }

  const KIND_ICON = {
    flight: '✈', train: '🚆', transfer: '🚕', car: '🚗', sight: '◎',
    food: '🍽', shop: '🛍', night: '🌙', hotel: '🛏', rest: '☕',
  };

  const CREW_EMOJI = Object.fromEntries((T.crew || []).map((c) => [c.name, c.emoji]));

  /* =============================================================== hero */
  function renderHero() {
    const m = T.meta;
    $('#hero-kicker').textContent =
      `${m.start.replace(/-/g, '.')} — ${m.end.replace(/-/g, '.')} · ${m.travellers} 个女孩子`;
    const nights = T.cities.reduce((s, c) => s + (c.nights || 0), 0);
    const stops = T.cities.filter((c) => c.kind === 'stay' || c.kind === 'daytrip').length;
    $('#hero-sub').innerHTML =
      `五个人一路向南，<span class="hl">住 ${nights} 晚、走 ${stops} 座城</span>` +
      `<span class="hero-route">${m.subtitle}</span>`;

    const crew = $('#hero-crew');
    (T.crew || []).forEach((c) => {
      const chip = el('span', 'crew-chip');
      chip.appendChild(el('span', 'em', c.emoji));
      chip.appendChild(el('span', null, c.name));
      crew.appendChild(chip);
    });

    const sightCount = T.days.reduce(
      (n, d) => n + d.items.filter((it) => it.kind === 'sight').length,
      0
    );

    const stats = $('#hero-stats');
    m.stats.forEach((s) => {
      const box = el('div', 'hero-stat');
      box.appendChild(el('span', 'hero-stat-label', s.label));
      const v = el('div', 'hero-stat-value');
      v.textContent = s.value === 'sights' ? String(sightCount) : s.value;
      v.appendChild(el('span', 'hero-stat-unit', s.unit));
      box.appendChild(v);
      stats.appendChild(box);
    });

    const cd = $('#hero-countdown');
    const days = Math.ceil((new Date(m.start + 'T00:00:00') - new Date()) / 86400000);
    if (days > 0) {
      cd.innerHTML = `距出发还有 <strong>${days}</strong> 天`;
    } else if (days === 0) {
      cd.innerHTML = '<strong>今天</strong> 出发';
    } else {
      const back = Math.ceil((new Date(m.end + 'T00:00:00') - new Date()) / 86400000);
      cd.innerHTML = back >= 0 ? '<strong>旅途中</strong>' : '行程已结束';
    }
  }

  /* ================================================================ map */
  function renderMap() {
    const svg = $('#euro-map');
    const geo = window.EUROPE_GEO;
    const W = 800, H = 620, PAD = 34;

    // Window chosen to frame Paris (48.9N) down to Mallorca (39.3N) with air around it.
    const lonMin = -6, lonMax = 20, latMin = 35.5, latMax = 52.5;

    // Mercator y keeps the shapes recognisable across this latitude span.
    const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
    const yMin = mercY(latMax), yMax = mercY(latMin);
    const sx = (W - PAD * 2) / (lonMax - lonMin);
    const sy = (H - PAD * 2) / (yMax - yMin);

    const px = (lon) => PAD + (lon - lonMin) * sx;
    const py = (lat) => PAD + (mercY(lat) - yMin) * sy;

    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs) => {
      const n = document.createElementNS(NS, tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      return n;
    };

    // sea background
    svg.appendChild(mk('rect', { x: 0, y: 0, width: W, height: H, fill: 'var(--water)' }));

    // graticule every 5°
    const grat = mk('g', { class: 'graticule' });
    for (let lon = -5; lon <= lonMax; lon += 5) {
      grat.appendChild(mk('line', { x1: px(lon), y1: PAD, x2: px(lon), y2: H - PAD }));
    }
    for (let lat = 40; lat <= 50; lat += 5) {
      grat.appendChild(mk('line', { x1: PAD, y1: py(lat), x2: W - PAD, y2: py(lat) }));
    }
    svg.appendChild(grat);

    // land
    const land = mk('g', { class: 'land' });
    (geo.features || []).forEach((f) => {
      f.geometry.coordinates.forEach((poly) => {
        const d = poly
          .map((ring) => ring.map((p, i) => `${i ? 'L' : 'M'}${px(p[0]).toFixed(1)} ${py(p[1]).toFixed(1)}`).join('') + 'Z')
          .join('');
        land.appendChild(mk('path', { d }));
      });
    });
    svg.appendChild(land);

    [
      { t: 'MEDITERRANEAN SEA', lon: 8.6, lat: 37.4 },
      { t: 'ATLANTIC', lon: -4.4, lat: 45.6 },
    ].forEach((s) => {
      const t = mk('text', { class: 'sea-label', x: px(s.lon), y: py(s.lat), 'text-anchor': 'middle' });
      t.textContent = s.t;
      svg.appendChild(t);
    });

    // route: only the cities actually visited inside Europe, in travel order
    const order = ['paris', 'como', 'venice', 'florence', 'rome', 'mallorca', 'barcelona'];
    const byId = Object.fromEntries(T.cities.map((c) => [c.id, c]));
    const legs = [
      ['paris', 'como', 'air'],
      ['como', 'venice', 'ground'],
      ['venice', 'florence', 'ground'],
      ['florence', 'rome', 'ground'],
      ['rome', 'mallorca', 'air'],
      ['mallorca', 'barcelona', 'air'],
    ];

    const routeG = mk('g', {});
    legs.forEach(([a, b, mode]) => {
      const A = byId[a], B = byId[b];
      const x1 = px(A.lon), y1 = py(A.lat), x2 = px(B.lon), y2 = py(B.lat);
      // bow the line perpendicular to the leg so overlapping legs stay readable
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const bow = Math.min(len * 0.16, 46);
      const cx = mx - (dy / len) * bow;
      const cy = my + (dx / len) * bow;
      routeG.appendChild(
        mk('path', { class: 'route-path' + (mode === 'air' ? ' air' : ''), d: `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}` })
      );
    });
    svg.appendChild(routeG);

    // city markers
    const dayByCity = {};
    T.days.forEach((d) => {
      if (!dayByCity[d.cityId]) dayByCity[d.cityId] = [];
      dayByCity[d.cityId].push(d);
    });

    const tip = $('#map-tip');
    const wrap = $('#map-wrap');
    const groups = [];

    // Manual label offsets so nothing collides.
    const OFFSET = {
      paris: [0, -16], como: [12, -12], venice: [12, 6], florence: [14, 2],
      rome: [12, 14], mallorca: [-8, 24], barcelona: [-14, -14],
    };
    const ANCHOR = { paris: 'middle', mallorca: 'middle', barcelona: 'end', como: 'start', venice: 'start', florence: 'start', rome: 'start' };

    order.forEach((id) => {
      const c = byId[id];
      const x = px(c.lon), y = py(c.lat);
      const g = mk('g', { class: 'city-group' });
      g.dataset.city = id;

      g.appendChild(mk('circle', { class: 'city-dot', cx: x, cy: y, r: 6 }));

      const [ox, oy] = OFFSET[id] || [10, -10];
      const anchor = ANCHOR[id] || 'start';
      const label = mk('text', { class: 'city-label', x: x + ox, y: y + oy, 'text-anchor': anchor });
      label.textContent = c.name;
      g.appendChild(label);

      const ds = dayByCity[id] || [];
      const sub = mk('text', { class: 'city-label-sub', x: x + ox, y: y + oy + 13, 'text-anchor': anchor });
      sub.textContent = c.nights ? `${c.nights} 晚` : '当日往返';
      g.appendChild(sub);

      g.appendChild(mk('circle', { class: 'city-hit', cx: x, cy: y, r: 20 }));

      const showTip = () => {
        const dayList = ds.map((d) => `Day ${d.n} · ${d.date}`).join(' / ');
        tip.innerHTML = `<b>${c.name}</b><span>${c.country}${c.nights ? ' · ' + c.nights + ' 晚' : ''}</span><span>${dayList || '中转'}</span>`;
        tip.hidden = false;
        const box = wrap.getBoundingClientRect();
        tip.style.left = (x / W) * box.width + 'px';
        tip.style.top = (y / H) * box.height + 'px';
        groups.forEach((o) => o.classList.toggle('dim', o !== g));
      };
      const hideTip = () => {
        tip.hidden = true;
        groups.forEach((o) => o.classList.remove('dim'));
      };

      g.addEventListener('mouseenter', showTip);
      g.addEventListener('mouseleave', hideTip);
      g.addEventListener('click', () => {
        const first = ds[0];
        if (first) document.getElementById('day-' + first.n)?.scrollIntoView({ block: 'start' });
      });

      groups.push(g);
      svg.appendChild(g);
    });
  }

  /* ==================================================== long haul + nights */
  function renderRouteSide() {
    const list = $('#longhaul-list');
    [
      ['9.23', '厦门 T3 → 新加坡樟宜 T1', '21:30–01:40'],
      ['9.24', '新加坡樟宜 T1 → 多哈哈马德', '19:40–22:00'],
      ['9.25', '多哈哈马德 → 巴黎戴高乐 T1', '01:30–07:30'],
      ['10.6', '巴塞罗那埃尔普拉特 T1 → 多哈', '22:50–05:50'],
    ].forEach(([d, route, time]) => {
      const li = el('li');
      li.appendChild(el('time', null, d));
      const box = el('div');
      box.appendChild(el('div', null, route));
      box.appendChild(el('div', 'nights-num', time));
      li.appendChild(box);
      list.appendChild(li);
    });

    const bars = $('#nights-bars');
    const stays = T.cities.filter((c) => c.nights);
    const max = Math.max(...stays.map((c) => c.nights));
    stays.forEach((c) => {
      const row = el('div', 'nights-row');
      row.appendChild(el('span', null, c.name));
      const track = el('div', 'nights-track');
      const fill = el('div', 'nights-fill');
      fill.style.width = (c.nights / max) * 100 + '%';
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('span', 'nights-num', c.nights + ' 晚'));
      bars.appendChild(row);
    });

    const chain = $('#route-chain');
    T.cities.forEach((c, i) => {
      if (i) chain.appendChild(el('span', 'chain-arrow', '→'));
      const item = el('span', 'chain-item');
      const im = document.createElement('img');
      im.src = img(c.img);
      im.alt = '';
      im.loading = 'lazy';
      item.appendChild(im);
      item.appendChild(el('span', null, c.name));
      item.appendChild(el('span', 'nights-tag', c.nights ? c.nights + '晚' : c.kind === 'transit' ? '中转' : '当日'));
      chain.appendChild(item);
    });
  }

  /* =========================================================== timeline */
  function renderOutfit(o) {
    const box = el('div', 'day-outfit');
    const head = el('div', 'day-outfit-head');
    head.appendChild(el('span', 'day-outfit-icon', '👗'));
    head.appendChild(el('h4', null, '今日穿搭'));
    if (o.summary) head.appendChild(el('p', 'day-outfit-summary', o.summary));
    box.appendChild(head);

    if (o.lines && o.lines.length) {
      const ul = el('ul', 'day-outfit-list');
      o.lines.forEach((line) => {
        const li = el('li', line.startsWith('⛪') ? 'is-church' : null, line);
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    return box;
  }

  function planItem(it) {
    const li = el('li');
    li.appendChild(el('div', 'plan-time', it.time || ''));
    li.appendChild(el('div', 'plan-icon', KIND_ICON[it.kind] || '·'));

    const main = el('div', 'plan-main');
    const title = el('div', 'plan-title');
    title.appendChild(el('span', null, it.title));
    if (it.status === 'booked') title.appendChild(el('span', 'chip chip-booked', '已订'));
    if (it.status === 'todo') title.appendChild(el('span', 'chip chip-todo', '待预约'));
    main.appendChild(title);

    if (it.note) main.appendChild(el('p', 'plan-note', it.note));

    if (it.links && it.links.length) {
      const box = el('div', 'plan-links');
      it.links.forEach((lnk) => {
        const a = document.createElement('a');
        a.href = lnk.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = lnk.label;
        box.appendChild(a);
      });
      main.appendChild(box);
    }

    if (it.food) {
      const box = el('div', 'food-box');
      box.appendChild(el('h4', null, it.food.title));
      it.food.groups.forEach((g) => {
        const grp = el('div', 'food-group');
        grp.appendChild(el('div', 'food-label', g.label));
        const ul = el('ul');
        g.lines.forEach((l) => ul.appendChild(el('li', null, l)));
        grp.appendChild(ul);
        box.appendChild(grp);
      });
      main.appendChild(box);
    }

    li.appendChild(main);

    const photo = el('div', 'plan-photo');
    if (it.img) {
      const im = document.createElement('img');
      im.className = 'plan-thumb';
      im.src = img(it.img);
      im.alt = it.title;
      im.loading = 'lazy';
      im.dataset.cap = it.title;
      markPhotoOrientation(im);
      photo.appendChild(im);
    }
    li.appendChild(photo);
    return li;
  }

  function dayCard(d) {
    const card = el('article', 'day-card');
    card.id = 'day-' + d.n;
    card.dataset.city = d.cityId;

    const head = el('div', 'day-head');

    const photo = el('div', 'day-photo');
    const pim = document.createElement('img');
    pim.src = img(d.img);
    pim.alt = d.city;
    pim.loading = d.n <= 2 ? 'eager' : 'lazy';
    markPhotoOrientation(pim, (portrait) => {
      if (portrait) photo.classList.add('is-portrait');
    });
    photo.appendChild(pim);
    photo.appendChild(el('span', 'day-num', d.n === 0 ? 'DAY 0' : 'DAY ' + d.n));
    head.appendChild(photo);

    const meta = el('div', 'day-meta');
    const row = el('div', 'day-date-row');
    row.appendChild(el('span', 'day-date', d.date));
    row.appendChild(el('span', 'day-weekday', d.weekday));
    if (d.intense) {
      const b = el('span', 'badge-intense');
      b.textContent = '⚡ 硬仗日';
      row.appendChild(b);
    }
    meta.appendChild(row);
    meta.appendChild(el('div', 'day-city', d.city));
    meta.appendChild(el('p', 'day-theme', d.theme));
    head.appendChild(meta);
    card.appendChild(head);

    const body = el('div', 'day-body');
    if (d.outfit) body.appendChild(renderOutfit(d.outfit));
    const ul = el('ul', 'plan');
    d.items.forEach((it) => ul.appendChild(planItem(it)));
    body.appendChild(ul);

    if (d.hotel) {
      const h = el('div', 'hotel-box');
      h.appendChild(el('span', 'hotel-label', '住 ' + (d.hotel.nights || '')));
      h.appendChild(el('span', 'hotel-name', d.hotel.name));
      if (d.hotel.addr) h.appendChild(el('span', 'hotel-detail', d.hotel.addr));
      if (d.hotel.tel) {
        const a = document.createElement('a');
        a.href = 'tel:' + d.hotel.tel.replace(/\s/g, '');
        a.textContent = d.hotel.tel;
        h.appendChild(a);
      }
      if (d.hotel.mail) {
        const a = document.createElement('a');
        a.href = 'mailto:' + d.hotel.mail;
        a.textContent = d.hotel.mail;
        h.appendChild(a);
      }
      body.appendChild(h);
    }

    if (d.tips && d.tips.length) {
      const ul2 = el('ul', 'day-tips');
      d.tips.forEach((t) => ul2.appendChild(el('li', null, t)));
      body.appendChild(ul2);
    }

    card.appendChild(body);
    return card;
  }

  function renderTimeline() {
    const tl = $('#timeline');
    T.days.forEach((d) => tl.appendChild(dayCard(d)));

    // City filter, built from the order the cities are visited.
    const seen = [];
    T.days.forEach((d) => { if (!seen.includes(d.cityId)) seen.push(d.cityId); });
    const byId = Object.fromEntries(T.cities.map((c) => [c.id, c]));

    const bar = $('#day-filter');
    const mkBtn = (label, city) => {
      const b = el('button', 'filter-btn', label);
      b.type = 'button';
      b.dataset.city = city;
      b.addEventListener('click', () => {
        bar.querySelectorAll('.filter-btn').forEach((x) => x.classList.toggle('active', x === b));
        tl.querySelectorAll('.day-card').forEach((c) => {
          c.hidden = city !== 'all' && c.dataset.city !== city;
        });
      });
      return b;
    };
    const all = mkBtn('全部 14 天', 'all');
    all.classList.add('active');
    bar.appendChild(all);
    seen.forEach((id) => {
      const n = T.days.filter((d) => d.cityId === id).length;
      bar.appendChild(mkBtn(`${byId[id].name} · ${n} 天`, id));
    });
  }

  /* ========================================================== transport */
  const MODE_LABEL = { flight: '✈ 飞机', train: '🚆 火车', ferry: '⛴ 轮渡', car: '🚗 自驾' };
  const STATUS_LABEL = {
    booked: ['chip chip-booked', '已订'],
    todo: ['chip chip-todo', '待预约'],
    onsite: ['chip chip-onsite', '现场买'],
  };

  function renderEuroLegs() {
    const table = $('#legs-table');
    table.innerHTML =
      '<thead><tr><th>日期</th><th>时间</th><th>区间</th><th>方式</th><th>状态</th></tr></thead>';
    const tb = el('tbody');
    T.euroLegs.forEach((l) => {
      const tr = el('tr', l.status === 'todo' ? 'row-unsettled' : '');
      tr.appendChild(el('td', 'muted', l.date));
      tr.appendChild(el('td', 'num', l.time));

      const seg = el('td');
      seg.appendChild(el('div', null, `${l.from} → ${l.to}`));
      if (l.ref) seg.appendChild(el('div', 'muted', l.ref));
      tr.appendChild(seg);

      tr.appendChild(el('td', null, MODE_LABEL[l.mode] || l.mode));

      const [cls, text] = STATUS_LABEL[l.status] || ['', l.status];
      const st = el('td');
      st.appendChild(el('span', cls, text));
      tr.appendChild(st);

      tb.appendChild(tr);
    });
    table.appendChild(tb);
  }

  function renderTransfers() {
    const host = $('#transfer-list');
    T.transfers.forEach((t) => {
      const li = el('li', 'transfer ' + t.dir);
      const head = el('div', 'tr-head');
      head.appendChild(el('span', 'tr-date', t.date));
      head.appendChild(el('span', 'tr-kind', t.dir === 'pickup' ? '接机' : '送机'));
      head.appendChild(el('span', 'tr-time', t.time));
      li.appendChild(head);

      li.appendChild(el('div', 'tr-route', `${t.from} → ${t.to}`));
      if (t.flight) li.appendChild(el('div', 'tr-flight', '航班 ' + t.flight));
      if (t.note) li.appendChild(el('p', 'tr-note', t.note));
      host.appendChild(li);
    });
  }

  /* ============================================================ weather */
  function wxIcon(wet, high) {
    if (wet >= 0.55) return '🌧';
    if (wet >= 0.35) return '🌦';
    if (wet >= 0.22) return '🌤';
    return high >= 24 ? '☀' : '🌤';
  }

  function renderWeather() {
    const w = T.weather;
    $('#weather-lede').textContent =
      `出发还早，真正的天气预报要到出发前两周才有。下面是${w.source}，用来决定行李里装什么足够了。`;

    const grid = $('#weather-grid');
    w.places.forEach((p) => {
      const card = el('div', 'wx-card');
      card.dataset.key = p.key;

      const top = el('div', 'wx-top');
      top.appendChild(el('span', 'wx-icon', wxIcon(p.wet, p.high)));
      const who = el('div', 'wx-who');
      who.appendChild(el('div', 'wx-city', p.label));
      who.appendChild(el('div', 'wx-days', p.days));
      top.appendChild(who);
      card.appendChild(top);

      const temp = el('div', 'wx-temp');
      temp.appendChild(el('b', null, Math.round(p.high) + '°'));
      temp.appendChild(el('span', null, ' / ' + Math.round(p.low) + '°'));
      card.appendChild(temp);

      const rain = el('div', 'wx-rain');
      rain.appendChild(el('span', 'wx-rain-num', '下雨概率 ' + Math.round(p.wet * 100) + '%'));
      const bar = el('span', 'wx-bar');
      const fill = el('i');
      fill.style.width = Math.round(p.wet * 100) + '%';
      bar.appendChild(fill);
      rain.appendChild(bar);
      card.appendChild(rain);

      card.appendChild(el('p', 'wx-hint', p.hint));
      grid.appendChild(card);
    });

    liveForecast();
  }

  /* Once the trip is inside Open-Meteo's forecast horizon, replace the ten-year
     averages with the real thing. Fails silently offline. */
  async function liveForecast() {
    const w = T.weather;
    const daysOut = Math.ceil((new Date(T.meta.start + 'T00:00:00') - new Date()) / 86400000);
    if (daysOut > 15) return;

    const byId = Object.fromEntries(T.cities.map((c) => [c.id, c]));
    const results = await Promise.all(
      w.places.map(async (p) => {
        const c = byId[p.key];
        if (!c) return null;
        const url =
          'https://api.open-meteo.com/v1/forecast' +
          `?latitude=${c.lat}&longitude=${c.lon}` +
          `&start_date=${p.start}&end_date=${p.end}&timezone=auto` +
          '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max';
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          const d = (await res.json()).daily;
          const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
          return {
            key: p.key,
            high: avg(d.temperature_2m_max),
            low: avg(d.temperature_2m_min),
            wet: avg(d.precipitation_probability_max) / 100,
          };
        } catch (e) {
          return null;
        }
      })
    );

    const good = results.filter(Boolean);
    if (!good.length) return;

    good.forEach((r) => {
      const card = document.querySelector(`.wx-card[data-key="${r.key}"]`);
      if (!card) return;
      card.classList.add('wx-live');
      card.querySelector('.wx-icon').textContent = wxIcon(r.wet, r.high);
      card.querySelector('.wx-temp').innerHTML =
        `<b>${Math.round(r.high)}°</b><span> / ${Math.round(r.low)}°</span>`;
      card.querySelector('.wx-bar i').style.width = Math.round(r.wet * 100) + '%';
      card.querySelector('.wx-rain-num').textContent = '下雨概率 ' + Math.round(r.wet * 100) + '%';
    });
    $('#weather-lede').textContent = '出发日期已经进入预报范围，下面是 Open-Meteo 的实时预报。';
  }

  /* =============================================================== oath */
  function renderOath() {
    const o = T.oath;
    const card = $('#oath-card');
    card.appendChild(el('p', 'oath-lead', o.lead));

    const ol = el('ol', 'oath-list');
    o.lines.forEach((l) => ol.appendChild(el('li', null, l)));
    card.appendChild(ol);

    const motto = el('div', 'oath-motto');
    o.motto.forEach((m) => motto.appendChild(el('p', null, m)));
    card.appendChild(motto);

    const sign = el('div', 'oath-sign');
    (T.crew || []).forEach((c) => {
      const chip = el('span', 'oath-name');
      chip.appendChild(el('span', 'em', c.emoji));
      chip.appendChild(el('span', null, c.name));
      sign.appendChild(chip);
    });
    card.appendChild(sign);
  }

  /* ============================================================ packing */
  const STORE_KEY = 'trip-packing-v1';

  function renderPacking() {
    const list = $('#packing-list');
    let state = {};
    try { state = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { state = {}; }

    const save = () => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
    };

    const ring = $('#packing-progress');
    ring.innerHTML =
      '<svg width="62" height="62" viewBox="0 0 62 62">' +
      '<circle class="ring-bg" cx="31" cy="31" r="26" />' +
      '<circle class="ring-fg" cx="31" cy="31" r="26" />' +
      '<text class="ring-text" x="31" y="36"></text></svg>' +
      '<span class="ring-caption"></span>';
    const fg = ring.querySelector('.ring-fg');
    const txt = ring.querySelector('.ring-text');
    const cap = ring.querySelector('.ring-caption');
    const C = 2 * Math.PI * 26;
    fg.setAttribute('stroke-dasharray', C.toFixed(1));

    const total = T.packing.length;
    const update = () => {
      const done = T.packing.filter((p) => state[p.item]).length;
      const pct = total ? done / total : 0;
      fg.setAttribute('stroke-dashoffset', (C * (1 - pct)).toFixed(1));
      txt.textContent = Math.round(pct * 100) + '%';
      cap.textContent = `${done} / ${total} 项已备齐`;
    };

    T.packing.forEach((p) => {
      const li = el('li');
      const label = el('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!state[p.item];
      cb.addEventListener('change', () => {
        if (cb.checked) state[p.item] = 1; else delete state[p.item];
        save();
        update();
      });
      label.appendChild(cb);

      const box = el('div');
      box.appendChild(el('span', 'pack-name', p.item));
      if (p.who || p.note) {
        const meta = el('span', 'pack-meta');
        // "河豚、墨凝" becomes one badge per girl, each with her own emoji
        p.who.split(/[、,，]/).map((s) => s.trim()).filter(Boolean).forEach((name) => {
          const all = name === '全员';
          const w = el('span', 'pack-who' + (all ? ' all' : ''));
          w.appendChild(el('span', 'em', all ? '👭' : CREW_EMOJI[name] || '✿'));
          w.appendChild(document.createTextNode(name));
          meta.appendChild(w);
        });
        if (p.note) meta.appendChild(document.createTextNode(p.note));
        box.appendChild(meta);
      }
      label.appendChild(box);
      li.appendChild(label);
      list.appendChild(li);
    });

    update();

    $('#packing-reset').addEventListener('click', () => {
      state = {};
      save();
      list.querySelectorAll('input').forEach((i) => { i.checked = false; });
      update();
    });
  }

  /* =========================================================== lightbox */
  function initLightbox() {
    const box = $('#lightbox');
    const im = $('#lightbox-img');
    const cap = $('#lightbox-cap');
    const close = () => { box.hidden = true; };

    document.addEventListener('click', (e) => {
      const t = e.target;
      if (t.classList && t.classList.contains('plan-thumb')) {
        im.src = t.src;
        im.alt = t.alt;
        cap.textContent = t.dataset.cap || t.alt || '';
        box.hidden = false;
      }
    });
    $('#lightbox-close').addEventListener('click', close);
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }

  /* ============================================================ chrome */
  function initChrome() {
    const bar = $('#scroll-progress');
    const links = Array.from(document.querySelectorAll('.topnav a'));
    const sections = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);

    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + '%';

      const mid = window.scrollY + window.innerHeight * 0.32;
      let active = -1;
      sections.forEach((s, i) => { if (s.offsetTop <= mid) active = i; });
      links.forEach((a, i) => a.classList.toggle('active', i === active));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ============================================================ credits */
  function initCredits() {
    const btn = $('#credits-toggle');
    const host = $('#credits');
    let loaded = false;

    btn.addEventListener('click', async () => {
      if (!host.hidden) { host.hidden = true; btn.textContent = '查看图片来源'; return; }
      host.hidden = false;
      btn.textContent = '收起图片来源';
      if (loaded) return;
      loaded = true;
      try {
        const res = await fetch('data/credits.json');
        const data = await res.json();
        Object.entries(data).forEach(([key, info]) => {
          const d = el('div');
          const a = document.createElement('a');
          a.href = info.source;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = info.file;
          d.appendChild(document.createTextNode(key + ' — '));
          d.appendChild(a);
          if (info.license) d.appendChild(document.createTextNode(' · ' + info.license));
          if (info.author) d.appendChild(document.createTextNode(' · ' + info.author));
          host.appendChild(d);
        });
      } catch (e) {
        host.textContent = '图片来源清单在 data/credits.json（用 http 打开本页才能加载）。';
      }
    });
  }

  /* =============================================================== boot */
  renderHero();
  renderMap();
  renderRouteSide();
  renderWeather();
  renderTimeline();
  renderEuroLegs();
  renderTransfers();
  renderPacking();
  renderOath();
  initLightbox();
  initChrome();
  initCredits();
})();
