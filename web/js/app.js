/* M-Alert — application de réception des alertes. */
(function () {
  'use strict';

  const M = window.MAlert;
  const { PHENOMENA, VIGILANCE, LEVELS, escapeHtml } = M;
  const native = window.malertNative || null; // présent dans l'application de bureau (Electron)
  const $ = (id) => document.getElementById(id);

  // ---------- Réglages ----------

  const DEFAULTS = {
    department: null,
    extra: [],
    all: false,
    minLevel: 1,
    categoriesOff: [], // catégories d'alertes désactivées (les nouvelles restent actives)
    phenomenaOff: [], // phénomènes météo désactivés (ex. 6 = canicule)
    sound: true,
    volume: 0.8,
    repeat: true,
    vigNotify: true,
    front: true,
    push: false,
    notices: true, // notifications de M-Alert (messages hors alerte)
    sounds: {}, // sons choisis par type d'alerte : { clé: { file, volume } } (voir sound.js)
    tiles: false,
    serverUrl: (window.MALERT_CONFIG && window.MALERT_CONFIG.serverUrl) || 'http://localhost:8080',
  };
  let settings = { ...DEFAULTS, ...M.storage.get('malert.settings', {}) };
  const saveSettings = () => M.storage.set('malert.settings', settings);
  window.MAlertSound.configure(settings.sounds);

  // ---------- Sons des alertes (réglages) ----------

  const SOUND_ROWS = [
    ['information', 'Information et notifications'],
    ['eew', 'Jaune et orange'],
    ['rouge', 'Rouge'],
    ['majeur', 'Majeure'],
    ['tsunami', 'Crues, inondations, tsunamis'],
    ['seisme', 'Tremblement de terre'],
    ['countdown', 'Bip du compte à rebours (séismes)'],
  ];
  const SOUND_NAMES = {
    information: 'Information',
    eew: 'Jaune / orange',
    rouge: 'Rouge',
    majeur: 'Majeure',
    tsunami: 'Crues et tsunami',
    'seisme-eew': 'Séisme EEW',
    'seisme-eew2': 'Séisme EEW 2',
    'seisme-leger': 'Séisme EEW léger',
    countdown: 'Bip du compte à rebours',
  };

  function renderSoundRows() {
    $('setSounds').innerHTML = SOUND_ROWS.map(([key, label]) => `
      <div class="sound-row" data-sound="${key}">
        <span class="sound-label">${label}</span>
        <select data-k="file" aria-label="Son : ${label}">
          <option value="">${key === 'seisme' ? 'Choisi par M-Alert' : 'Par défaut'}</option>
          ${window.MAlertSound.SOUND_FILES.map((f) => `<option value="${f}">${SOUND_NAMES[f]}</option>`).join('')}
        </select>
        <input type="range" data-k="volume" min="0" max="1" step="0.05" aria-label="Volume : ${label}">
        <span class="sound-vol" data-k="pct"></span>
        <button type="button" class="btn small sound-test" title="Écouter ce son" aria-label="Écouter : ${label}">▶</button>
      </div>`).join('');
  }
  renderSoundRows();

  function fillSoundRows(sounds) {
    $('setSounds').querySelectorAll('.sound-row').forEach((row) => {
      const c = (sounds || {})[row.dataset.sound] || {};
      row.querySelector('[data-k="file"]').value = window.MAlertSound.SOUND_FILES.includes(c.file) ? c.file : '';
      row.querySelector('[data-k="volume"]').value = String(c.volume == null ? 1 : c.volume);
      row.querySelector('[data-k="pct"]').textContent = `${Math.round(Number(row.querySelector('[data-k="volume"]').value) * 100)} %`;
    });
  }

  function readSoundRows() {
    const out = {};
    $('setSounds').querySelectorAll('.sound-row').forEach((row) => {
      const file = row.querySelector('[data-k="file"]').value;
      const volume = Number(row.querySelector('[data-k="volume"]').value);
      if (file || volume !== 1) out[row.dataset.sound] = { file, volume };
    });
    return out;
  }

  $('setSounds').addEventListener('input', (e) => {
    const row = e.target.closest('.sound-row');
    if (row && e.target.dataset.k === 'volume') row.querySelector('[data-k="pct"]').textContent = `${Math.round(Number(e.target.value) * 100)} %`;
  });
  $('setSounds').addEventListener('click', (e) => {
    const btn = e.target.closest('.sound-test');
    if (!btn) return;
    const row = btn.closest('.sound-row');
    const key = row.dataset.sound;
    const file = row.querySelector('[data-k="file"]').value || (key === 'seisme' ? 'seisme-eew' : key);
    const volume = Number($('setVolume').value) * Number(row.querySelector('[data-k="volume"]').value);
    window.MAlertSound.unlock();
    window.MAlertSound.play(1, { file, volume, loop: false });
  });

  function myDepartments() {
    const list = settings.department ? [settings.department] : [];
    for (const d of settings.extra) if (!list.includes(d)) list.push(d);
    return list;
  }

  // ---------- État ----------

  let alerts = [];          // alertes actives
  let vigilance = null;     // dernières données de vigilance
  let day = 0;              // 0 = aujourd'hui, 1 = demain, 2 = après-demain (prévision M-Alert)
  let selectedCode = null;  // département cliqué sur la carte
  const seen = new Set(M.storage.get('malert.seen', []));
  const queue = [];         // alertes en attente d'affichage (bannière)
  let current = null;       // alerte affichée en bannière
  let notices = [];         // notifications des dernières 24 h
  // Notifications déjà affichées. Premier lancement (null) : celles déjà envoyées ne s'affichent pas.
  const noticeSeenStored = M.storage.get('malert.noticeSeen', null);
  const noticeSeen = new Set(noticeSeenStored || []);
  let noticeFirstRun = noticeSeenStored === null;

  function markSeen(id) {
    seen.add(id);
    M.storage.set('malert.seen', [...seen].slice(-300));
  }

  // Alertes qui ont sonné pour moi, avec leur niveau : à l'ouverture, une alerte déjà vue sonne
  // de nouveau si mon département y a été ajouté (ou si son niveau a monté) pendant que
  // l'application était fermée. Première fois : les alertes déjà vues comptent comme signalées.
  // Pour chaque alerte : niveau et départements suivis pour lesquels elle a déjà sonné.
  let alerted = M.storage.get('malert.alerted', null);
  if (!alerted) {
    alerted = {};
    for (const id of seen) alerted[id] = 5;
    M.storage.set('malert.alerted', alerted); // une seule fois : les alertes vues ensuite en silence n'y figurent pas
  }
  /** { level, mine } ; mine = null pour les anciennes entrées (aucun département « nouveau »). */
  function alertedRecord(id) {
    const r = alerted[id];
    if (r == null) return { level: 0, mine: [], ring: 0 };
    return typeof r === 'number' ? { level: r, mine: null, ring: 0 } : { ring: 0, ...r };
  }

  /** Mes départements (principal et suivis) visés par l'alerte. */
  function myIncluded(alert) {
    const mine = myDepartments();
    return alert.departments.includes('ALL') ? mine : mine.filter((d) => alert.departments.includes(d));
  }

  function markAlerted(alert) {
    const r = alertedRecord(alert.id);
    alerted[alert.id] = {
      level: Math.max(r.level, alert.level),
      mine: r.mine === null ? null : [...new Set([...r.mine, ...myIncluded(alert)])],
      ring: Math.max(r.ring, alert.ring || 0), // relances déjà reçues
    };
    const keep = Object.keys(alerted).slice(-300);
    alerted = Object.fromEntries(keep.map((id) => [id, alerted[id]]));
    M.storage.set('malert.alerted', alerted);
  }

  /** Alertes à signaler à l'ouverture : jamais vues, ou étendues à un de mes départements / plus graves. */
  function missedAlerts(list) {
    return list.filter((a) => {
      if (!seen.has(a.id)) return true;
      if (!matchesMe(a)) return false;
      const r = alertedRecord(a.id);
      // Relancée par M-Alert pendant que l'application était fermée : elle sonne de nouveau.
      if ((a.ring || 0) > r.ring) {
        seen.delete(a.id);
        a.__ring = true;
        return true;
      }
      if (a.silent) return false; // alerte silencieuse : jamais d'alerte sonore
      const newDepartment = r.mine !== null && myIncluded(a).some((d) => !r.mine.includes(d));
      if (r.level >= a.level && !newDepartment) return false;
      seen.delete(a.id);
      a.__updated = true;
      return true;
    });
  }

  // ---------- Carte ----------

  const map = window.MAlertMap.create('map', {
    tooltip: tooltipHtml,
    onDepartmentClick: (code) => {
      selectedCode = code;
      renderSelected();
    },
  });

  const DAY_NAMES = ['aujourd\'hui', 'demain', 'après-demain'];

  function periodData(d = day) {
    // Après-demain : prévision M-Alert d'après le vent et les vagues (pas de vigilance Météo-France).
    if (d === 2) return vigilance && vigilance.outlook ? vigilance.outlook : null;
    return vigilance && vigilance.periods && vigilance.periods[d] ? vigilance.periods[d] : null;
  }

  /** Valeurs prévues par M-Alert pour après-demain (rafales, vagues) d'un phénomène. */
  function outlookValue(p) {
    if (p.id === 1 && p.gust) return ` : rafales ${p.gust} km/h${p.mean ? ` (moyen ${p.mean})` : ''}${p.at ? `, pic vers ${Number(p.at.slice(11, 13))} h` : ''}`;
    if (p.id === 9 && typeof p.hs === 'number') return ` : vagues ${p.hs.toLocaleString('fr-FR')} m${typeof p.water === 'number' && p.water >= 0 ? ', mer haute' : ''}${p.at ? `, pic vers ${Number(p.at.slice(11, 13))} h` : ''}`;
    return '';
  }

  function vigFor(code, d = day) {
    const p = periodData(d);
    return (p && p.departments[code]) || null;
  }

  function alertsFor(code) {
    return alerts.filter((a) => a.departments.includes('ALL') || a.departments.includes(code));
  }

  /** Alerte M-Alert de plus haut niveau pour un département, aujourd'hui (0) ou demain (1). */
  function topAlertFor(code, d) {
    let from = Date.now();
    if (d >= 1) {
      const p = periodData(d);
      const t = new Date();
      t.setHours(24 * d, 0, 0, 0);
      from = p ? new Date(p.begin).getTime() : t.getTime();
    }
    return alertsFor(code)
      .filter((a) => wantsCategory(a) && new Date(a.expiresAt).getTime() > from)
      .reduce((m, a) => (!m || a.level > m.level ? a : m), null);
  }

  function phenRows(vig) {
    if (!vig || !vig.phenomena || !vig.phenomena.length) return '';
    return vig.phenomena.map((p) => {
      const ph = PHENOMENA[p.id] || PHENOMENA[0];
      return `<div class="tt-row"><span class="sw" style="width:9px;height:9px;border-radius:2px;background:${VIGILANCE[p.level].color}"></span>${ph.icon} ${escapeHtml(ph.name)}${escapeHtml(outlookValue(p))}</div>`;
    }).join('');
  }

  function tooltipHtml(code, nom) {
    const vig = vigFor(code);
    const level = vig ? vig.level : 0;
    const al = alertsFor(code);
    let html = `<div class="tt-title">${escapeHtml(nom)} (${code})</div>`;
    html += `<div class="tt-row">${day === 2 ? 'Prévision M-Alert' : 'Vigilance'} ${DAY_NAMES[day]} : <b style="color:${VIGILANCE[level].color}">${VIGILANCE[level].name}</b></div>`;
    html += phenRows(vig);
    if (vig && vig.manual) html += '<div class="tt-row">✎ Corrigé par M-Alert</div>';
    for (const a of al) {
      html += `<div class="tt-row" style="margin-top:4px"><span class="tag" style="background:${LEVELS[a.level].color};color:${LEVELS[a.level].text}">${escapeHtml(M.alertLevelName(a))}</span>${escapeHtml(a.title)}</div>`;
    }
    return html;
  }

  function refreshMap() {
    const p = periodData();
    map.setVigilance(p ? p.departments : {});
    map.setAlerts(alerts);
    map.setHighlighted(myDepartments());
    renderIntensities();
  }

  /**
   * Intensités estimées par département pendant un séisme (option « intensités sur la carte ») :
   * pour chaque alerte séisme en cours avec épicentre et magnitude, intensité attendue au centre de
   * chaque département (même calcul que « chez vous »), la plus forte si plusieurs séismes ;
   * intensité 1 et plus seulement.
   */
  function renderIntensities() {
    const quakes = settings.intensityMap === false ? [] : alerts.filter((a) => a.category === 'seisme' && M.isActive(a) && !a.silent
      && ((a.epicenter && typeof a.magnitude === 'number') || (a.intensities && Object.keys(a.intensities).length)));
    const best = new Map();
    for (const a of quakes) {
      for (const { code } of M.departmentList()) {
        const s = deptIntensity(a, code);
        const rank = s ? M.SHINDO_ORDER.indexOf(s) : -1;
        if (rank >= 1 && rank > (best.get(code) ?? -1)) best.set(code, rank);
      }
    }
    map.setIntensities([...best].map(([code, rank]) => ({ code, shindo: M.SHINDO_ORDER[rank] })));
  }

  // ---------- Panneau latéral ----------

  function depCardHtml(code, { mine }) {
    const today = vigFor(code, 0);
    const tomorrow = vigFor(code, 1);
    const after = vigFor(code, 2);
    // Niveau affiché : le plus élevé entre la vigilance Météo-France et les alertes M-Alert du jour.
    const pill = (vig, label, d) => {
      const l = vig ? vig.level : 0;
      const a = topAlertFor(code, d);
      if (a && a.level >= 2 && a.level > l) {
        const lv = LEVELS[a.level];
        return `<div class="vig-pill" style="background:${lv.color};color:${lv.text}"><small>${label} · M-Alert</small>${escapeHtml(M.alertLevelName(a))}</div>`;
      }
      return `<div class="vig-pill lvl-${l}"><small>${label}</small>${VIGILANCE[l].name}</div>`;
    };
    const shown = [today, tomorrow, after][day];
    const phen = shown && shown.phenomena.length
      ? `<ul class="phen-list">${shown.phenomena.map((p) => {
        const ph = PHENOMENA[p.id] || PHENOMENA[0];
        return `<li><span class="sw" style="background:${VIGILANCE[p.level].color}"></span>${ph.icon} ${escapeHtml(ph.name)} — ${VIGILANCE[p.level].name.toLowerCase()}${escapeHtml(outlookValue(p))}</li>`;
      }).join('')}</ul>`
      : '';
    const outlookNote = day === 2
      ? '<p class="small" style="margin:8px 0 0;opacity:.8">Après-demain : prévision M-Alert (vent violent, vagues-submersion), pas une vigilance Météo-France.</p>'
      : '';
    const corrected = shown && shown.manual && vigilance && vigilance.source !== 'manual'
      ? '<p class="small" style="margin:8px 0 0;color:#c4b5fd">✎ Vigilance corrigée manuellement par M-Alert.</p>'
      : '';
    const al = alertsFor(code);
    const alertHtml = al.length
      ? `<div class="alert-list" style="margin-top:10px">${al.map(alertItemHtml).join('')}</div>`
      : '';
    return `
      <h2>${mine ? 'Mon département' : 'Département sélectionné'}</h2>
      <p class="dep-title">${escapeHtml(M.departmentName(code))}</p>
      <div class="vig-pills">${pill(today, 'Aujourd\'hui', 0)}${pill(tomorrow, 'Demain', 1)}${vigilance && vigilance.outlook ? pill(after, 'Après-demain', 2) : ''}</div>
      ${phen}${outlookNote}${corrected}${alertHtml}`;
  }

  function renderMyDep() {
    const card = $('myDepCard');
    if (!settings.department) {
      card.innerHTML = `<h2>Mon département</h2><p class="muted">Aucun département choisi.</p>
        <div class="btn-row"><button class="btn primary" type="button" data-action="settings">Choisir mon département</button></div>`;
      return;
    }
    card.innerHTML = depCardHtml(settings.department, { mine: true });
  }

  function renderSelected() {
    const card = $('selectedCard');
    if (!selectedCode || selectedCode === settings.department) {
      card.classList.add('hidden');
      return;
    }
    const followed = settings.extra.includes(selectedCode);
    card.innerHTML = depCardHtml(selectedCode, { mine: false }) + `
      <div class="btn-row">
        <button class="btn small" type="button" data-action="set-main" data-code="${selectedCode}">Définir comme mon département</button>
        <button class="btn small ghost" type="button" data-action="toggle-follow" data-code="${selectedCode}">${followed ? 'Ne plus suivre' : 'Suivre aussi'}</button>
        <button class="btn small ghost" type="button" data-action="close-selected">Fermer</button>
      </div>`;
    card.classList.remove('hidden');
  }

  function isMine(alert) {
    if (alert.departments.includes('ALL')) return true;
    return alert.departments.some((d) => myDepartments().includes(d));
  }

  function alertItemHtml(a) {
    const lv = LEVELS[a.level];
    const ph = M.alertKind(a);
    return `<div class="alert-item ${isMine(a) ? 'mine' : ''}" data-alert="${a.id}" style="border-left-color:${lv.color}">
      <div class="t"><span class="tag" style="background:${lv.color};color:${lv.text}">${escapeHtml(M.alertLevelName(a))}</span>${a.test ? '<span class="tag" style="background:#6d28d9;color:#fff">TEST</span>' : ''}${escapeHtml(a.title)}</div>
      <div class="m">${ph.icon} ${escapeHtml(ph.name)}${M.quakeSummary(a) ? ` · ${escapeHtml(M.quakeSummary(a))}` : ''}${M.tornadoSummary(a) ? ` · ${escapeHtml(M.tornadoSummary(a))}` : ''}${M.fireSummary(a) ? ` · ${escapeHtml(M.fireSummary(a))}` : ''}${M.pollutionSummary(a) ? ` · ${escapeHtml(M.pollutionSummary(a))}` : ''}${M.tsunamiSummary(a) ? ` · ${escapeHtml(M.tsunamiSummary(a))}` : ''} · ${escapeHtml(M.departmentsLabel(a.departments, 3))}</div>
      <div class="m">${M.relativeTime(a.createdAt)}${a.updatedAt ? ` · modifiée ${M.relativeTime(a.updatedAt)}` : ''} · ${M.untilText(a, { short: true })}${M.sourceShort(a) ? ` · ${escapeHtml(M.sourceShort(a))}` : ''}</div>
    </div>`;
  }

  // Filtre de la liste « Alertes en cours » : catégorie ou phénomène météo.
  let alertFilter = M.storage.get('malert.alertFilter', '');
  $('alertFilter').innerHTML = '<option value="">Toutes les alertes</option>'
    + `<optgroup label="Catégorie">${Object.entries(M.CATEGORIES).map(([id, c]) => `<option value="cat:${id}">${c.icon} ${escapeHtml(c.name)}</option>`).join('')}</optgroup>`
    + `<optgroup label="Phénomène météo">${Object.entries(PHENOMENA).map(([id, p]) => `<option value="phen:${id}">${p.icon} ${escapeHtml(p.name)}</option>`).join('')}</optgroup>`;
  $('alertFilter').value = alertFilter;
  if ($('alertFilter').value !== alertFilter) alertFilter = '';
  $('alertFilter').addEventListener('change', (e) => {
    alertFilter = e.target.value;
    M.storage.set('malert.alertFilter', alertFilter);
    renderAlerts();
  });

  function passesFilter(a) {
    if (!alertFilter) return true;
    const [kind, value] = alertFilter.split(':');
    if (kind === 'cat') return M.categoryOf(a) === value;
    return M.categoryOf(a) === 'meteo' && String(Number(a.phenomenon) || 0) === value;
  }

  /**
   * Vigilances Météo-France en cours (jaune, orange, rouge), affichées dans « Alertes en cours »
   * avec les alertes M-Alert : une ligne par phénomène et par couleur, avec ses départements et,
   * si Météo-France la donne, la plage horaire.
   */
  function vigilanceItems() {
    if (settings.vigInList === false) return [];
    const p = periodData(0);
    if (!p || !p.departments) return [];
    const groups = {};
    for (const [code, v] of Object.entries(p.departments)) {
      for (const ph of v.phenomena || []) {
        if (ph.level < 2) continue;
        const key = `${ph.id}-${ph.level}`;
        const g = (groups[key] = groups[key] || { id: `vig-${key}`, __vig: true, category: 'meteo', phenomenon: ph.id, level: ph.level, departments: [], begin: null, end: null, manual: false });
        g.departments.push(code);
        if (v.manual) g.manual = true;
        for (const s of ph.slots || []) {
          if (s.level < ph.level) continue;
          if (!g.begin || s.begin < g.begin) g.begin = s.begin;
          if (!g.end || s.end > g.end) g.end = s.end;
        }
      }
    }
    return Object.values(groups).map((g) => ({ ...g, departments: g.departments.sort(), end: g.end || p.end, createdAt: '' }));
  }

  function vigItemHtml(g) {
    const v = VIGILANCE[g.level];
    const ph = PHENOMENA[g.phenomenon] || PHENOMENA[0];
    const when = g.begin && new Date(g.begin) > Date.now() ? `de ${M.formatTime(g.begin)} à ${M.formatTime(g.end)}` : `jusqu'à ${M.formatTime(g.end)}`;
    return `<div class="alert-item vig-item ${isMine(g) ? 'mine' : ''}" data-vig="${g.id}" style="border-left-color:${v.color}">
      <div class="t"><span class="tag" style="background:${v.color};color:${LEVELS[g.level].text}" title="Vigilance Météo-France">${escapeHtml(v.name)}</span>${ph.icon} ${escapeHtml(ph.name)}</div>
      <div class="m">🇫🇷 Météo-France${g.manual ? ' (corrigée par M-Alert)' : ''} · ${escapeHtml(M.departmentsLabel(g.departments, 3))}</div>
      <div class="m">${escapeHtml(when)}</div>
    </div>`;
  }

  function renderAlerts() {
    const vig = vigilanceItems();
    const all = [...alerts, ...vig];
    const sorted = all.filter(passesFilter).sort((a, b) => (isMine(b) - isMine(a)) || (b.level - a.level) || (Boolean(a.__vig) - Boolean(b.__vig)) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    $('alertCount').textContent = alertFilter ? `${sorted.length}/${all.length}` : all.length;
    $('alertList').innerHTML = sorted.length
      ? sorted.map((a) => (a.__vig ? vigItemHtml(a) : alertItemHtml(a))).join('')
      : `<div class="empty">${alertFilter && all.length ? 'Aucune alerte de ce type en cours.' : 'Aucune alerte en cours ✅'}</div>`;
  }

  function renderVigInfo() {
    const p = periodData();
    const info = $('vigInfo');
    const badge = M.vigilanceBadge(vigilance);
    $('vigBadge').classList.toggle('hidden', !badge);
    if (badge) {
      $('vigBadge').className = badge.cls;
      $('vigBadge').textContent = badge.text;
      $('vigBadge').title = badge.title;
    }
    if (day === 2 && vigilance && !p) {
      $('mapCaption').textContent = 'Après-demain : prévision M-Alert pas encore disponible (vent et vagues).';
      return;
    }
    if (!vigilance || !p) {
      info.textContent = vigilance && vigilance.error ? `Vigilance indisponible : ${vigilance.error}` : 'Vigilance en attente du serveur…';
      $('mapCaption').textContent = 'Vigilance : en attente…';
      return;
    }
    info.textContent = vigilance.source === 'manual'
      ? `Vigilance saisie manuellement par M-Alert${vigilance.reason === 'api-down' ? ' (API Météo-France indisponible)' : ''} · ${M.formatDateTime(vigilance.updatedAt)}`
      : `Mise à jour : ${M.formatDateTime(vigilance.updatedAt)}${vigilance.corrections ? ` · ${vigilance.corrections} département(s) corrigé(s) par M-Alert` : ''}${vigilance.error ? ' · ⚠ ' + vigilance.error : ''}`;
    $('mapCaption').textContent = day === 2
      ? `Après-demain (${new Date(`${p.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}) · prévision M-Alert du vent violent et des vagues-submersion, Météo-France ne publiant pas de vigilance au-delà de demain · ${M.formatTime(p.updatedAt)}`
      : `Vigilance ${day ? 'de demain' : 'd\'aujourd\'hui'} · ${M.formatDateTime(p.begin)} → ${M.formatDateTime(p.end)}`;
  }

  function renderAll() {
    refreshMap();
    renderMyDep();
    renderSelected();
    renderAlerts();
    renderVigInfo();
  }

  document.addEventListener('click', (e) => {
    const noticeItem = e.target.closest('[data-notice]');
    if (noticeItem) {
      const n = notices.find((x) => x.id === noticeItem.dataset.notice);
      if (n && (!current || current.__notice)) showNoticeBanner(n);
      return;
    }
    // Vigilance Météo-France : la carte montre ses départements (vigilance d'aujourd'hui).
    const vigItem = e.target.closest('[data-vig]');
    if (vigItem) {
      const g = vigilanceItems().find((x) => x.id === vigItem.dataset.vig);
      if (g) {
        // Bannière de la vigilance (comme une notification), sauf si une alerte est affichée.
        if (!current || current.__notice) showVigBanner(g);
        else focusAlert(g);
      }
      return;
    }
    const item = e.target.closest('[data-alert]');
    if (item) {
      const a = alerts.find((x) => x.id === item.dataset.alert);
      if (a) {
        focusAlert(a);
        showOverlay(a, { silent: true });
      }
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const code = btn.dataset.code;
    switch (btn.dataset.action) {
      case 'settings': openSettings(); break;
      case 'set-main':
        settings.department = code;
        settings.extra = settings.extra.filter((d) => d !== code);
        saveSettings(); onSettingsChanged(); break;
      case 'toggle-follow':
        settings.extra = settings.extra.includes(code) ? settings.extra.filter((d) => d !== code) : [...settings.extra, code];
        saveSettings(); onSettingsChanged(); break;
      case 'close-selected': selectedCode = null; renderSelected(); break;
      default: break;
    }
  });

  document.querySelectorAll('#dayToggle button').forEach((b) => b.addEventListener('click', () => {
    day = Number(b.dataset.day);
    document.querySelectorAll('#dayToggle button').forEach((x) => x.classList.toggle('active', x === b));
    renderAll();
  }));

  // Horloge
  setInterval(() => { $('clock').textContent = new Date().toLocaleTimeString('fr-FR'); }, 1000);

  // ---------- Toasts ----------

  function toast(title, body, color, onClick, { duration = 9000, className = '' } = {}) {
    const el = document.createElement('div');
    el.className = `toast ${className}`.trim();
    if (color) el.style.borderLeftColor = color;
    el.innerHTML = `<strong>${escapeHtml(title)}</strong>${body ? `<span class="muted small">${escapeHtml(body)}</span>` : ''}`;
    el.addEventListener('click', () => {
      el.remove();
      if (onClick) onClick();
    });
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 4) $('toasts').firstElementChild.remove(); // pas d'accumulation
    setTimeout(() => el.remove(), duration);
  }

  // ---------- Notifications de M-Alert (messages sans alerte) ----------

  const NOTICE_COLOR = '#60a5fa';
  const VOID_COLOR = '#cbd5e1'; // annulation d'une alerte (fausse alerte)
  const NOTICE_TTL = 24 * 3600 * 1000;

  function noticeForMe(n) {
    if (settings.notices === false) return false;
    if (settings.all || n.departments.includes('ALL')) return true;
    return n.departments.some((d) => myDepartments().includes(d));
  }

  function markNoticeSeen(id) {
    noticeSeen.add(id);
    M.storage.set('malert.noticeSeen', [...noticeSeen].slice(-300));
  }

  function noticeItemHtml(n) {
    return `<div class="alert-item notice-item" data-notice="${n.id}" style="border-left-color:${NOTICE_COLOR}">
      <div class="t">${n.test ? '<span class="tag" style="background:#6d28d9;color:#fff">TEST</span>' : ''}${escapeHtml(n.title)}</div>
      ${n.body ? `<div class="desc">${escapeHtml(n.body)}</div>` : ''}
      <div class="m">${M.relativeTime(n.createdAt)} · ${escapeHtml(M.departmentsLabel(n.departments, 3))}</div>
    </div>`;
  }

  function renderNotices() {
    const now = Date.now();
    notices = notices.filter((n) => new Date(n.createdAt).getTime() + NOTICE_TTL > now);
    const mine = notices.filter(noticeForMe).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    $('noticesCard').classList.toggle('hidden', !mine.length);
    $('noticeCount').textContent = mine.length;
    $('noticeList').innerHTML = mine.map(noticeItemHtml).join('');
  }

  /** Affiche une notification reçue (une seule fois) : message dans l'application et notification système. */
  function showNotice(n) {
    if (noticeSeen.has(n.id)) return;
    markNoticeSeen(n.id);
    if (!noticeForMe(n)) return;
    // Bandeau en haut (comme un séisme) ; derrière une alerte déjà affichée, il attend son tour.
    if (current && !current.__notice) {
      queue.push({ ...n, __notice: true });
      $('ovQueue').textContent = `+${queue.length} autre(s) alerte(s)`;
    } else {
      showNoticeBanner(n);
    }
    if (settings.sound) window.MAlertSound.play({ level: 1, category: 'meteo', phenomenon: 0 }, { volume: settings.volume, loop: false });
    // Persistante (comme les alertes orange et rouge) : une notification qui expire seule peut ne
    // jamais s'afficher (KDE Plasma notamment, quand la fenêtre de M-Alert passe au premier plan).
    systemNotification(`${n.test ? '[TEST] ' : ''}🔔 ${n.title}`, n.body || M.departmentsLabel(n.departments, 3), { tag: `notice-${n.id}`, urgent: true });
    // Application de bureau : la fenêtre revient au premier plan, comme pour une alerte.
    if (native) native.alert({ level: 1, front: settings.front });
  }

  /**
   * Alerte annulée par M-Alert (fausse alerte : séisme qui n'a pas eu lieu) : bandeau d'annulation,
   * son d'information et notification, comme une notification de M-Alert.
   */
  function showVoided(a) {
    const kind = M.alertKind(a);
    const n = {
      id: `void-${a.id}`, __void: true, test: a.test, departments: a.departments, createdAt: a.voided.at,
      title: `Annulation : ${a.title}`, phen: `${kind.icon} ${kind.name}`,
      body: `${a.voided.reason}\n\nL'alerte « ${M.alertLevelLabel(a)} » envoyée ${M.formatDateTime(a.createdAt)} est annulée : vous pouvez reprendre vos activités normalement.`,
    };
    if (current && !current.__notice) {
      queue.push({ ...n, __notice: true });
      $('ovQueue').textContent = `+${queue.length} autre(s) alerte(s)`;
    } else {
      showNoticeBanner(n);
    }
    // Séisme annulé : son EEW (eew.mp3, réglable dans les sons « Jaune et orange ») ; autre alerte
    // annulée (tsunami lié) : son d'information.
    if (settings.sound) {
      const sound = a.category === 'seisme' ? { level: 2, category: 'meteo', phenomenon: 0 } : { level: 1, category: 'meteo', phenomenon: 0 };
      window.MAlertSound.play(sound, { volume: settings.volume, loop: false });
    }
    systemNotification(`${a.test ? '[TEST] ' : ''}❌ Alerte annulée — ${a.title}`, a.voided.reason, { tag: `void-${a.id}`, urgent: true });
    if (native) native.alert({ level: 1, front: settings.front });
  }

  /** Vigilance Météo-France en bannière : couleur, phénomène, départements, horaires et consignes. */
  function showVigBanner(g, { ring = false } = {}) {
    const v = VIGILANCE[g.level];
    const ph = PHENOMENA[g.phenomenon] || PHENOMENA[0];
    const p = periodData(0);
    const when = g.begin && new Date(g.begin) > Date.now()
      ? `De ${M.formatDateTime(g.begin)} à ${M.formatTime(g.end)}`
      : `Jusqu'au ${M.formatDateTime(g.end)}`;
    const n = {
      id: g.id || `vig-${g.key}`, __vig: true, color: v.color, textColor: LEVELS[g.level].text,
      levelText: `Vigilance ${v.name.toLowerCase()}`, phen: `${ph.icon} ${ph.name}`,
      title: `Vigilance ${v.name.toLowerCase()} ${ph.name.toLowerCase()} — Météo-France`,
      departments: g.departments, createdAt: (vigilance && vigilance.updatedAt) || new Date().toISOString(),
      body: `${when}.${g.manual ? ' Vigilance corrigée par M-Alert.' : ''}${p && p.text ? `\n\n${p.text}` : ''}`,
      advice: M.ADVICE[g.phenomenon] || '',
      valid: `🇫🇷 Vigilance Météo-France${ring ? ' · rappel de M-Alert' : ' (mise à jour au moins deux fois par jour)'}`,
    };
    // Derrière une alerte affichée, la vigilance attend son tour.
    if (current && !current.__notice) {
      queue.push({ ...n, __notice: true });
      $('ovQueue').textContent = `+${queue.length} autre(s) alerte(s)`;
    } else {
      showNoticeBanner(n);
    }
  }

  /** Relance d'une vigilance par M-Alert : bannière, son et notification, si elle me concerne. */
  function onVigRing(g) {
    if (!g || !(settings.all || isMine(g))) return;
    if (g.phenomenon && (settings.phenomenaOff || []).includes(Number(g.phenomenon))) return;
    showVigBanner(g, { ring: true });
    const ph = PHENOMENA[g.phenomenon] || PHENOMENA[0];
    if (settings.sound) window.MAlertSound.play({ level: g.level, category: 'meteo', phenomenon: g.phenomenon }, { volume: settings.volume, loop: false });
    systemNotification(`Rappel · Vigilance ${VIGILANCE[g.level].name.toLowerCase()} — ${ph.name}`, M.departmentsLabel(g.departments, 3), { tag: `vig-${g.key}`, urgent: true });
    if (native) native.alert({ level: g.level, front: settings.front });
  }

  /** Bandeau compact en haut de l'écran pour une notification de M-Alert (ou une annulation). */
  function showNoticeBanner(n) {
    current = { ...n, __notice: true };
    stopWaveCountdown();
    const ov = $('alertOverlay');
    ov.className = 'alert-overlay compact notice';
    ov.style.setProperty('--c', n.__void ? VOID_COLOR : n.__vig ? n.color : NOTICE_COLOR);
    ov.style.setProperty('--ct', n.__vig ? n.textColor : '#0b1220');
    $('ovLevel').textContent = n.__void ? '❌ Alerte annulée' : n.__vig ? n.levelText : '🔔 Notification';
    $('ovPhen').textContent = n.__void || n.__vig ? n.phen : 'M-Alert';
    $('ovTest').classList.toggle('hidden', !n.test);
    $('ovTime').textContent = M.formatDateTime(n.createdAt);
    $('ovTitle').textContent = n.title;
    $('ovDeps').textContent = M.departmentsLabel(n.departments, 8);
    $('ovEpi').classList.add('hidden');
    $('ovTsunami').classList.add('hidden'); // pas de tableau d'une alerte tsunami affichée avant
    $('ovDesc').textContent = n.body || '';
    $('ovAdviceWrap').classList.toggle('hidden', !n.advice);
    $('ovAdvice').textContent = n.advice || '';
    $('ovValid').textContent = n.__vig ? n.valid : n.__void ? 'Fausse alerte : l\'alerte est levée.' : 'Consultable 24 h dans « Notifications »';
    $('ovQueue').textContent = queue.length ? `+${queue.length} autre(s) alerte(s)` : '';
    $('ovMute').classList.add('hidden');
    ov.querySelector('.alert-banner').scrollTop = 0;
    ov.querySelector('.alert-body').classList.remove('expanded');
    $('ovAck').focus({ preventScroll: true });
    if (!n.departments.includes('ALL')) focusAlert(n);
  }

  /** Notifications reçues à la connexion : celles envoyées pendant que l'application était fermée s'affichent. */
  function setNotices(list) {
    notices = list.slice();
    if (noticeFirstRun) {
      // Premier lancement : pas de rattrapage des notifications déjà envoyées.
      noticeFirstRun = false;
      for (const n of notices) markNoticeSeen(n.id);
      M.storage.set('malert.noticeSeen', [...noticeSeen]);
    }
    renderNotices();
    notices.filter((n) => !noticeSeen.has(n.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach(showNotice);
  }

  // ---------- Alerte en bannière, son et notification ----------

  function wantsCategory(alert) {
    const cat = M.categoryOf(alert);
    if (settings.categoriesOff.includes(cat)) return false;
    // Phénomène météo désactivé dans les réglages.
    return !(cat === 'meteo' && (settings.phenomenaOff || []).includes(Number(alert.phenomenon) || 0));
  }

  function matchesMe(alert) {
    if (alert.level < settings.minLevel) return false;
    if (!wantsCategory(alert)) return false;
    if (settings.all) return true;
    return isMine(alert);
  }

  /** Lieu de l'épicentre : département, ou coordonnées s'il est en mer ou hors de France. */
  function epicenterText(e) {
    const code = map.departmentAt(e.lat, e.lon);
    return code
      ? `${M.departmentName(code)}`
      : `${Math.abs(e.lat).toFixed(2)}° ${e.lat >= 0 ? 'N' : 'S'}, ${Math.abs(e.lon).toFixed(2)}° ${e.lon >= 0 ? 'E' : 'O'} (en mer ou hors de France)`;
  }

  /**
   * Centre la carte sur une alerte (départements et épicentre). Pour un séisme, le bandeau
   * d'alerte reste en haut : la carte est centrée dans la partie visible en dessous.
   */
  function focusAlert(alert) {
    requestAnimationFrame(() => {
      let top = 0;
      if (!$('alertOverlay').classList.contains('hidden') && $('alertOverlay').classList.contains('compact')) {
        const banner = $('alertOverlay').querySelector('.alert-banner').getBoundingClientRect();
        top = Math.max(0, banner.bottom - $('map').getBoundingClientRect().top);
      }
      map.focus(alert.departments, { epicenter: alert.epicenter, top });
    });
  }

  // Compte à rebours de l'arrivée des ondes P et S dans mon département (séisme avec épicentre).
  let waveTicker = null;
  let waveMuted = false; // bips du compte à rebours coupés (second clic sur le bouton du son)
  let waveState = null; // { arrival, t0 } du compte à rebours en cours
  function stopWaveCountdown() {
    clearInterval(waveTicker);
    waveTicker = null;
    waveState = null;
    $('ovWaves').classList.add('hidden');
  }

  function formatSeconds(sec) {
    const s = Math.round(sec);
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    return m < 60 ? `${m} min ${String(s % 60).padStart(2, '0')} s` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  }

  function startWaveCountdown(alert, { silent } = {}) {
    stopWaveCountdown();
    waveMuted = Boolean(silent);
    let lastBeep = null;
    let lastHtml = '';
    const home = settings.department && map.departmentCenter(settings.department);
    if (alert.category !== 'seisme' || !alert.epicenter || !home) return;
    const arrival = map.waveArrival(alert.epicenter, alert.depth, home.lat, home.lon);
    const t0 = new Date(alert.originTime || alert.createdAt).getTime();
    waveState = { arrival, t0 };
    const el = $('ovWaves');
    const wave = (name, cls, at, t) => (t < at
      ? `<span class="${cls}">Onde ${name} : dans <b>${formatSeconds(at - t)}</b></span>`
      : `<span class="${cls} done">Onde ${name} arrivée${t - at >= 1 ? ` (il y a ${formatSeconds(t - at)})` : ''}</span>`);
    const tick = () => {
      const t = (Date.now() - t0) / 1000;
      // Bip chaque seconde pendant les 10 dernières secondes avant l'arrivée de l'onde S (secousses fortes).
      if (t < arrival.s && arrival.s - t <= 10) {
        const sec = Math.ceil(arrival.s - t);
        if (sec !== lastBeep) {
          lastBeep = sec;
          if (settings.sound && !waveMuted) window.MAlertSound.oneShot('countdown', settings.volume);
        }
      }
      const html = `📍 ${Math.round(arrival.km)} km de ${escapeHtml(M.departmentName(settings.department))} · ${wave('P', 'wave-p', arrival.p, t)} · ${wave('S', 'wave-s', arrival.s, t)}`;
      if (html !== lastHtml) { el.innerHTML = html; lastHtml = html; } // le DOM ne change qu'une fois par seconde
      // Onde S arrivée : plus de bips, le bouton « Couper aussi le son du compte à rebours » disparaît.
      if (t >= arrival.s && $('ovMute').dataset.stage === 'countdown') $('ovMute').classList.add('hidden');
      if (t - arrival.s > 3600) stopWaveCountdown(); // plus d'une heure après : inutile de continuer
    };
    el.classList.remove('hidden');
    tick();
    waveTicker = setInterval(tick, 250);
  }

  // Tableau d'arrivée du tsunami (comme les bulletins japonais) : par niveau, chaque côte avec
  // son heure d'arrivée et la hauteur des vagues (affichées seulement si connues).
  const TSUNAMI_GROUPS = [[5, 'Avertissement majeur de tsunami'], [4, 'Avertissement de tsunami'], [2, 'Avis de tsunami']];
  function tsunamiArrivalText(r) {
    if (r.arrival === 'arrived') return 'Déjà arrivé';
    if (r.arrival === 'imminent') return 'Arrivée imminente';
    if (!r.arrival) return '';
    const t = new Date(r.arrival);
    if (t.getTime() <= Date.now()) return r.estimated ? 'Probablement arrivé' : 'Déjà arrivé';
    const sameDay = t.toDateString() === new Date().toDateString();
    const hm = t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${r.estimated ? '≈ ' : ''}${sameDay ? hm : `${t.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })} ${hm}`}`;
  }
  // Vent violent et vagues-submersion automatiques : même tableau, par niveau, chaque département
  // avec ses heures prévues (début, fin, pic) et ses valeurs (rafales et vent moyen, ou vagues et mer).
  const FORECAST_GROUPS = [[5, 'Niveau majeur'], [4, 'Niveau rouge'], [3, 'Niveau orange'], [2, 'Niveau jaune']];
  /** Heure de Paris « AAAA-MM-JJTHH:MM » : « 14 h », précédée du jour si ce n'est pas aujourd'hui. */
  function forecastHour(t, withDay) {
    if (!t) return '';
    const h = `${Number(t.slice(11, 13))} h`;
    const today = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
    if (!withDay || t.slice(0, 10) === today) return h;
    const d = new Date(`${t.slice(0, 10)}T12:00:00`);
    return `${d.toLocaleDateString('fr-FR', { weekday: 'short' })} ${h}`;
  }
  const num = (x, d = 1) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  function renderForecastBoard(alert, el) {
    const t = alert.forecastTable;
    const deps = new Set(alert.departments || []);
    const rows = t.rows.filter((r) => deps.has('ALL') || deps.has(r.department));
    if (!rows.length) return false;
    const mine = myDepartments();
    const wind = t.kind !== 'submersion';
    const html = [`<div class="tsu-title">${wind ? 'Rafales prévues par département' : 'Vagues et niveau de la mer prévus'}</div>`];
    for (const [level, name] of FORECAST_GROUPS) {
      const group = rows.filter((r) => r.level === level)
        .sort((a, b) => (wind ? Math.max(b.gust || 0, b.gustCoast || 0) - Math.max(a.gust || 0, a.gustCoast || 0) : (b.hs || 0) - (a.hs || 0)));
      if (!group.length) continue;
      html.push(`<div class="tsu-head fc-l${level}">${name}</div>`);
      for (const r of group) {
        const span = r.from ? `${forecastHour(r.from, true)} → ${forecastHour(r.to, r.to && r.to.slice(0, 10) !== r.from.slice(0, 10))}` : '';
        const peak = r.at ? `pic ${forecastHour(r.at, r.from && r.at.slice(0, 10) !== r.from.slice(0, 10))}` : '';
        let value;
        let sub;
        if (wind) {
          const g = Math.max(r.gust || 0, r.gustCoast || 0);
          value = `${g}<small>km/h</small>`;
          sub = [r.gustCoast ? `terres ${r.gust} km/h` : '', r.mean ? `moyen ${r.mean} km/h` : ''].filter(Boolean).join(' · ');
        } else {
          value = `${num(r.hs || 0)}<small>m</small>`;
          sub = [typeof r.water === 'number' ? `mer ${r.water >= 0 ? '+' : '−'}${num(Math.abs(r.water), 2)} m` : '', typeof r.setup === 'number' ? `surcote ${num(r.setup, 2)} m` : ''].filter(Boolean).join(' · ');
        }
        html.push(`<div class="tsu-row fc-row${mine.includes(r.department) ? ' mine' : ''}">
          <span class="tsu-name">${mine.includes(r.department) ? '📍 ' : ''}${escapeHtml(M.departmentName(r.department).replace(/ \(\w+\)$/, ''))}</span>
          <span class="tsu-arr fc-time${span ? '' : ' empty'}">${escapeHtml(span)}${peak ? `<small>${escapeHtml(peak)}</small>` : ''}</span>
          <span class="tsu-h fc-l${level}">${value}${sub ? `<span class="tsu-max">${escapeHtml(sub)}</span>` : ''}</span>
        </div>`);
      }
    }
    html.push(`<div class="tsu-note">${wind
      ? 'Rafales maximales prévues (sur la côte si elles y sont plus fortes) ; vent moyen sur 10 minutes. Heures de Paris.'
      : 'Hauteur des vagues au large ; mer : niveau par rapport aux plus hautes mers du mois (marée et pression), surcote due au vent. Heures de Paris.'}</div>`);
    el.innerHTML = html.join('');
    return true;
  }

  function renderTsunamiBoard(alert) {
    const el = $('ovTsunami');
    if (alert.forecastTable && Array.isArray(alert.forecastTable.rows)) {
      const shown = renderForecastBoard(alert, el);
      el.classList.toggle('hidden', !shown);
      if (shown) return;
    }
    const rows = alert.category === 'tsunami' && Array.isArray(alert.tsunamiTable) ? alert.tsunamiTable : [];
    el.classList.toggle('hidden', !rows.length);
    if (!rows.length) {
      el.innerHTML = '';
      return;
    }
    const mine = myDepartments();
    const html = ['<div class="tsu-title">Arrivée prévue du tsunami</div>'];
    for (const [level, name] of TSUNAMI_GROUPS) {
      const group = rows.filter((r) => r.level === level);
      if (!group.length) continue;
      html.push(`<div class="tsu-head tsu-l${level}">${name}</div>`);
      for (const r of group) {
        const arrival = tsunamiArrivalText(r);
        html.push(`<div class="tsu-row${mine.includes(r.department) ? ' mine' : ''}">
          <span class="tsu-name">${mine.includes(r.department) ? '📍 ' : ''}${escapeHtml(M.departmentName(r.department).replace(/ \(\w+\)$/, ''))}</span>
          <span class="tsu-arr${arrival ? '' : ' empty'}">${escapeHtml(arrival)}</span>
          <span class="tsu-h${typeof r.height === 'number' ? ` tsu-l${level}` : ' empty'}"${r.heightEstimated ? ' title="Hauteur estimée par M-Alert (magnitude et distance)"' : ''}>${typeof r.height === 'number' ? `${r.heightEstimated ? '<span class="tsu-est">≈</span>' : ''}${r.height.toLocaleString('fr-FR')}<small>m</small>${typeof r.heightMax === 'number' && r.heightMax > r.height ? `<span class="tsu-max">ports ${r.heightMax.toLocaleString('fr-FR')} m</span>` : ''}` : ''}</span>
        </div>`);
      }
    }
    const notes = [];
    if (rows.some((r) => r.estimated)) notes.push('heure d\'arrivée estimée');
    if (rows.some((r) => r.heightEstimated)) notes.push('hauteur moyenne estimée (type de faille, magnitude, distance, profondeur de la mer) ; « ports » : maximum possible dans les ports, baies et estuaires');
    if (notes.length) html.push(`<div class="tsu-note">≈ : ${notes.join(' ; ')}</div>`);
    el.innerHTML = html.join('');
  }

  /** Intensité (shindo) attendue dans mon département pour un séisme, ou null. */
  function localIntensity(alert) {
    if (alert.category !== 'seisme' || !settings.department) return null;
    return deptIntensity(alert, settings.department);
  }

  /** Intensité dans un département : corrigée par M-Alert si elle l'a été, sinon calculée (ou null). */
  function deptIntensity(alert, code) {
    if (alert.intensities && alert.intensities[code]) return alert.intensities[code];
    if (!alert.epicenter || typeof alert.magnitude !== 'number') return null;
    const c = map.departmentCenter(code);
    if (!c) return null;
    const { km } = map.waveArrival(alert.epicenter, alert.depth, c.lat, c.lon);
    return M.toShindo(M.estimateIntensity(alert.magnitude, Number(alert.depth) || 10, km));
  }

  function showOverlay(alert, { silent } = {}) {
    current = alert;
    $('ovMute').textContent = 'Couper le son';
    $('ovMute').dataset.stage = 'alarm';
    startWaveCountdown(alert, { silent });
    const lv = LEVELS[alert.level];
    const ph = M.alertKind(alert);
    const ov = $('alertOverlay');
    // Toutes les alertes : bannière en haut de l'écran (cadre clignotant de la couleur du niveau),
    // la carte (départements, épicentre) reste visible et utilisable dessous.
    ov.className = `alert-overlay lvl-${alert.level} compact`;
    ov.style.setProperty('--c', lv.color);
    ov.style.setProperty('--ct', lv.text);
    $('ovLevel').textContent = M.alertLevelLabel(alert);
    $('ovPhen').textContent = `${ph.icon} ${ph.name}`;
    $('ovTest').classList.toggle('hidden', !alert.test);
    $('ovTime').textContent = M.formatDateTime(alert.createdAt) + (alert.updatedAt ? ` · modifiée ${M.formatTime(alert.updatedAt)}` : '') + ` · ${M.sourceLabel(alert)}`;
    renderTsunamiBoard(alert);
    $('ovTitle').textContent = alert.title;
    $('ovDeps').textContent = M.departmentsLabel(alert.departments, 8);
    // Tremblement de terre : intensité (shindo), magnitude et épicentre.
    const quake = [];
    const badge = (s, title) => {
      const sh = M.SHINDO[s];
      return sh ? `<span class="shindo" style="background:${sh.color};color:${sh.text}" title="${title}">${escapeHtml(s)}</span>` : '';
    };
    if (alert.category === 'seisme' && alert.aftershockOf && typeof alert.aftershockOf.mag === 'number') {
      quake.push(`<span class="aftershock">🔁 Réplique du séisme M${alert.aftershockOf.mag.toFixed(1)}${alert.aftershockOf.time ? ` du ${escapeHtml(M.formatDateTime(alert.aftershockOf.time))}` : ''}</span>`);
    }
    if (alert.category === 'seisme' && alert.shindo && M.SHINDO[alert.shindo]) {
      quake.push(`<span class="int-pair">${badge(alert.shindo, 'Intensité maximale (échelle shindo)')}<small>max</small></span>`);
    }
    // Intensité attendue dans mon département (estimée d'après magnitude, profondeur et distance).
    const local = localIntensity(alert);
    if (local) quake.push(`<span class="int-pair">${badge(local, 'Intensité attendue dans votre département (estimation)')}<small>chez vous</small></span>`);
    if (alert.category === 'seisme' && typeof alert.magnitude === 'number') quake.push(`<b>M${alert.magnitude.toFixed(1)}</b>`);
    if (alert.category === 'seisme' && typeof alert.depth === 'number') quake.push(`<span>Profondeur : <b>${alert.depth} km</b></span>`);
    if (alert.epicenter) quake.push(`✕ Épicentre : ${escapeHtml(epicenterText(alert.epicenter))}`);
    // Tsunami : hauteur des vagues, seulement si elle a été indiquée.
    if (alert.category === 'tsunami' && typeof alert.waveHeight === 'number') quake.push(`<span>🌊 Vagues attendues : <b>jusqu'à ${alert.waveHeight.toLocaleString('fr-FR')} m</b></span>`);
    // Tornade : niveau EF et vent attendu.
    if (M.isTornado(alert)) {
      quake.push(`<span class="shindo" style="background:${lv.color};color:${lv.text}" title="Échelle de Fujita améliorée">EF${alert.ef}</span>`);
      if (typeof alert.windKmh === 'number') quake.push(`<span>Vent attendu : <b>${alert.windKmh} km/h</b></span>`);
    }
    // Incendie : type de feu.
    if (M.fireSummary(alert)) quake.push(`<span>${escapeHtml(M.fireSummary(alert))}</span>`);
    // Pollution de l'air : polluant.
    if (M.pollutionSummary(alert)) quake.push(`<span>🧪 ${escapeHtml(M.pollutionSummary(alert))}</span>`);
    // Vent ou vagues-submersion automatique : version d'origine (la prévision a pu la modifier).
    if (M.forecastOriginText(alert)) quake.push(`<span class="origin">🕓 ${escapeHtml(M.forecastOriginText(alert))}</span>`);
    $('ovEpi').classList.toggle('hidden', !quake.length);
    $('ovEpi').innerHTML = quake.join(' ');
    $('ovDesc').textContent = alert.description;
    const advice = M.adviceFor(alert);
    $('ovAdviceWrap').classList.toggle('hidden', !advice);
    $('ovAdvice').textContent = advice || '';
    $('ovValid').textContent = alert.noEnd ? 'Sans date de fin : en vigueur jusqu\'à la levée de l\'alerte' : `Valable ${M.untilText(alert)}`;
    $('ovQueue').textContent = queue.length ? `+${queue.length} autre(s) alerte(s)` : '';
    $('ovMute').classList.toggle('hidden', Boolean(silent) || !settings.sound);
    $('ovAck').focus({ preventScroll: true });
    ov.querySelector('.alert-banner').scrollTop = 0;
    ov.querySelector('.alert-body').classList.remove('expanded');
  }

  // Son d'une alerte. Majeur.mp3 se répète toujours jusqu'à « J'ai compris », sans limite de durée.
  let pendingSound = null; // alerte qui n'a pas pu sonner (son bloqué par le navigateur)
  function alertSound(alert) {
    const majeur = window.MAlertSound.soundFile(alert) === 'majeur';
    window.MAlertSound.play(alert, {
      volume: settings.volume,
      loop: majeur || (settings.repeat && alert.level >= 3),
      untilStopped: majeur,
    });
  }

  function acknowledge() {
    pendingSound = null;
    window.MAlertSound.stop();
    if (current && !current.__notice) markSeen(current.id);
    current = null;
    const next = queue.shift();
    if (next) {
      if (next.__notice) showNoticeBanner(next);
      else showOverlay(next, { silent: true });
      return;
    }
    $('alertOverlay').classList.add('hidden');
    stopWaveCountdown();
  }

  $('ovAck').addEventListener('click', acknowledge);
  // Bannière : un clic sur le texte l'affiche en entier (description et consignes).
  document.querySelector('#alertOverlay .alert-body').addEventListener('click', (e) => e.currentTarget.classList.toggle('expanded'));
  // « Couper le son » coupe le son d'alerte ; si le compte à rebours de l'onde S doit encore sonner,
  // le bouton devient « Couper aussi le son du compte à rebours ».
  $('ovMute').addEventListener('click', () => {
    const btn = $('ovMute');
    if (btn.dataset.stage === 'countdown') {
      waveMuted = true;
      btn.classList.add('hidden');
      return;
    }
    pendingSound = null;
    window.MAlertSound.stop();
    const beepsLeft = waveState && !waveMuted && settings.sound && (Date.now() - waveState.t0) / 1000 < waveState.arrival.s;
    if (beepsLeft) {
      btn.dataset.stage = 'countdown';
      btn.textContent = 'Couper aussi le son du compte à rebours';
    } else {
      btn.classList.add('hidden');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current && !$('settings').open) acknowledge();
  });

  async function systemNotification(title, body, { tag, urgent, onClick } = {}) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const options = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', requireInteraction: Boolean(urgent), renotify: true };
    try {
      const n = new Notification(title, options);
      n.onclick = () => {
        window.focus();
        if (native) native.showWindow();
        if (onClick) onClick();
        n.close();
      };
    } catch (_) {
      // Android/Chrome n'autorise que les notifications via le service worker.
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) reg.showNotification(title, options);
    }
  }

  function trigger(alert, { updated, ring } = {}) {
    if (seen.has(alert.id)) return;
    // Une relance (demandée par M-Alert) sonne même si l'alerte est silencieuse.
    if (ring) alert = { ...alert, silent: false };
    // Alerte silencieuse : visible sur la carte et dans la liste, sans son, fenêtre ni notification.
    // Pas de markAlerted : si elle cesse d'être silencieuse pendant que l'application est fermée,
    // elle sonnera à l'ouverture.
    if (alert.silent) {
      markSeen(alert.id);
      return;
    }
    // Catégorie désactivée dans les réglages : aucune alerte sonore ni message.
    if (!wantsCategory(alert)) {
      markSeen(alert.id);
      return;
    }
    if (!matchesMe(alert)) {
      markSeen(alert.id);
      const lv = LEVELS[alert.level];
      toast(`${M.specialLevel(alert) ? M.alertLevelLabel(alert) : `Nouvelle alerte ${lv.name.toLowerCase()}`} : ${alert.title}`, M.departmentsLabel(alert.departments, 3), lv.color, () => {
        focusAlert(alert);
        showOverlay(alert, { silent: true });
      });
      return;
    }

    // Une alerte passe devant une notification affichée (qui reste dans la liste « Notifications »).
    if (current && !current.__notice) queue.push(alert);
    else showOverlay(alert);
    $('ovQueue').textContent = queue.length ? `+${queue.length} autre(s) alerte(s)` : '';
    focusAlert(alert);

    if (settings.sound) {
      alertSound(alert);
      setTimeout(() => {
        if (window.MAlertSound.isLocked() && current && current.id === alert.id) {
          pendingSound = alert; // rejoué au premier clic qui débloque le son
          $('soundHint').classList.remove('hidden');
        }
      }, 1000);
    }
    const lv = LEVELS[alert.level];
    const prefix = (alert.test ? '[TEST] ' : '') + (ring ? 'RAPPEL · ' : updated ? 'MISE À JOUR · ' : '');
    systemNotification(
      `${prefix}${M.alertKind(alert).icon} ${M.alertLevelLabel(alert)} — ${alert.title}`,
      `${M.departmentsLabel(alert.departments, 3)}\n${alert.description}`,
      { tag: alert.id, urgent: alert.level >= 3 },
    );
    if (native) native.alert({ level: alert.level, front: settings.front });
    // L'identifiant est mémorisé à l'acquittement ; on le note aussi ici pour ne pas
    // rejouer l'alerte si l'application est rechargée avant.
    markSeen(alert.id);
    markAlerted(alert);
  }

  // Alerte modifiée depuis M-Alert-sender.
  function onAlertUpdated(alert, previous) {
    const before = previous && previous.departments ? { ...alert, ...previous } : null;
    if (alert.silent) {
      // Modification silencieuse : la carte et la liste suffisent.
      if (current && current.id === alert.id) showOverlay(alert, { silent: true });
      return;
    }
    // Une alerte qui était silencieuse sonne si elle ne l'est plus.
    const concernedBefore = Boolean(before && !before.silent && matchesMe(before));
    const concernedNow = M.isActive(alert) && matchesMe(alert);
    // Un de mes départements ajouté à l'alerte (même si elle me concernait déjà par un autre
    // département suivi, ou via « toute la France »).
    const addedMine = before ? myIncluded(alert).filter((d) => !myIncluded(before).includes(d)) : [];
    const lv = LEVELS[alert.level];
    if (concernedNow && (!concernedBefore || alert.level > before.level || addedMine.length)) {
      // Mon département vient d'être ajouté ou le niveau monte : nouvelle alerte sonore.
      if (current && current.id === alert.id) {
        window.MAlertSound.stop();
        current = null;
      }
      seen.delete(alert.id);
      trigger(alert, { updated: true });
      return;
    }
    if (current && current.id === alert.id) {
      if (concernedNow) showOverlay(alert, { silent: $('ovMute').classList.contains('hidden') });
      else acknowledge();
    }
    if (concernedNow) {
      toast(`Alerte modifiée : ${alert.title}`, M.departmentsLabel(alert.departments, 3), lv.color, () => {
        focusAlert(alert);
        showOverlay(alert, { silent: true });
      });
    } else if (concernedBefore) {
      toast(`Vos départements ne sont plus concernés : ${alert.title}`, M.departmentsLabel(alert.departments, 3), '#34d399');
    }
  }

  // Vigilance : prévenir quand le niveau de mes départements augmente.
  function checkVigilanceChange(oldVig, newVig) {
    if (!settings.vigNotify || !oldVig || !newVig || !oldVig.periods[0] || !newVig.periods[0]) return;
    if (oldVig.source !== newVig.source) return;
    for (const code of myDepartments()) {
      const before = (oldVig.periods[0].departments[code] || {}).level || 1;
      const after = (newVig.periods[0].departments[code] || {}).level || 1;
      if (after > before && after >= 2) {
        const v = VIGILANCE[after];
        const phen = (newVig.periods[0].departments[code].phenomena || []).map((p) => (PHENOMENA[p.id] || PHENOMENA[0]).name).join(', ');
        toast(`Vigilance ${v.name.toLowerCase()} — ${M.departmentName(code)}`, phen, v.color, () => map.focus([code]));
        systemNotification(`Vigilance ${v.name.toLowerCase()} — ${M.departmentName(code)}`, phen || 'Nouvelle vigilance Météo-France', { tag: `vig-${code}` });
      }
    }
  }

  // Débloque le son au premier geste (exigence des navigateurs). Si une alerte n'a pas pu sonner,
  // elle sonne à ce moment-là, sauf si le geste sert justement à la couper ou à l'acquitter.
  const unlockOnce = (e) => {
    window.MAlertSound.unlock();
    $('soundHint').classList.add('hidden');
    const silencing = e && e.target && e.target.closest && e.target.closest('#ovAck, #ovMute');
    if (pendingSound && current && current.id === pendingSound.id && !silencing && settings.sound) alertSound(current);
    pendingSound = null;
  };
  document.addEventListener('pointerdown', unlockOnce, { capture: true });
  document.addEventListener('keydown', unlockOnce, { capture: true });
  $('soundHint').addEventListener('click', unlockOnce);

  // ---------- Connexion temps réel ----------

  let ws = null;
  let retry = 0;
  let reconnectTimer = null;

  function setStatus(state, text) {
    $('status').dataset.state = state;
    $('statusText').textContent = text;
  }

  function subscribeMessage() {
    return JSON.stringify({ type: 'subscribe', role: 'receiver', departments: myDepartments(), all: settings.all });
  }

  function connect() {
    clearTimeout(reconnectTimer);
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    const url = M.normalizeServerUrl(settings.serverUrl);
    if (!url) {
      setStatus('offline', 'Serveur non configuré');
      return;
    }
    setStatus('connecting', 'Connexion…');
    try {
      ws = new WebSocket(M.toWsUrl(url));
    } catch (err) {
      setStatus('offline', 'Adresse du serveur invalide');
      return;
    }
    ws.onopen = () => {
      retry = 0;
      setStatus('online', 'Connecté');
      ws.send(subscribeMessage());
    };
    // Message périodique : garde la connexion (et un serveur gratuit) éveillée.
    const socket = ws;
    const keepAlive = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send('{"type":"ping"}');
    }, 240000);
    ws.addEventListener('close', () => clearInterval(keepAlive));
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (_) {
        return;
      }
      handleMessage(msg);
    };
    ws.onclose = () => {
      setStatus('offline', 'Déconnecté — nouvelle tentative…');
      const delay = Math.min(30000, 1000 * 2 ** retry++) + Math.random() * 1000;
      reconnectTimer = setTimeout(connect, delay);
    };
    ws.onerror = () => { /* onclose suit */ };
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'hello': {
        const old = vigilance;
        vigilance = msg.vigilance;
        alerts = (msg.alerts || []).filter(M.isActive);
        renderAll();
        checkVigilanceChange(old, vigilance);
        // Alertes envoyées (ou étendues à mon département) pendant que l'application était fermée
        // ou hors ligne. Celles reçues application ouverte sont déjà marquées vues.
        missedAlerts(alerts).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((a) => {
          const updated = Boolean(a.__updated);
          const ring = Boolean(a.__ring);
          delete a.__updated;
          delete a.__ring;
          trigger(a, { updated, ring });
        });
        // Notifications manquées : après les alertes, qui passent devant.
        if (msg.notices) setNotices(msg.notices);
        break;
      }
      case 'alert':
        if (!alerts.some((a) => a.id === msg.alert.id)) alerts.push(msg.alert);
        renderAll();
        trigger(msg.alert);
        break;
      case 'update': {
        const a = msg.alert;
        alerts = alerts.filter((x) => x.id !== a.id);
        if (M.isActive(a)) alerts.push(a);
        const qi = queue.findIndex((x) => x.id === a.id);
        if (qi >= 0) queue[qi] = a;
        renderAll();
        onAlertUpdated(a, msg.previous);
        break;
      }
      case 'ring': {
        // Alerte relancée par M-Alert : son, fenêtre et notification rejoués pour les personnes concernées.
        const a = msg.alert;
        alerts = alerts.filter((x) => x.id !== a.id);
        if (M.isActive(a)) alerts.push(a);
        const qi = queue.findIndex((x) => x.id === a.id);
        if (qi >= 0) queue.splice(qi, 1);
        renderAll();
        if (!M.isActive(a) || !matchesMe(a)) break;
        if (current && current.id === a.id) {
          window.MAlertSound.stop();
          current = null;
        }
        seen.delete(a.id);
        trigger(a, { ring: true });
        break;
      }
      case 'cancel':
      case 'expire': {
        const a = msg.alert;
        const had = alerts.some((x) => x.id === a.id);
        alerts = alerts.filter((x) => x.id !== a.id);
        const idx = queue.findIndex((x) => x.id === a.id);
        if (idx >= 0) queue.splice(idx, 1);
        if (current && current.id === a.id) acknowledge();
        renderAll();
        // Annulation (fausse alerte) : annoncée à tous ceux qui ont reçu l'alerte (mêmes règles que
        // l'alerte : départements suivis, « toute la France », niveau, catégories).
        if (msg.type === 'cancel' && a.voided && !a.silent && (matchesMe(a) || seen.has(a.id))) {
          showVoided(a);
          break;
        }
        if (had && isMine(a) && !a.silent) {
          toast(msg.type === 'cancel' ? `Alerte levée : ${a.title}` : `Fin de l'alerte : ${a.title}`, M.departmentsLabel(a.departments, 3), '#34d399');
        }
        break;
      }
      case 'notice':
        if (!notices.some((n) => n.id === msg.notice.id)) notices.push(msg.notice);
        renderNotices();
        showNotice(msg.notice);
        break;
      case 'notice-delete': {
        const qi = queue.findIndex((x) => x.__notice && x.id === msg.notice.id);
        if (qi >= 0) queue.splice(qi, 1);
        if (current && current.__notice && current.id === msg.notice.id) acknowledge();
        notices = notices.filter((n) => n.id !== msg.notice.id);
        renderNotices();
        break;
      }
      case 'vig-ring':
        onVigRing(msg.group);
        break;
      case 'vigilance': {
        const old = vigilance;
        vigilance = msg.vigilance;
        renderAll();
        checkVigilanceChange(old, vigilance);
        break;
      }
      default: break;
    }
  }

  // Retire les alertes expirées même sans message du serveur.
  let tick = 0;
  setInterval(() => {
    const before = alerts.length;
    alerts = alerts.filter(M.isActive);
    if (alerts.length !== before) renderAll();
    else if (++tick % 6 === 0) renderAlerts(); // met à jour les « il y a x min » toutes les 30 s
    if (tick % 6 === 0) renderNotices();
  }, 5000); // 5 s : les alertes à durée personnalisée peuvent être très courtes

  // ---------- Notifications push (navigateur / téléphone) ----------

  const pushSupported = !native && 'serviceWorker' in navigator && 'PushManager' in window && window.isSecureContext;

  function urlBase64ToUint8Array(base64) {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  async function syncPush() {
    if (!pushSupported) return;
    const state = $('pushState');
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      await navigator.serviceWorker.ready;
      const server = M.normalizeServerUrl(settings.serverUrl);
      let sub = await reg.pushManager.getSubscription();
      if (!settings.push) {
        if (sub) {
          fetch(`${server}/api/push/unsubscribe`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }),
          }).catch(() => {});
          await sub.unsubscribe();
        }
        state.textContent = '';
        return;
      }
      if (Notification.permission !== 'granted') {
        const p = await Notification.requestPermission();
        updateNotifState();
        if (p !== 'granted') throw new Error('notifications refusées');
      }
      if (!sub) {
        const { publicKey } = await (await fetch(`${server}/api/push/key`)).json();
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      }
      const res = await fetch(`${server}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(), departments: myDepartments(), all: settings.all, minLevel: settings.minLevel,
          excludedCategories: settings.categoriesOff,
          excludedPhenomena: settings.phenomenaOff || [],
          notices: settings.notices !== false,
        }),
      });
      if (!res.ok) throw new Error(`serveur HTTP ${res.status}`);
      state.textContent = '✅ Notifications push actives sur cet appareil.';
    } catch (err) {
      state.textContent = `⚠ Push indisponible : ${err.message}`;
    }
  }

  // Le service worker relaie les clics sur les notifications push.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'open-alert') {
        const a = alerts.find((x) => x.id === e.data.id);
        if (a) {
          focusAlert(a);
          showOverlay(a, { silent: true });
        }
      }
    });
  }

  // ---------- Fenêtre de réglages ----------

  const dlg = $('settings');
  const departments = M.departmentList();

  $('setCategories').innerHTML = Object.entries(M.CATEGORIES).map(([id, c]) =>
    `<label class="check"><input type="checkbox" value="${id}"> ${c.icon} ${escapeHtml(c.name)}</label>`).join('');
  $('setPhenomena').innerHTML = Object.entries(PHENOMENA).map(([id, p]) =>
    `<label class="check"><input type="checkbox" value="${id}"> ${p.icon} ${escapeHtml(p.name)}</label>`).join('');

  function fillDepartmentInputs() {
    $('setDep').innerHTML = '<option value="">— Choisir —</option>' +
      departments.map((d) => `<option value="${d.code}">${d.code} — ${escapeHtml(d.nom)}</option>`).join('');
    $('setExtra').innerHTML = departments.map((d) =>
      `<label data-search="${escapeHtml((d.code + ' ' + d.nom).toLowerCase())}"><input type="checkbox" value="${d.code}"> ${d.code} ${escapeHtml(d.nom)}</label>`).join('');
  }

  $('extraFilter').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    $('setExtra').querySelectorAll('label').forEach((l) => {
      l.classList.toggle('hidden', q && !l.dataset.search.includes(q));
    });
  });

  function updateNotifState() {
    const el = $('notifState');
    const btn = $('btnNotif');
    if (!('Notification' in window)) {
      el.textContent = 'Notifications non prises en charge sur cet appareil.';
      btn.classList.add('hidden');
      return;
    }
    const p = Notification.permission;
    el.textContent = p === 'granted' ? '✅ Notifications autorisées' : p === 'denied'
      ? '⛔ Notifications bloquées (autorisez-les dans les paramètres du navigateur)'
      : 'Notifications non autorisées';
    btn.classList.toggle('hidden', p !== 'default');
  }

  $('btnNotif').addEventListener('click', async () => {
    await Notification.requestPermission();
    updateNotifState();
  });

  async function openSettings({ welcome = false } = {}) {
    $('settingsTitle').textContent = welcome ? 'Bienvenue sur M-Alert' : 'Réglages';
    $('welcomeText').classList.toggle('hidden', !welcome);
    $('settingsClose').classList.toggle('hidden', welcome);
    $('setDep').value = settings.department || '';
    $('setExtra').querySelectorAll('input').forEach((i) => { i.checked = settings.extra.includes(i.value); });
    $('extraFilter').value = '';
    $('setExtra').querySelectorAll('label').forEach((l) => l.classList.remove('hidden'));
    $('setAll').checked = settings.all;
    $('setMinLevel').value = String(settings.minLevel);
    $('setCategories').querySelectorAll('input').forEach((i) => { i.checked = !settings.categoriesOff.includes(i.value); });
    $('setPhenomena').querySelectorAll('input').forEach((i) => { i.checked = !(settings.phenomenaOff || []).includes(Number(i.value)); });
    $('setSound').checked = settings.sound;
    $('setVolume').value = String(settings.volume);
    fillSoundRows(settings.sounds);
    $('setRepeat').checked = settings.repeat;
    $('setVigNotify').checked = settings.vigNotify;
    $('setFront').checked = settings.front;
    $('setPush').checked = settings.push;
    $('setNotices').checked = settings.notices !== false;
    $('setTiles').checked = settings.tiles;
    $('setIntensity').checked = settings.intensityMap !== false;
    $('setVigList').checked = settings.vigInList !== false;
    $('setServer').value = settings.serverUrl;
    document.querySelectorAll('.native-only').forEach((el) => el.classList.toggle('hidden', !native));
    document.querySelectorAll('.push-only').forEach((el) => el.classList.toggle('hidden', !pushSupported));
    if (native) {
      const ns = await native.getSettings();
      $('setBackground').checked = ns.background;
      $('setAutostart').checked = ns.autostart;
      $('setAutoUpdate').checked = ns.autoUpdate;
      native.getUpdateStatus().then(renderUpdate);
    }
    updateNotifState();
    dlg.dataset.welcome = welcome ? '1' : '';
    if (!dlg.open) dlg.showModal();
  }

  $('btnSettings').addEventListener('click', () => openSettings());
  $('settingsClose').addEventListener('click', () => dlg.close());
  // Un son en cours d'écoute s'arrête à la fermeture des réglages (sauf alerte de test, qui a son propre son).
  dlg.addEventListener('close', () => { if (!current) window.MAlertSound.stop(); });
  dlg.addEventListener('cancel', (e) => {
    if (dlg.dataset.welcome) e.preventDefault(); // le choix du département est obligatoire au premier lancement
  });

  $('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dep = $('setDep').value;
    if (!dep) {
      $('setDep').focus();
      $('setDep').reportValidity();
      return;
    }
    const oldServer = settings.serverUrl;
    settings = {
      ...settings,
      department: dep,
      extra: [...$('setExtra').querySelectorAll('input:checked')].map((i) => i.value).filter((c) => c !== dep),
      all: $('setAll').checked,
      minLevel: Number($('setMinLevel').value),
      categoriesOff: [...$('setCategories').querySelectorAll('input:not(:checked)')].map((i) => i.value),
      phenomenaOff: [...$('setPhenomena').querySelectorAll('input:not(:checked)')].map((i) => Number(i.value)),
      sound: $('setSound').checked,
      volume: Number($('setVolume').value),
      sounds: readSoundRows(),
      repeat: $('setRepeat').checked,
      vigNotify: $('setVigNotify').checked,
      front: $('setFront').checked,
      push: $('setPush').checked,
      notices: $('setNotices').checked,
      tiles: $('setTiles').checked,
      intensityMap: $('setIntensity').checked,
      vigInList: $('setVigList').checked,
      serverUrl: M.normalizeServerUrl($('setServer').value) || DEFAULTS.serverUrl,
    };
    if (native) {
      native.setSettings({
        background: $('setBackground').checked,
        autostart: $('setAutostart').checked,
        autoUpdate: $('setAutoUpdate').checked,
      });
    }
    saveSettings();
    const wasWelcome = Boolean(dlg.dataset.welcome);
    dlg.close();
    if (wasWelcome && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(updateNotifState);
    }
    onSettingsChanged(oldServer !== settings.serverUrl);
    if (wasWelcome) map.focus(myDepartments());
  });

  $('btnTest').addEventListener('click', () => {
    window.MAlertSound.unlock();
    const dep = $('setDep').value || settings.department || '75';
    const level = Math.max(3, Number($('setMinLevel').value));
    const test = {
      id: `test-${Date.now()}`,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      level,
      phenomenon: 3,
      title: 'Ceci est un test d\'alerte M-Alert',
      description: 'Aucune action n\'est requise. Ce test vérifie le son, l\'affichage et les notifications sur votre appareil.',
      instructions: '',
      departments: [dep],
      test: true,
    };
    dlg.close();
    if (current) acknowledge();
    showOverlay(test);
    if ($('setSound').checked) window.MAlertSound.play(test, { volume: Number($('setVolume').value), loop: false });
    systemNotification('[TEST] Alerte M-Alert', test.description, { tag: test.id });
    if (native) native.alert({ level, front: false });
  });

  function onSettingsChanged(serverChanged) {
    window.MAlertSound.configure(settings.sounds);
    map.setTiles(settings.tiles);
    renderAll();
    renderNotices();
    if (serverChanged) connect();
    else if (ws && ws.readyState === WebSocket.OPEN) ws.send(subscribeMessage());
    syncPush();
  }

  // ---------- Mises à jour (application de bureau) ----------

  let lastUpdate = null;
  let dismissedUpdate = null;

  function renderUpdate(s) {
    if (!s) return;
    lastUpdate = s;
    $('updVersion').textContent = `version ${s.current}`;
    const auto = s.mode === 'auto';
    $('updAutoRow').classList.toggle('hidden', s.mode === 'pacman' || s.mode === 'dev');
    $('btnUpdCheck').classList.toggle('hidden', s.mode === 'pacman' || s.mode === 'dev');
    $('btnUpdCheck').disabled = s.state === 'checking' || s.state === 'downloading';
    const text = {
      disabled: s.mode === 'pacman'
        ? 'Mises à jour gérées par pacman : sudo pacman -Syu'
        : 'Mises à jour désactivées en mode développement.',
      idle: '',
      checking: 'Recherche d\'une nouvelle version…',
      none: 'M-Alert est à jour.',
      downloading: `Téléchargement de la version ${s.version || ''}… ${s.percent ? s.percent + ' %' : ''}`,
      ready: `La version ${s.version} est prête : elle s'installera au prochain redémarrage de M-Alert.`,
      available: `La version ${s.version} est disponible${auto ? '' : ' (à télécharger et installer)'}.`,
      error: `Impossible de vérifier les mises à jour : ${s.error || 'erreur inconnue'}`,
    }[s.state] || '';
    $('updState').textContent = text;

    const showBar = (s.state === 'ready' || s.state === 'available') && dismissedUpdate !== s.version;
    $('updateBar').classList.toggle('hidden', !showBar);
    if (showBar) {
      $('updateBarText').textContent = s.state === 'ready'
        ? `🔄 La mise à jour ${s.version} de M-Alert est prête.`
        : `🔔 Une nouvelle version de M-Alert (${s.version}) est disponible.`;
      $('updateBarAction').textContent = s.state === 'ready' ? 'Redémarrer et installer' : 'Télécharger';
    }
  }

  // ---------- Application de bureau ----------

  if (native) {
    native.onOpenSettings(() => openSettings());
    native.onTestAlert(() => $('btnTest').click());
    native.onUpdateStatus(renderUpdate);
    native.getUpdateStatus().then(renderUpdate);
    $('btnUpdCheck').addEventListener('click', () => native.checkForUpdates());
    $('updateBarAction').addEventListener('click', () => native.installUpdate());
    $('updateBarLater').addEventListener('click', () => {
      dismissedUpdate = lastUpdate && lastUpdate.version;
      $('updateBar').classList.add('hidden');
    });
    // Retour de veille : on se reconnecte tout de suite pour ne rater aucune alerte.
    native.onResume(() => {
      retry = 0;
      connect();
    });
  }

  window.addEventListener('online', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      retry = 0;
      connect();
    }
  });

  // ---------- Démarrage ----------

  fillDepartmentInputs();
  map.setTiles(settings.tiles);
  renderAll();
  connect();
  if (pushSupported && settings.push) syncPush();
  // Service worker (notifications push) toujours à jour : sinon le navigateur ne le vérifie qu'à la
  // visite du site ou toutes les 24 h, et une ancienne version ignorerait les nouveaux messages.
  if (pushSupported) {
    const refreshWorker = () => navigator.serviceWorker.getRegistration()
      .then((reg) => reg && reg.update()).catch(() => {});
    refreshWorker();
    setInterval(refreshWorker, 3600 * 1000);
  }
  if (!settings.department) openSettings({ welcome: true });
  else setTimeout(() => map.focus(myDepartments()), 300);
})();
