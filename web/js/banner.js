/* M-Alert — bandeaux d'alerte « façon NHK » dessinés sur un canvas (partagé par M-alert et
 * M-Alert-sender : image téléchargeable dans le sender, incrustation OBS).
 *
 *   MAlertBanner.drawBanner(canvas, alert)        bandeau : carte à gauche, titre rouge (ou à la
 *                                                 couleur du niveau), texte et lieux sur fond bleu
 *   MAlertBanner.drawTsunamiMap(canvas, alert, on) carte des côtes en alerte tsunami (clignotement :
 *                                                 on = côtes allumées), légende à droite
 *
 * Données : window.MALERT_DEPARTMENTS (contours, [lon, lat]) et window.MALERT_COASTS (côtes par
 * département, [lat, lon]), chargées avant ce fichier.
 */
(function () {
  'use strict';

  const M = window.MAlert;
  const FONT = '"Noto Sans", "Segoe UI", "Helvetica Neue", Arial, sans-serif';

  // Couleurs proches des bandeaux de la NHK.
  const C = {
    frame: '#000',
    sea: '#1f3f8f',
    land: '#9aa1a9',
    landLine: '#6b7280',
    body: '#2f6fd0',
    bodyLine: '#9cc3ff',
    yellow: '#fff200',
    white: '#ffffff',
    red: '#e60012',
    zone: '#f2d500',
  };
  const LEVEL_FILL = { 1: '#5aa0ff', 2: '#f2d500', 3: '#ff8c00', 4: '#e60012', 5: '#e040fb' };
  const LEVEL_TEXT = { 1: '#fff', 2: '#111', 3: '#111', 4: '#fff', 5: '#fff' };
  const TSU_COLORS = { 5: '#d500f9', 4: '#e60012', 2: '#f2d500' };
  const TSU_NAMES = { 5: 'Avertissement majeur', 4: 'Avertissement', 2: 'Avis de tsunami' };

  // « Attention à … dans ces lieux » selon le type d'alerte (phénomènes météo : code M-Alert).
  const WATCH = {
    seisme: 'Attention aux secousses fortes dans ces lieux indiqués :',
    tsunami: 'Attention au tsunami sur les côtes indiquées :',
    missile: 'Abritez-vous immédiatement dans ces lieux indiqués :',
    1: 'Attention au vent violent dans ces lieux indiqués :',
    2: 'Attention aux pluies et aux inondations dans ces lieux indiqués :',
    3: 'Attention aux orages dans ces lieux indiqués :',
    4: 'Attention aux crues dans ces lieux indiqués :',
    5: 'Attention à la neige et au verglas dans ces lieux indiqués :',
    6: 'Attention à la canicule dans ces lieux indiqués :',
    7: 'Attention au grand froid dans ces lieux indiqués :',
    8: 'Attention aux avalanches dans ces lieux indiqués :',
    9: 'Attention aux vagues et à la submersion sur ces côtes :',
    10: 'Attention à la tornade dans ces lieux indiqués :',
    11: 'Attention à l\'incendie dans ces lieux indiqués :',
    12: 'Attention aux inondations dans ces lieux indiqués :',
    14: 'Attention à la tempête dans ces lieux indiqués :',
    15: 'Attention aux fortes pluies et aux orages dans ces lieux indiqués :',
    16: 'Attention à la forte houle sur ces côtes :',
  };
  const HEADERS = {
    seisme: 'Alerte sismique précoce',
    tsunami: 'Alerte tsunami',
    missile: 'Alerte missile',
  };
  const COASTAL = new Set([9, 16]);

  // --- Données géographiques (vraies coordonnées) ---

  let geoCache = null;
  function geoData() {
    if (geoCache) return geoCache;
    const deps = {};
    for (const f of ((window.MALERT_DEPARTMENTS || {}).features || [])) {
      const g = f.geometry || {};
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      let s = 90; let n = -90; let w = 180; let e = -180;
      for (const p of polys) for (const ring of p) for (const [lo, la] of ring) { s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo); }
      deps[f.properties.code] = { polys, box: [s, n, w, e], name: f.properties.nom };
    }
    geoCache = { deps, coasts: window.MALERT_COASTS || {} };
    return geoCache;
  }

  const shortName = (code) => {
    const d = geoData().deps[code];
    return d ? d.name : (M ? M.departmentName(code).replace(/ \(\w+\)$/, '') : code);
  };

  /** Projection d'une zone [s, n, w, e] dans un rectangle (x, y, w, h), sans déformation. */
  function projector(box, x, y, w, h) {
    const [s, n, we, e] = box;
    const midLat = (s + n) / 2;
    const k = Math.cos(midLat * Math.PI / 180);
    const spanX = (e - we) * k;
    const spanY = n - s;
    const scale = Math.min(w / spanX, h / spanY);
    const ox = x + (w - spanX * scale) / 2;
    const oy = y + (h - spanY * scale) / 2;
    return (lat, lon) => [ox + (lon - we) * k * scale, oy + (n - lat) * scale];
  }

  /** Zone à montrer : départements concernés (et épicentre), élargie à un minimum lisible. */
  function focusBox(codes, epicenter, minSpanDeg) {
    const { deps } = geoData();
    let s = 90; let n = -90; let w = 180; let e = -180;
    for (const c of codes) {
      const d = deps[c];
      if (!d) continue;
      s = Math.min(s, d.box[0]); n = Math.max(n, d.box[1]); w = Math.min(w, d.box[2]); e = Math.max(e, d.box[3]);
    }
    if (epicenter) { s = Math.min(s, epicenter.lat); n = Math.max(n, epicenter.lat); w = Math.min(w, epicenter.lon); e = Math.max(e, epicenter.lon); }
    if (s > n) { s = 41.3; n = 51.1; w = -5.2; e = 9.6; } // toute la métropole
    const cy = (s + n) / 2; const cx = (w + e) / 2;
    const k = Math.cos(cy * Math.PI / 180);
    let half = Math.max((n - s) / 2, ((e - w) * k) / 2, minSpanDeg / 2) * 1.25;
    half = Math.min(half, 6);
    return [cy - half, cy + half, cx - half / k, cx + half / k];
  }

  function pathPoly(ctx, poly, P) {
    for (const ring of poly) {
      ring.forEach(([lo, la], i) => { const [x, y] = P(la, lo); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.closePath();
    }
  }

  /** Carte de gauche : terre grise, départements concernés colorés, épicentre ✕. */
  function drawMapPanel(ctx, x, y, w, h, alert, added = null, blinkOn = true) {
    const { deps, coasts } = geoData();
    const codes = alert.departments.includes('ALL') ? Object.keys(deps).filter((c) => c !== '988') : alert.departments;
    const quake = alert.category === 'seisme' && alert.epicenter;
    const box = focusBox(codes, quake ? alert.epicenter : null, quake ? 2.2 : 1.6);
    const P = projector(box, x, y, w, h);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = C.sea; ctx.fillRect(x, y, w, h);
    // Colorié : séisme et tsunami à la couleur de la zone (jaune), sinon couleur du niveau.
    const fillOf = (code) => {
      if (alert.category === 'tsunami') return null;
      if (!codes.includes(code)) return null;
      // Département ajouté : clignote (éteint une fois sur deux).
      if (added && added.has(code) && !blinkOn) return null;
      if (alert.category === 'seisme') return C.zone;
      const rows = (alert.forecastTable && alert.forecastTable.rows) || [];
      const row = rows.find((r) => r.department === code);
      return LEVEL_FILL[row ? row.level : alert.level] || C.zone;
    };
    const visible = (d) => !(d.box[1] < box[0] || d.box[0] > box[1] || d.box[3] < box[2] || d.box[2] > box[3]);
    for (const [code, d] of Object.entries(deps)) {
      if (!visible(d)) continue;
      const coastal = (alert.category || 'meteo') === 'meteo' && COASTAL.has(Number(alert.phenomenon));
      ctx.beginPath();
      for (const poly of d.polys) pathPoly(ctx, poly, P);
      ctx.fillStyle = (!coastal && fillOf(code)) || C.land;
      ctx.fill('evenodd');
      ctx.strokeStyle = C.landLine; ctx.lineWidth = Math.max(1, w / 400); ctx.stroke();
    }
    // Côtes (tsunami, vagues-submersion, forte houle) : trait épais à la couleur du niveau.
    const coastLevels = {};
    if (alert.category === 'tsunami') {
      for (const r of alert.tsunamiTable || []) coastLevels[r.department] = r.level;
      if (!Object.keys(coastLevels).length) for (const c of codes) coastLevels[c] = alert.level;
    } else if (COASTAL.has(Number(alert.phenomenon))) {
      for (const c of codes) coastLevels[c] = alert.level;
    }
    for (const [code, lv] of Object.entries(coastLevels)) {
      ctx.strokeStyle = alert.category === 'tsunami' ? TSU_COLORS[lv] || TSU_COLORS[2] : LEVEL_FILL[lv] || C.zone;
      ctx.lineWidth = Math.max(3, w / 70);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const line of coasts[code] || []) {
        ctx.beginPath();
        line.forEach(([la, lo], i) => { const [px, py] = P(la, lo); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
        ctx.stroke();
      }
    }
    if (alert.epicenter && (alert.category === 'seisme' || alert.category === 'tsunami')) {
      const [ex, ey] = P(alert.epicenter.lat, alert.epicenter.lon);
      const r = Math.max(6, w / 28); // croix discrète (épicentre)
      ctx.lineCap = 'round';
      for (const [col, lw] of [['#fff', r / 2.2], [C.red, r / 3.4]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(ex - r, ey - r); ctx.lineTo(ex + r, ey + r); ctx.moveTo(ex + r, ey - r); ctx.lineTo(ex - r, ey + r); ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Titre du bandeau : « Alerte sismique précoce (M-Alert) », « Vent violent (M-Alert) »… */
  function headerOf(alert) {
    const cat = alert.category || 'meteo';
    if (HEADERS[cat]) return `${HEADERS[cat]} (M-Alert)`;
    if (cat === 'meteo') {
      const ph = M && M.PHENOMENA[alert.phenomenon];
      return `${ph ? ph.name : 'Alerte météo'} (M-Alert)`;
    }
    const c = M && M.CATEGORIES[cat];
    return `${c ? c.name : 'Alerte'} (M-Alert)`;
  }

  function watchOf(alert) {
    const cat = alert.category || 'meteo';
    if (WATCH[cat]) return WATCH[cat];
    if (cat === 'meteo' && WATCH[alert.phenomenon]) return WATCH[alert.phenomenon];
    return 'Attention dans ces lieux indiqués :';
  }

  /** Lieux à afficher, les plus touchés d'abord (séisme : intensité ; tableau : niveau). */
  function placesOf(alert, added = null) {
    if (alert.departments.includes('ALL')) return ['Toute la France'];
    let codes = [...alert.departments];
    if (added && added.size) {
      // Départements ajoutés à la fin (comme la NHK), chaque groupe dans son ordre habituel.
      const order = placesOf({ ...alert }, null);
      const nameOf = (c) => shortName(c);
      const old = codes.filter((c) => !added.has(c)).map(nameOf);
      const neu = codes.filter((c) => added.has(c)).map(nameOf);
      const rank = (n) => order.indexOf(n);
      return [...old.sort((a, b) => rank(a) - rank(b)), ...neu.sort((a, b) => rank(a) - rank(b))];
    }
    if (alert.category === 'tsunami' && Array.isArray(alert.tsunamiTable) && alert.tsunamiTable.length) {
      codes = [...alert.tsunamiTable].sort((a, b) => b.level - a.level).map((r) => r.department);
    } else if (alert.forecastTable && Array.isArray(alert.forecastTable.rows)) {
      const lv = Object.fromEntries(alert.forecastTable.rows.map((r) => [r.department, r.level]));
      codes.sort((a, b) => (lv[b] || 0) - (lv[a] || 0));
    } else if (alert.category === 'seisme' && alert.epicenter && M) {
      const { deps } = geoData();
      const dist = (c) => { const d = deps[c]; if (!d) return 1e9; const la = (d.box[0] + d.box[1]) / 2; const lo = (d.box[2] + d.box[3]) / 2; return Math.hypot(la - alert.epicenter.lat, (lo - alert.epicenter.lon) * 0.7); };
      codes.sort((a, b) => dist(a) - dist(b));
    }
    return codes.map(shortName);
  }

  /** Texte qui tient dans une largeur : taille réduite jusqu'à min. */
  function fitText(ctx, text, maxW, size, min, weight = '700') {
    let s = size;
    for (; s > min; s -= 1) { ctx.font = `${weight} ${s}px ${FONT}`; if (ctx.measureText(text).width <= maxW) break; }
    ctx.font = `${weight} ${s}px ${FONT}`;
    return s;
  }

  /**
   * Bandeau d'alerte (1280 × 360 par défaut, ou la taille du canvas) : comme le bandeau d'alerte
   * sismique précoce de la NHK (carte, titre rouge, consigne en jaune, lieux en blanc).
   */
  function drawBanner(canvas, alert, { width = 1280, height = 360, added = null, blinkOn = true } = {}) {
    // added : départements ajoutés par une mise à jour (clignotants sur la carte, noms en jaune).
    added = added && added.length ? new Set(added) : null;
    const addedNames = new Set(added ? [...added].map(shortName) : []);
    if (!canvas.width || canvas.dataset.auto !== 'off') { canvas.width = width; canvas.height = height; }
    const W = canvas.width; const H = canvas.height;
    const ctx = canvas.getContext('2d');
    const pad = Math.round(H * 0.012);
    ctx.fillStyle = C.frame; ctx.fillRect(0, 0, W, H);
    // Carte : carré à gauche.
    const mapW = Math.round(H - 2 * pad);
    drawMapPanel(ctx, pad, pad, mapW, H - 2 * pad, alert, added, blinkOn);
    ctx.strokeStyle = '#3b4a6b'; ctx.lineWidth = 1; ctx.strokeRect(pad + 0.5, pad + 0.5, mapW - 1, H - 2 * pad - 1);
    // Titre.
    const x0 = pad * 2 + mapW;
    const rw = W - x0 - pad;
    const headH = Math.round(H * 0.22);
    const cat = alert.category || 'meteo';
    const headFill = cat === 'seisme' ? C.red : cat === 'tsunami' ? (TSU_COLORS[alert.level] || C.red) : (LEVEL_FILL[alert.level] || C.red);
    const headText = cat === 'seisme' ? '#fff' : cat === 'tsunami' ? (alert.level === 2 ? '#111' : '#fff') : (LEVEL_TEXT[alert.level] || '#fff');
    ctx.fillStyle = headFill; ctx.fillRect(x0, pad, rw, headH);
    ctx.fillStyle = headText;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    fitText(ctx, headerOf(alert), rw - 2 * pad, Math.round(headH * 0.62), 12, '500');
    ctx.fillText(headerOf(alert), x0 + rw / 2, pad + headH / 2 + 1);
    // Corps bleu.
    const by = pad * 2 + headH;
    const bh = H - by - pad;
    ctx.fillStyle = C.body; ctx.fillRect(x0, by, rw, bh);
    ctx.strokeStyle = C.bodyLine; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, by + 0.5, rw - 1, bh - 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const inner = Math.round(H * 0.02);
    const watch = watchOf(alert);
    ctx.fillStyle = C.yellow;
    const wSize = fitText(ctx, watch, rw - 2 * inner, Math.round(H * 0.07), 10, '500');
    ctx.fillText(watch, x0 + inner, by + inner * 0.6);
    // Lieux : en blanc, sur plusieurs colonnes, taille ajustée pour tout faire tenir.
    const places = placesOf(alert, added);
    const top = by + inner * 0.6 + wSize * 1.45;
    const areaH = by + bh - inner - top;
    const areaW = rw - 2 * inner;
    let size = Math.round(H * 0.13);
    let layout = null;
    for (; size >= 11; size -= 1) {
      ctx.font = `700 ${size}px ${FONT}`;
      const gap = size * 0.9;
      const lineH = size * 1.25;
      const rowsMax = Math.max(1, Math.floor(areaH / lineH));
      // Remplissage par lignes, de gauche à droite (comme la NHK).
      const lines = [[]];
      let lw = 0;
      for (const p of places) {
        const pw = ctx.measureText(p).width;
        if (lines[lines.length - 1].length && lw + gap + pw > areaW) { lines.push([]); lw = 0; }
        lines[lines.length - 1].push(p);
        lw += (lines[lines.length - 1].length > 1 ? gap : 0) + pw;
      }
      if (lines.length <= rowsMax) { layout = { lines, lineH, gap }; break; }
    }
    if (!layout) {
      // Trop de lieux : les premiers, puis « et N autres ».
      ctx.font = `700 ${size}px ${FONT}`;
      const lineH = size * 1.25; const gap = size * 0.9;
      const rowsMax = Math.max(1, Math.floor(areaH / lineH));
      const lines = [[]]; let lw = 0; let shown = 0;
      for (const p of places) {
        const pw = ctx.measureText(p).width;
        if (lines[lines.length - 1].length && lw + gap + pw > areaW) { if (lines.length === rowsMax) break; lines.push([]); lw = 0; }
        lines[lines.length - 1].push(p); lw += (lines[lines.length - 1].length > 1 ? gap : 0) + pw; shown++;
      }
      if (shown < places.length) lines[lines.length - 1].push(`et ${places.length - shown} autres`);
      layout = { lines, lineH, gap };
    }
    ctx.fillStyle = C.white;
    layout.lines.forEach((line, i) => {
      let x = x0 + inner;
      for (const p of line) {
        ctx.fillStyle = addedNames.has(p) ? C.yellow : C.white;
        ctx.fillText(p, x, top + i * layout.lineH); x += ctx.measureText(p).width + layout.gap;
      }
    });
    return canvas;
  }

  /**
   * Carte des tsunamis (1920 × 1080, fond bleu opaque) : la
   * métropole, la Corse et l'encart de la Nouvelle-Calédonie, côtes colorées par niveau
   * (clignotantes : on = allumées), légende à droite.
   */
  function drawTsunamiMap(canvas, alert, on = true, { width = 1920, height = 1080 } = {}) {
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    const W = width; const H = height;
    ctx.clearRect(0, 0, W, H);
    // Fond opaque (comme la NHK) : la carte masque tout ce qu'il y a derrière.
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#1c3fa8'); bg.addColorStop(1, '#16328c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const legendW = Math.round(W * 0.2);
    const { deps, coasts } = geoData();
    // Tsunami, ou vagues-submersion / forte houle (mêmes côtes, couleurs des niveaux météo).
    const surge = Boolean(alert && alert.category !== 'tsunami');
    const colors = surge ? LEVEL_FILL : TSU_COLORS;
    const names = surge ? { 5: 'Majeure', 4: 'Rouge', 3: 'Orange', 2: 'Jaune' } : TSU_NAMES;
    const levels = {};
    const rows = (alert && (alert.tsunamiTable || (alert.forecastTable && alert.forecastTable.rows))) || [];
    const set = new Set((alert && alert.departments) || []);
    for (const r of rows) if (!surge || set.has(r.department) || set.has('ALL')) levels[r.department] = Math.max(levels[r.department] || 0, r.level);
    if (alert && !Object.keys(levels).length) for (const c of alert.departments || []) levels[c] = alert.level;
    const nc = Boolean(levels['988']);
    // Métropole (et Corse) : à gauche ; encart Nouvelle-Calédonie en bas à gauche.
    const inset = { x: W * 0.02, y: H * 0.68, w: W * 0.2, h: H * 0.28 };
    const P = projector([41.2, 51.2, -5.4, 9.8], inset.x + inset.w, H * 0.04, W - legendW - inset.w - W * 0.05, H * 0.92);
    const PN = projector([-22.9, -19.5, 163.4, 168.3], inset.x + 8, inset.y + 30, inset.w - 16, inset.h - 38);
    const draw = (code, Pr) => {
      const d = deps[code];
      if (!d) return;
      ctx.beginPath();
      for (const poly of d.polys) pathPoly(ctx, poly, Pr);
      ctx.fillStyle = '#b8c8e6'; ctx.fill('evenodd');
    };
    for (const code of Object.keys(deps)) if (code !== '988') draw(code, P);
    // Encart.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(inset.x, inset.y); ctx.lineTo(inset.x + inset.w, inset.y); ctx.lineTo(inset.x + inset.w, inset.y + inset.h); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(H * 0.032)}px ${FONT}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillText('Nouvelle-Calédonie', inset.x + 6, inset.y + 6);
    draw('988', PN);
    // Côtes en alerte (clignotantes).
    if (on) {
      for (const [code, lv] of Object.entries(levels)) {
        ctx.strokeStyle = colors[lv] || colors[2];
        ctx.lineWidth = Math.max(6, W / 220); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        const Pr = code === '988' ? PN : P;
        for (const line of coasts[code] || []) {
          ctx.beginPath();
          line.forEach(([la, lo], i) => { const [x, y] = Pr(la, lo); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
          ctx.stroke();
        }
      }
    }
    if (alert && alert.epicenter && !nc) {
      const [ex, ey] = P(alert.epicenter.lat, alert.epicenter.lon);
      if (ex > 0 && ex < W - legendW && ey > 0 && ey < H) {
        const r = W / 160;
        for (const [col, lw] of [['#fff', r / 2], [C.red, r / 3.2]]) {
          ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(ex - r, ey - r); ctx.lineTo(ex + r, ey + r); ctx.moveTo(ex + r, ey - r); ctx.lineTo(ex - r, ey + r); ctx.stroke();
        }
      }
    }
    // Légende : bande bleue à droite, niveaux en alerte (comme les étiquettes verticales de la NHK).
    const lx = W - legendW;
    ctx.fillStyle = 'rgba(16, 44, 200, 0.85)';
    ctx.fillRect(lx, 0, legendW, H);
    const order = surge ? [5, 4, 3, 2] : [5, 4, 2];
    const shown = order.filter((l) => Object.values(levels).includes(l));
    const list = shown.length ? shown : surge ? [3] : [4, 2];
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    // Même taille pour toutes les étiquettes : celle qui tient pour la plus longue.
    let fs = Math.round(H * 0.045);
    for (const l of list) { fs = Math.min(fs, fitText(ctx, names[l], legendW * 0.66, fs, 14)); }
    list.forEach((l, i) => {
      const y = H * 0.32 + i * fs * 2.6;
      ctx.fillStyle = colors[l]; ctx.fillRect(lx + legendW * 0.08, y - fs * 0.5, legendW * 0.14, fs);
      ctx.fillStyle = '#fff'; ctx.font = `700 ${fs}px ${FONT}`;
      ctx.fillText(names[l], lx + legendW * 0.27, y);
    });
    ctx.font = `700 ${Math.round(H * 0.034)}px ${FONT}`; ctx.textBaseline = 'top';
    const title = surge ? `${(M && M.alertKind ? M.alertKind(alert).name : 'Vagues-submersion')} (M-Alert)` : 'Tsunami (M-Alert)';
    const ts = Math.round(H * 0.034);
    ctx.font = `700 ${ts}px ${FONT}`;
    if (ctx.measureText(title).width <= legendW * 0.86) ctx.fillText(title, lx + legendW * 0.08, H * 0.08);
    else {
      // Titre long (vagues-submersion) : nom, puis « (M-Alert) » dessous.
      const name = title.replace(/ \(M-Alert\)$/, '');
      fitText(ctx, name, legendW * 0.86, ts, 12);
      ctx.fillText(name, lx + legendW * 0.08, H * 0.08);
      ctx.font = `700 ${ts}px ${FONT}`;
      ctx.fillText('(M-Alert)', lx + legendW * 0.08, H * 0.08 + ts * 1.25);
    }
    return canvas;
  }

  /** Lignes d'un texte coupé à la largeur maxW (mots entiers ; retours à la ligne gardés). */
  function wrap(ctx, text, maxW) {
    const out = [];
    for (const para of String(text || '').split('\n')) {
      let line = '';
      for (const w of para.split(/\s+/).filter(Boolean)) {
        const t = line ? `${line} ${w}` : w;
        if (line && ctx.measureText(t).width > maxW) { out.push(line); line = w; } else line = t;
      }
      out.push(line);
    }
    return out;
  }

  /**
   * Carte « Information(s) M-Alert » (670 × 330 par défaut) : titre rouge, texte blanc sur fond
   * bleu. Pour une alerte annulée (fausse alerte) ou une notification de M-Alert.
   * info : { lines: ['…'] } ou { title, body } (notification) ; cancelled : alerte annulée.
   */
  function drawInfo(canvas, info, { width = 670, height = 330 } = {}) {
    canvas.width = width; canvas.height = height;
    const W = width; const H = height;
    const ctx = canvas.getContext('2d');
    const pad = Math.max(2, Math.round(H * 0.008));
    ctx.fillStyle = C.frame; ctx.fillRect(0, 0, W, H);
    const headH = Math.round(H * 0.15);
    ctx.fillStyle = '#ff0000'; ctx.fillRect(pad, pad, W - 2 * pad, headH);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitText(ctx, 'Information(s) M-Alert', W - 4 * pad, Math.round(headH * 0.7), 10, '400');
    ctx.fillText('Information(s) M-Alert', W / 2, pad + headH / 2 + 1);
    const by = pad * 2 + headH;
    ctx.fillStyle = '#3a73c4'; ctx.fillRect(pad, by, W - 2 * pad, H - by - pad);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#fff';
    const inner = Math.round(H * 0.035);
    const maxW = W - 2 * pad - 2 * inner;
    const areaH = H - by - pad - 2 * inner;
    const paras = info.lines || [info.title, info.body].filter(Boolean);
    // Taille la plus grande qui fait tout tenir (titre de la notification en gras).
    for (let size = Math.round(H * 0.105); size >= 9; size -= 1) {
      const lh = size * 1.25;
      const rows = [];
      paras.forEach((p, i) => {
        ctx.font = `${!info.lines && i === 0 ? 700 : 400} ${size}px ${FONT}`;
        for (const l of wrap(ctx, p, maxW)) rows.push({ l, bold: !info.lines && i === 0 });
      });
      if (rows.length * lh <= areaH || size === 9) {
        rows.slice(0, Math.floor(areaH / lh)).forEach((r, i) => {
          ctx.font = `${r.bold ? 700 : 400} ${size}px ${FONT}`;
          ctx.fillText(r.l, pad + inner, by + inner + i * lh);
        });
        break;
      }
    }
    return canvas;
  }

  /** Texte de la carte d'information d'une alerte annulée (fausse alerte). */
  function cancelledInfo(alert) {
    const lines = ['L\'alerte précédente a été annulée.', 'Aucun danger est attendu.'];
    if (alert && alert.title) lines.push(`(${alert.title})`);
    return { lines };
  }

  /** Image PNG (Blob) d'un bandeau, pour l'enregistrer. */
  function bannerBlob(alert, opts) {
    const canvas = document.createElement('canvas');
    // Alerte annulée (fausse alerte) : carte « Information(s) M-Alert ».
    if (alert && alert.voided) drawInfo(canvas, cancelledInfo(alert), opts);
    else drawBanner(canvas, alert, opts);
    return new Promise((ok) => canvas.toBlob(ok, 'image/png'));
  }


  // --- Texte d'informations (en haut de l'écran réduit, comme la NHK) ---

  /** Le point est-il dans un département (à terre) ? */
  function onLand(lat, lon) {
    for (const d of Object.values(geoData().deps)) {
      const [s0, n0, w0, e0] = d.box;
      if (lat < s0 || lat > n0 || lon < w0 || lon > e0) continue;
      for (const p of d.polys) {
        const ring = p[0];
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
          if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) return true;
      }
    }
    return false;
  }

  /** Distance (km) entre un point et le département (son point le plus proche, ou dedans : 0). */
  function deptKm(code, lat, lon) {
    const d = geoData().deps[code];
    if (!d) return null;
    const [s, n, w, e] = d.box;
    if (lat >= s && lat <= n && lon >= w && lon <= e) {
      let inside = false;
      for (const p of d.polys) {
        const ring = p[0];
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
          if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
        }
      }
      if (inside) return 0;
    }
    let best = Infinity;
    const k = Math.cos((lat * Math.PI) / 180);
    for (const p of d.polys) for (const ring of p) for (const [lo, la] of ring) {
      const dx = (lo - lon) * 111.32 * k; const dy = (la - lat) * 110.57;
      best = Math.min(best, dx * dx + dy * dy);
    }
    return Math.sqrt(best);
  }

  const frNum = (x, d = 1) => Number(x).toLocaleString('fr-FR', { maximumFractionDigits: d });
  const hourOf = (iso) => {
    if (!iso) return '';
    const t = M && M.formatTime ? M.formatTime(new Date(iso).toISOString()) : new Date(iso).toTimeString().slice(0, 5);
    return t.replace(':', ' h ');
  };
  const listOf = (items, max = 6) => items.slice(0, max).join(' · ') + (items.length > max ? ' …' : '');

  /** Intensités par département (les plus fortes d'abord) : corrigées par M-Alert ou calculées. */
  function quakeIntensities(a) {
    const order = (M && M.SHINDO_ORDER) || ['1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'];
    const out = [];
    for (const code of a.departments || []) {
      let sh = a.intensities && a.intensities[code];
      if (!sh && a.epicenter && typeof a.magnitude === 'number' && M && M.estimateIntensity) {
        const km = deptKm(code, a.epicenter.lat, a.epicenter.lon);
        if (km !== null) sh = M.toShindo(M.estimateIntensity(a.magnitude, Number(a.depth) || 10, km));
      }
      if (sh) out.push([code, sh]);
    }
    return out.sort((x, y) => order.indexOf(y[1]) - order.indexOf(x[1]));
  }

  /**
   * Deux lignes d'informations sur l'alerte : ce qui s'est passé, puis les mesures (intensités d'un
   * séisme, hauteurs et arrivées d'un tsunami, rafales, pluie et crues, vagues…).
   */
  function infoLines(a) {
    if (!a) return [];
    const at = hourOf(a.originTime || a.createdAt);
    const where = (a.departments || []).includes('ALL') ? 'France entière' : '';
    if (a.category === 'seisme') {
      const head = [`Séisme vers ${at}`];
      if (typeof a.magnitude === 'number') head.push(`magnitude ${frNum(a.magnitude)}`);
      if (typeof a.depth === 'number') head.push(`profondeur ${frNum(a.depth, 0)} km`);
      if (a.shindo) head.push(`intensité max ${a.shindo}`);
      const ints = quakeIntensities(a).map(([c, sh]) => `${shortName(c)} ${sh}`);
      return [head.join(' — '), ints.length ? `Intensités : ${listOf(ints)}` : (a.title || '')];
    }
    if (a.category === 'tsunami' && Array.isArray(a.tsunamiTable) && a.tsunamiTable.length) {
      const rows = a.tsunamiTable.slice().sort((x, y) => (y.level - x.level) || ((y.height || 0) - (x.height || 0)));
      const items = rows.map((r) => {
        const h = typeof r.height === 'number' ? ` ${r.heightEstimated ? '≈' : ''}${frNum(r.height)} m` : '';
        const t = r.arrival === 'arrived' ? ' (arrivé)' : r.arrival === 'imminent' ? ' (imminent)' : r.arrival ? ` (${hourOf(r.arrival)})` : '';
        return `${shortName(r.department)}${h}${t}`;
      });
      return [a.title || `Tsunami — ${at}`, `Vagues : ${listOf(items, 4)}`];
    }
    const t = a.forecastTable;
    if (t && Array.isArray(t.rows) && t.rows.length) {
      const deps = new Set(a.departments || []);
      const rows = t.rows.filter((r) => deps.has('ALL') || deps.has(r.department));
      const wind = t.kind === 'vent' || t.kind === 'tempete';
      const flood = t.kind === 'inondation';
      const val = (r) => (wind ? Math.max(r.gust || 0, r.gustCoast || 0) : flood ? Math.max(r.rain24 || 0, (r.river || 0) * 50) : r.hs || r.wind || 0);
      const items = rows.slice().sort((x, y) => (y.level - x.level) || (val(y) - val(x))).map((r) => {
        let v = '';
        if (wind) v = `${Math.max(r.gust || 0, r.gustCoast || 0)} km/h`;
        else if (flood) v = [r.rain24 >= 1 ? `${Math.round(r.rain24)} mm` : '', r.river ? `rivière ×${frNum(r.river)}` : ''].filter(Boolean).join(', ');
        else v = r.hs > 0 ? `${frNum(r.hs)} m` : typeof r.wind === 'number' ? `vent ${r.wind} km/h` : '';
        return `${shortName(r.department)} ${v}`.trim();
      });
      const label = wind ? 'Rafales' : flood ? 'Pluie en 24 h' : 'Vagues';
      return [a.title || '', `${label} : ${listOf(items, 4)}`];
    }
    // Autres alertes : titre, puis mesures connues ou description.
    const extra = [];
    if (typeof a.windKmh === 'number') extra.push(`vent attendu ${a.windKmh} km/h`);
    if (typeof a.waveHeight === 'number') extra.push(`vagues jusqu'à ${frNum(a.waveHeight)} m`);
    if (M && M.pollutionSummary && M.pollutionSummary(a)) extra.push(M.pollutionSummary(a));
    const second = extra.length ? extra.join(' — ') : (a.description || where || '').replace(/\s+/g, ' ');
    return [a.title || headerOf(a), second];
  }


  /**
   * Informations complètes de l'alerte, pour le texte en pages du haut de l'écran (rien n'est coupé) :
   * { head: [lignes], lists: [{ label, items }], text, closing }.
   */
  function infoParts(a) {
    if (!a) return null;
    const at = hourOf(a.originTime || a.createdAt);
    const out = { head: [], lists: [], text: '', closing: '' };
    const deps = (a.departments || []).filter((d) => d !== 'ALL');
    const meteo = (a.category || 'meteo') === 'meteo';
    out.closing = meteo ? 'Restez informés sur M-Alert et Météo-France' : 'Restez informés sur M-Alert';
    if (a.category === 'seisme') {
      const head = [`Séisme vers ${at}`];
      if (typeof a.magnitude === 'number') head.push(`magnitude ${frNum(a.magnitude)}`);
      if (typeof a.depth === 'number') head.push(`profondeur ${frNum(a.depth, 0)} km`);
      if (a.shindo) head.push(`intensité max ${a.shindo}`);
      out.head.push(head.join(' — '));
      // Épicentre en mer : risque de tsunami.
      if (a.epicenter && !onLand(a.epicenter.lat, a.epicenter.lon)) out.head.push('Épicentre en mer : évitez les bords de mer, risque de tsunami');
      if (a.title) out.head.push(a.title);
      const ints = quakeIntensities(a).map(([c, sh]) => `${shortName(c)} ${sh}`);
      if (ints.length) out.lists.push({ label: 'Intensités', items: ints });
    } else if (a.category === 'missile') {
      // Comme les messages J-Alert : « Missile lancé. Missile lancé. » puis la consigne.
      out.head.push('Missile lancé. Missile lancé.');
      if (a.title) out.head.push(a.title);
      out.head.push('Abritez-vous immédiatement dans un bâtiment solide ou en sous-sol');
      if ((a.departments || []).includes('ALL')) out.lists.push({ label: 'Lieux', items: ['France entière'] });
      else if (deps.length) out.lists.push({ label: deps.length > 1 ? 'Départements' : 'Département', items: deps.map(shortName) });
      out.closing = 'Restez à l\'abri et informés sur M-Alert';
    } else if (a.category === 'tsunami' && Array.isArray(a.tsunamiTable) && a.tsunamiTable.length) {
      out.head.push(a.title || `Tsunami — ${at}`);
      const rows = a.tsunamiTable.slice().sort((x, y) => (y.level - x.level) || ((y.height || 0) - (x.height || 0)));
      out.lists.push({ label: 'Vagues', items: rows.map((r) => {
        const h = typeof r.height === 'number' ? ` ${r.heightEstimated ? '≈' : ''}${frNum(r.height)} m` : '';
        const t = r.arrival === 'arrived' ? ' (arrivé)' : r.arrival === 'imminent' ? ' (imminent)' : r.arrival ? ` (${hourOf(r.arrival)})` : '';
        return `${shortName(r.department)}${h}${t}`;
      }) });
    } else if (a.forecastTable && Array.isArray(a.forecastTable.rows) && a.forecastTable.rows.length) {
      const t = a.forecastTable;
      const set = new Set(a.departments || []);
      const rows = t.rows.filter((r) => set.has('ALL') || set.has(r.department));
      const wind = t.kind === 'vent' || t.kind === 'tempete';
      const flood = t.kind === 'inondation';
      const val = (r) => (wind ? Math.max(r.gust || 0, r.gustCoast || 0) : flood ? Math.max(r.rain24 || 0, (r.river || 0) * 50) : r.hs || r.wind || 0);
      out.head.push(a.title || headerOf(a));
      out.lists.push({ label: wind ? 'Rafales' : flood ? 'Pluie en 24 h' : 'Vagues', items: rows.slice().sort((x, y) => (y.level - x.level) || (val(y) - val(x))).map((r) => {
        let v = '';
        if (wind) v = `${Math.max(r.gust || 0, r.gustCoast || 0)} km/h`;
        else if (flood) v = [r.rain24 >= 1 ? `${Math.round(r.rain24)} mm` : '', r.river ? `rivière ×${frNum(r.river)}` : ''].filter(Boolean).join(', ');
        else v = r.hs > 0 ? `${frNum(r.hs)} m` : typeof r.wind === 'number' ? `vent ${r.wind} km/h` : '';
        return `${shortName(r.department)} ${v}`.trim();
      }) });
    } else {
      out.head.push(a.title || headerOf(a));
      const extra = [];
      if (typeof a.windKmh === 'number') extra.push(`vent attendu ${a.windKmh} km/h`);
      if (typeof a.waveHeight === 'number') extra.push(`vagues jusqu'à ${frNum(a.waveHeight)} m`);
      if (M && M.pollutionSummary && M.pollutionSummary(a)) extra.push(M.pollutionSummary(a));
      if (extra.length) out.head.push(extra.join(' — '));
      if ((a.departments || []).includes('ALL')) out.lists.push({ label: 'Lieux', items: ['France entière'] });
      else if (deps.length) out.lists.push({ label: deps.length > 1 ? 'Départements' : 'Département', items: deps.map(shortName) });
    }
    out.text = String(a.description || '').replace(/\s+/g, ' ').trim();
    return out;
  }


  /**
   * Carte des zones visées (alerte missile, comme la carte « 対象地域 » de la NHK) : métropole et
   * Corse en gris clair, départements visés en jaune, fond transparent ; encart de la
   * Nouvelle-Calédonie seulement si elle est visée.
   */
  // Carte des zones (missile). color : couleur des zones (celle du niveau). layers : plusieurs alertes
  // [{ departments, color }], du niveau le plus bas au plus haut (le plus haut l'emporte sur un même
  // département). blinkOn = false : zones en gris, pour le clignotement comme à la NHK.
  function drawZonesMap(canvas, alert, { width = 640, height = 600, blinkOn = true, color = '#f5e100', layers = null } = {}) {
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    const W = width; const H = height;
    ctx.clearRect(0, 0, W, H);
    const { deps } = geoData();
    const colorOf = {};
    for (const l of layers || [{ departments: (alert && alert.departments) || [], color }]) {
      const codes = (l.departments || []).includes('ALL') ? Object.keys(deps) : l.departments || [];
      for (const c of codes) colorOf[c] = l.color;
    }
    const nc = Boolean(colorOf['988']);
    const P = projector([41.2, 51.2, -5.4, 9.8], W * 0.04, H * 0.03, W * 0.92, H * (nc ? 0.7 : 0.94));
    const draw = (code, Pr) => {
      const d = deps[code];
      if (!d) return;
      ctx.beginPath();
      for (const poly of d.polys) pathPoly(ctx, poly, Pr);
      ctx.fillStyle = colorOf[code] && blinkOn ? colorOf[code] : '#d6d9df';
      ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(40,40,40,.55)'; ctx.lineWidth = Math.max(1, W / 500); ctx.stroke();
    };
    for (const code of Object.keys(deps)) if (code !== '988') draw(code, P);
    if (nc) {
      const ix = W * 0.04; const iy = H * 0.74; const iw = W * 0.42; const ih = H * 0.24;
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(ix + iw, iy); ctx.lineTo(ix + iw, iy + ih); ctx.stroke();
      draw('988', projector([-22.9, -19.5, 163.4, 168.3], ix + 6, iy + 6, iw - 12, ih - 12));
    }
    return canvas;
  }

  // --- Carte des intensités (comme la NHK) ---

  // Couleurs des intensités sur la carte, comme à la NHK : [fond, texte, bord].
  const NHK_SHINDO = {
    1: ['#f2f4f8', '#333', '#7d8590'], 2: ['#a9d6ff', '#0d2a4a', '#4b7fb0'], 3: ['#fbf3a0', '#1b1b1b', '#9a8a2a'],
    4: ['#f5a04b', '#1b1b1b', '#9a5410'], '5-': ['#c62020', '#fff', '#5c0b0b'], '5+': ['#a61414', '#fff', '#4a0606'],
    '6-': ['#f6c3d3', '#a00d2a', '#a00d2a'], '6+': ['#f39bb8', '#7d0018', '#7d0018'], 7: ['#8c0a12', '#fff', '#ffd200'],
  };
  const ORDER = ['0', '1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'];

  /** Point où écrire dans un département : centre de son plus grand morceau. */
  function labelPoint(d) {
    let best = null; let bestA = 0;
    for (const p of d.polys) {
      const ring = p[0];
      let a = 0; let cx = 0; let cy = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
        a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
      }
      if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = [cy / (3 * a), cx / (3 * a)]; }
    }
    return best || [(d.box[0] + d.box[1]) / 2, (d.box[2] + d.box[3]) / 2];
  }

  /** Intensité de chaque département (corrigée par M-Alert, sinon calculée), 1 et plus. */
  function allIntensities(a) {
    const { deps } = geoData();
    const out = {};
    for (const code of Object.keys(deps)) {
      let sh = a.intensities && a.intensities[code];
      if (!sh && a.epicenter && typeof a.magnitude === 'number' && M && M.estimateIntensity) {
        const km = deptKm(code, a.epicenter.lat, a.epicenter.lon);
        if (km !== null && km < 900) sh = M.toShindo(M.estimateIntensity(a.magnitude, Number(a.depth) || 10, km));
      }
      if (sh && ORDER.indexOf(String(sh)) >= 1) out[code] = String(sh);
    }
    return out;
  }

  /** Case d'intensité : chiffre, et « − » / « + » en exposant (5⁻, 6⁺). */
  function shindoBadge(ctx, x, y, size, sh) {
    const [bg, fg, border] = NHK_SHINDO[sh] || NHK_SHINDO[1];
    const h = size / 2;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - h + size * 0.06, y - h + size * 0.06, size, size);
    ctx.fillStyle = bg; ctx.fillRect(x - h, y - h, size, size);
    ctx.strokeStyle = border; ctx.lineWidth = Math.max(1.5, size * (sh === '7' ? 0.1 : 0.06)); ctx.strokeRect(x - h, y - h, size, size);
    const num = String(sh)[0];
    const sign = String(sh)[1] || '';
    ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.font = `800 ${Math.round(size * 0.78)}px "Noto Sans", "Segoe UI", Arial, sans-serif`;
    ctx.fillText(num, x - (sign ? size * 0.1 : 0), y + size * 0.04);
    if (sign) {
      ctx.font = `800 ${Math.round(size * 0.46)}px "Noto Sans", "Segoe UI", Arial, sans-serif`;
      ctx.fillText(sign === '-' ? '−' : '+', x + size * 0.28, y - size * 0.22);
    }
  }

  /**
   * Carte des intensités d'un séisme (comme la NHK) : mer bleue, terre, intensité de chaque
   * département dans sa case, épicentre ✕, encart « Intensité max » et heure du séisme.
   */
  /**
   * Vue par défaut de la carte des intensités : { lat, lon, span } (centre, et demi-hauteur en
   * degrés de latitude), autour des départements d'intensité 3 et plus et de l'épicentre.
   */
  function shindoView(a, { mini = false } = {}) {
    const ints = allIntensities(a);
    const codes = Object.keys(ints);
    // Les plus fortes : 3 et plus, à deux crans au plus de l'intensité maximale.
    const top = Math.max(0, ...codes.map((c) => ORDER.indexOf(ints[c])));
    const strong = codes.filter((c) => ORDER.indexOf(ints[c]) >= Math.max(3, top - 2));
    const box = focusBox((strong.length ? strong : codes).filter((c) => c !== '988'), a.epicenter || null, mini ? 2.6 : 3.2);
    return { lat: (box[0] + box[1]) / 2, lon: (box[2] + box[3]) / 2, span: (box[1] - box[0]) / 2 };
  }

  /**
   * view : { lat, lon, span } choisie dans M-Alert-sender (carte déplacée ou zoomée) ; sinon la vue
   * par défaut.
   */
  // final : « Rapport final » affiché : terre brune (comme la NHK), sinon verte (premières informations).
  function drawShindoMap(canvas, a, { width = 1920, height = 1080, mini = false, view = null, final = false } = {}) {
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    const W = width; const H = height;
    const { deps } = geoData();
    const ints = allIntensities(a);
    const codes = Object.keys(ints);
    const v = view && Number.isFinite(view.lat) && Number.isFinite(view.lon) && view.span > 0 ? view : shindoView(a, { mini });
    const kk = Math.cos((v.lat * Math.PI) / 180);
    // Zone aux proportions de l'image (sinon les départements des côtés manquent).
    const halfLon = (v.span * (W / H)) / kk;
    const box = [v.lat - v.span, v.lat + v.span, v.lon - halfLon, v.lon + halfLon];
    const P = projector(box, 0, 0, W, H);
    const sea = ctx.createLinearGradient(0, 0, W, H);
    sea.addColorStop(0, '#1d40c0'); sea.addColorStop(1, '#1638a8');
    ctx.fillStyle = sea; ctx.fillRect(0, 0, W, H);
    const visible = (d) => !(d.box[1] < box[0] || d.box[0] > box[1] || d.box[3] < box[2] || d.box[2] > box[3]);
    const shown = Object.entries(deps).filter(([c, d]) => c !== '988' && visible(d));
    for (const [, d] of shown) {
      ctx.beginPath();
      for (const poly of d.polys) pathPoly(ctx, poly, P);
      ctx.fillStyle = final ? '#9b7a5a' : '#5f8f74'; ctx.fill('evenodd');
      ctx.strokeStyle = final ? '#4a3a2c' : '#2f4a3c'; ctx.lineWidth = Math.max(1, W / 900); ctx.stroke();
    }
    // Épicentre.
    if (a.epicenter) {
      const [ex, ey] = P(a.epicenter.lat, a.epicenter.lon);
      const r = Math.max(8, H / 34);
      ctx.lineCap = 'round';
      for (const [col, lw] of [['#ffd400', r / 1.7], ['#d01010', r / 3]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(ex - r, ey - r); ctx.lineTo(ex + r, ey + r); ctx.moveTo(ex + r, ey - r); ctx.lineTo(ex - r, ey + r); ctx.stroke();
      }
    }
    // Intensités : les plus fortes dessinées en dernier (au-dessus).
    const size = Math.round(H * (mini ? 0.07 : 0.054));
    const list = shown.filter(([c]) => ints[c]).sort(([x], [y]) => ORDER.indexOf(ints[x]) - ORDER.indexOf(ints[y]));
    for (const [c, d] of list) {
      const [la, lo] = labelPoint(d);
      const [x, y] = P(la, lo);
      if (x < size / 2 || y < size / 2 || x > W - size / 2 || y > H - size / 2) continue;
      shindoBadge(ctx, x, y, size, ints[c]);
    }
    // Encart « Intensité max » et heure, en haut à gauche.
    const max = a.shindo && NHK_SHINDO[a.shindo] ? String(a.shindo) : codes.sort((x, y) => ORDER.indexOf(ints[y]) - ORDER.indexOf(ints[x])).map((c) => ints[c])[0];
    const pad = H * 0.025;
    const bw = W * (mini ? 0.22 : 0.15); const bh = H * (mini ? 0.17 : 0.13);
    if (max) {
      const [bg, fg] = NHK_SHINDO[max];
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(pad + 4, pad + 4, bw, bh);
      ctx.fillStyle = ['6-', '6+'].includes(max) ? '#f6c3d3' : max === '7' ? '#c41a1a' : bg; ctx.fillRect(pad, pad, bw, bh);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, H / 300); ctx.strokeRect(pad, pad, bw, bh);
      const tc = ['6-', '6+'].includes(max) ? '#b00020' : max === '7' ? '#fff' : fg;
      ctx.fillStyle = tc; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(bh * 0.22)}px "Noto Sans", "Segoe UI", Arial, sans-serif`;
      ctx.fillText('Intensité max', pad + bw / 2, pad + bh * 0.22);
      ctx.font = `900 ${Math.round(bh * 0.58)}px "Noto Sans", "Segoe UI", Arial, sans-serif`;
      const label = max.length > 1 ? `${max[0]}${max[1] === '-' ? '−' : '+'}` : max;
      fitText(ctx, label, bw * 0.92, Math.round(bh * 0.58), Math.round(bh * 0.3), '900');
      ctx.fillText(label, pad + bw / 2, pad + bh * 0.64);
    }
    // Heure du séisme (et magnitude).
    const t = new Date(a.originTime || a.createdAt || Date.now());
    const day = t.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: (M && M.timeZone && M.timeZone()) || undefined });
    const when = `Le ${day} vers ${hourOf(t.toISOString())}${typeof a.magnitude === 'number' ? `  ·  M${frNum(a.magnitude)}` : ''}`;
    const tx = pad + (max ? bw + pad * 0.6 : 0); const th = bh * 0.42;
    ctx.font = `700 ${Math.round(th * 0.62)}px "Noto Sans", "Segoe UI", Arial, sans-serif`;
    const tw = Math.min(W - tx - pad, ctx.measureText(when).width + th * 0.9);
    const grd = ctx.createLinearGradient(0, pad, 0, pad + th);
    grd.addColorStop(0, '#5b7fe0'); grd.addColorStop(1, '#2d4fb8');
    ctx.fillStyle = grd; ctx.fillRect(tx, pad, tw, th);
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1.5, H / 500); ctx.strokeRect(tx, pad, tw, th);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(when, tx + th * 0.45, pad + th / 2 + 1, tw - th * 0.9);
    return canvas;
  }

  window.MAlertBanner = { drawShindoMap, shindoView, allIntensities, drawBanner, drawTsunamiMap, drawInfo, cancelledInfo, bannerBlob, headerOf, watchOf, placesOf, infoLines, infoParts, deptKm, onLand, shortName, drawZonesMap };
})();
