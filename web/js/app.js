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
  let day = 0;              // 0 = aujourd'hui, 1 = demain
  let selectedCode = null;  // département cliqué sur la carte
  const seen = new Set(M.storage.get('malert.seen', []));
  const queue = [];         // alertes en attente d'affichage plein écran
  let current = null;       // alerte affichée en plein écran
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

  function periodData(d = day) {
    return vigilance && vigilance.periods && vigilance.periods[d] ? vigilance.periods[d] : null;
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
    if (d === 1) {
      const p = periodData(1);
      const t = new Date();
      t.setHours(24, 0, 0, 0);
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
      return `<div class="tt-row"><span class="sw" style="width:9px;height:9px;border-radius:2px;background:${VIGILANCE[p.level].color}"></span>${ph.icon} ${escapeHtml(ph.name)}</div>`;
    }).join('');
  }

  function tooltipHtml(code, nom) {
    const vig = vigFor(code);
    const level = vig ? vig.level : 0;
    const al = alertsFor(code);
    let html = `<div class="tt-title">${escapeHtml(nom)} (${code})</div>`;
    html += `<div class="tt-row">Vigilance ${day ? 'demain' : 'aujourd\'hui'} : <b style="color:${VIGILANCE[level].color}">${VIGILANCE[level].name}</b></div>`;
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
  }

  // ---------- Panneau latéral ----------

  function depCardHtml(code, { mine }) {
    const today = vigFor(code, 0);
    const tomorrow = vigFor(code, 1);
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
    const shown = day === 0 ? today : tomorrow;
    const phen = shown && shown.phenomena.length
      ? `<ul class="phen-list">${shown.phenomena.map((p) => {
        const ph = PHENOMENA[p.id] || PHENOMENA[0];
        return `<li><span class="sw" style="background:${VIGILANCE[p.level].color}"></span>${ph.icon} ${escapeHtml(ph.name)} — ${VIGILANCE[p.level].name.toLowerCase()}</li>`;
      }).join('')}</ul>`
      : `<p class="muted small" style="margin:0">Pas de phénomène particulier ${day ? 'demain' : 'aujourd\'hui'}.</p>`;
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
      <div class="vig-pills">${pill(today, 'Aujourd\'hui', 0)}${pill(tomorrow, 'Demain', 1)}</div>
      ${phen}${corrected}${alertHtml}`;
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
      <div class="m">${ph.icon} ${escapeHtml(ph.name)}${M.quakeSummary(a) ? ` · ${escapeHtml(M.quakeSummary(a))}` : ''}${M.tornadoSummary(a) ? ` · ${escapeHtml(M.tornadoSummary(a))}` : ''}${M.tsunamiSummary(a) ? ` · ${escapeHtml(M.tsunamiSummary(a))}` : ''} · ${escapeHtml(M.departmentsLabel(a.departments, 3))}</div>
      <div class="m">${M.relativeTime(a.createdAt)}${a.updatedAt ? ` · modifiée ${M.relativeTime(a.updatedAt)}` : ''} · ${M.untilText(a, { short: true })}${a.source === 'auto' ? ' · 🤖 automatique' : a.source === 'stations-auto' ? ' · 📶 détection automatique' : a.source === 'stations' ? ' · 📶 détection' : ''}</div>
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

  function renderAlerts() {
    const sorted = [...alerts].filter(passesFilter).sort((a, b) => (isMine(b) - isMine(a)) || (b.level - a.level) || b.createdAt.localeCompare(a.createdAt));
    $('alertCount').textContent = alertFilter ? `${sorted.length}/${alerts.length}` : alerts.length;
    $('alertList').innerHTML = sorted.length
      ? sorted.map(alertItemHtml).join('')
      : `<div class="empty">${alertFilter && alerts.length ? 'Aucune alerte de ce type en cours.' : 'Aucune alerte en cours ✅'}</div>`;
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
    if (!vigilance || !p) {
      info.textContent = vigilance && vigilance.error ? `Vigilance indisponible : ${vigilance.error}` : 'Vigilance en attente du serveur…';
      $('mapCaption').textContent = 'Vigilance : en attente…';
      return;
    }
    info.textContent = vigilance.source === 'manual'
      ? `Vigilance saisie manuellement par M-Alert${vigilance.reason === 'api-down' ? ' (API Météo-France indisponible)' : ''} · ${M.formatDateTime(vigilance.updatedAt)}`
      : `Mise à jour : ${M.formatDateTime(vigilance.updatedAt)}${vigilance.corrections ? ` · ${vigilance.corrections} département(s) corrigé(s) par M-Alert` : ''}${vigilance.error ? ' · ⚠ ' + vigilance.error : ''}`;
    $('mapCaption').textContent = `Vigilance ${day ? 'de demain' : 'd\'aujourd\'hui'} · ${M.formatDateTime(p.begin)} → ${M.formatDateTime(p.end)}`;
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
    setTimeout(() => el.remove(), duration);
  }

  // ---------- Notifications de M-Alert (messages sans alerte) ----------

  const NOTICE_COLOR = '#60a5fa';
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

  /** Bandeau compact en haut de l'écran pour une notification de M-Alert. */
  function showNoticeBanner(n) {
    current = { ...n, __notice: true };
    stopWaveCountdown();
    const ov = $('alertOverlay');
    ov.className = 'alert-overlay compact notice';
    ov.style.setProperty('--c', NOTICE_COLOR);
    ov.style.setProperty('--ct', '#0b1220');
    $('ovLevel').textContent = '🔔 Notification';
    $('ovPhen').textContent = 'M-Alert';
    $('ovTest').classList.toggle('hidden', !n.test);
    $('ovTime').textContent = M.formatDateTime(n.createdAt);
    $('ovTitle').textContent = n.title;
    $('ovDeps').textContent = M.departmentsLabel(n.departments, 8);
    $('ovEpi').classList.add('hidden');
    $('ovDesc').textContent = n.body || '';
    $('ovAdviceWrap').classList.add('hidden');
    $('ovValid').textContent = 'Consultable 24 h dans « Notifications »';
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

  // ---------- Alerte plein écran, son et notification ----------

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
      el.innerHTML = `📍 ${Math.round(arrival.km)} km de ${escapeHtml(M.departmentName(settings.department))} · ${wave('P', 'wave-p', arrival.p, t)} · ${wave('S', 'wave-s', arrival.s, t)}`;
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
  function renderTsunamiBoard(alert) {
    const el = $('ovTsunami');
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
          <span class="tsu-h${typeof r.height === 'number' ? ` tsu-l${level}` : ' empty'}">${typeof r.height === 'number' ? `${r.height.toLocaleString('fr-FR')}<small>m</small>` : ''}</span>
        </div>`);
      }
    }
    if (rows.some((r) => r.estimated)) html.push('<div class="tsu-note">≈ : heure d\'arrivée estimée</div>');
    el.innerHTML = html.join('');
  }

  /** Intensité (shindo) attendue dans mon département pour un séisme, ou null. */
  function localIntensity(alert) {
    if (alert.category !== 'seisme' || !alert.epicenter || typeof alert.magnitude !== 'number' || !settings.department) return null;
    const home = map.departmentCenter(settings.department);
    if (!home) return null;
    const { km } = map.waveArrival(alert.epicenter, alert.depth, home.lat, home.lon);
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
    // Tremblement de terre : bandeau compact en haut, la carte (épicentre, départements) reste visible.
    ov.className = `alert-overlay lvl-${alert.level}${alert.category === 'seisme' ? ' compact' : ''}`;
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
  // Bandeau compact (séisme) : un clic sur le texte l'affiche en entier.
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
