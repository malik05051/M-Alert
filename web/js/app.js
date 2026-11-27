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
    maxSound: 120, // durée maximale du son répété (s ; 0 : jusqu'à « J'ai compris »)
    fadeIn: false, // montée progressive du volume
    vibrate: true, // vibration (téléphone)
    infoSound: true, // son des informations et des notifications
    quiet: false, // heures calmes
    quietFrom: '22:00',
    quietTo: '07:00',
    quietMin: 4, // pendant les heures calmes : sonne dès ce niveau (9 : séismes et tsunamis seulement)
    tiles: false,
    lang: '', // langue de l'interface ('' : celle de l'appareil)
    translateAlerts: true, // titre, description et consignes des alertes traduits (anglais, allemand, espagnol)
    notifLang1: '', // langues des notifications de séisme ('' : celle de l'interface)
    notifLang2: 'auto', // seconde langue ('auto' : anglais, ou français si la première est l'anglais ; 'none' : aucune)
    quakeMode: 'level', // séismes : 'level' (niveau de l'alerte), 'magnitude', 'intensity' (chez moi) ou 'either'
    quakeMag: 4, // magnitude minimale
    quakeShindo: '3', // intensité minimale chez moi (shindo)
    timeSensitive: true, // iOS : notifications urgentes
    streamer: false, // mode streamer : mon département n'apparaît nulle part à l'écran
    geoloc: false, // position de l'appareil pour les alertes géolocalisées (zone dessinée dans le sender)
    serverUrl: (window.MALERT_CONFIG && window.MALERT_CONFIG.serverUrl) || 'http://localhost:8080',
  };
  let settings = { ...DEFAULTS, ...M.storage.get('malert.settings', {}) };
  // Incendie, ancien phénomène météo devenu une catégorie : désactivé avant, il le reste.
  if ((settings.phenomenaOff || []).map(Number).includes(M.FIRE_PHENOMENON)) {
    settings.phenomenaOff = settings.phenomenaOff.filter((p) => Number(p) !== M.FIRE_PHENOMENON);
    if (!settings.categoriesOff.includes('incendie')) settings.categoriesOff = [...settings.categoriesOff, 'incendie'];
    M.storage.set('malert.settings', settings);
  }
  // Phénomènes météo proposés (l'incendie est une catégorie).
  const METEO_PHENOMENA = Object.entries(PHENOMENA).filter(([id]) => Number(id) !== M.FIRE_PHENOMENON);
  const saveSettings = () => M.storage.set('malert.settings', settings);
  window.MAlertSound.configure(settings.sounds);
  // Sons par défaut choisis dans M-Alert-sender (gardés pour démarrer hors ligne).
  window.MAlertSound.setDefaults(M.storage.get('malert.soundDefaults', {}));
  // Sons envoyés depuis M-Alert-sender (.mp3) : lus sur le serveur de l'utilisateur.
  if (window.MAlertSound.setServer) window.MAlertSound.setServer(M.normalizeServerUrl(settings.serverUrl));
  function applySoundDefaults(map) {
    if (!map || typeof map !== 'object') return;
    M.storage.set('malert.soundDefaults', map);
    if (window.MAlertSound.setServer) window.MAlertSound.setServer(M.normalizeServerUrl(settings.serverUrl));
    window.MAlertSound.setDefaults(map);
  }

  // ---------- Sons des alertes (réglages) ----------

  const SOUND_ROWS = [
    ['information', 'Information et notifications'],
    ['eew', 'Jaune et orange'],
    ['rouge', 'Rouge'],
    ['majeur', 'Majeure'],
    ['tsunami', 'Crues, inondations, tsunamis'],
    // Application mobile : son d'alerte mobile pour l'orange, le rouge et le majeur.
    ...(document.documentElement.classList.contains('mobile-app') ? [['alerte-mobile', 'Orange, rouge et majeure (application mobile)']] : []),
    ['seisme', 'Tremblement de terre'],
    ['countdown', 'Bip du compte à rebours (séismes)'],
  ];
  const SOUND_NAMES = {
    information: 'Information',
    eew: 'Jaune / orange',
    rouge: 'Rouge',
    majeur: 'Majeure',
    tsunami: 'Crues et tsunami',
    'alerte-mobile': 'Alerte mobile',
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

  /**
   * Mode streamer : mon département (et les départements suivis) n'apparaît pas à l'écran (contour
   * sur la carte, carte « Mon département », 📍, intensité « chez vous », carte centrée dessus…) ;
   * les alertes et les notifications restent les mêmes.
   */
  const streamer = () => Boolean(settings.streamer);
  // Traduction automatique des alertes (titre, description, consignes), faite par le serveur dans la
  // langue de l'application (anglais, allemand, espagnol) ; « Voir l'original » la retire pour une alerte.
  const showOriginal = new Set();
  function alertText(a) {
    const lang = window.MAlertI18n && window.MAlertI18n.lang;
    const t = a && lang && lang !== 'fr' && settings.translateAlerts !== false && a.i18n ? a.i18n[lang] : null;
    const orig = Boolean(t) && showOriginal.has(a.id);
    const use = t && !orig ? t : {};
    return {
      title: use.title || (a && a.title) || '',
      description: use.description || (a && a.description) || '',
      advice: use.advice || (a ? M.adviceFor(a) : ''),
      translated: Boolean(t) && !orig, available: Boolean(t),
    };
  }
  const shownMine = () => (streamer() ? [] : myDepartments());
  document.documentElement.classList.toggle('streamer', streamer());

  function myDepartments() {
    const list = settings.department ? [settings.department] : [];
    for (const d of settings.extra) if (!list.includes(d)) list.push(d);
    return list;
  }

  // ---------- État ----------

  let alerts = [];          // alertes actives
  let vigilance = null;     // dernières données de vigilance
  let sealevel = null;      // mesures des marégraphes de l'UNESCO (tsunami, vagues-submersion)
  const seaObs = (code, kind) => M.seaObsText(sealevel && sealevel.departments && sealevel.departments[code], kind);
  let rivers = null;        // hauteurs d'eau des rivières (Hub'Eau) pendant les alertes crues et inondation
  const riverOf = (code) => (rivers && rivers.departments && rivers.departments[code]) || null;
  let webcamsEnabled = false; // webcams proches des alertes (Windy), si le serveur a la clé
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
    if ((p.id === 1 || p.id === 14) && p.gust) return ` : rafales ${p.gust} km/h${p.mean ? ` (moyen ${p.mean})` : ''}${p.pressure ? `, ${p.pressure} hPa` : ''}${p.at ? `, pic vers ${M.forecastTime(p.at, p.tz).h}` : ''}`;
    if (p.id === 2 && (p.rain24 || p.river)) return ` : ${p.rain24 ? `${p.rain24} mm en 24 h` : ''}${p.river ? `${p.rain24 ? ', ' : ''}crue de rivière` : ''}`;
    if (p.id === 9 && typeof p.hs === 'number') return ` : vagues ${p.hs.toLocaleString('fr-FR')} m${typeof p.water === 'number' && p.water >= 0 ? ', mer haute' : ''}${p.at ? `, pic vers ${M.forecastTime(p.at, p.tz).h}` : ''}`;
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
    // Vent, tempête, vagues-submersion, pluie-inondation automatiques : seulement le jour prévu.
    const date = M.periodDate(periodData(d), d);
    const sameDay = (a) => {
      const rows = a.forecastTable && Array.isArray(a.forecastTable.rows) ? a.forecastTable.rows.filter((r) => r.department === code) : [];
      if (!rows.length) return true;
      return rows.some((r) => !r.from || (date >= r.from.slice(0, 10) && date <= (r.to || r.from).slice(0, 10)));
    };
    return alertsFor(code)
      .filter((a) => wantsCategory(a) && new Date(a.expiresAt).getTime() > from && sameDay(a))
      .reduce((m, a) => (!m || a.level > m.level ? a : m), null);
  }

  function phenRows(vig) {
    if (!vig || !vig.phenomena || !vig.phenomena.length) return '';
    const rows = vig.phenomena.map((p) => {
      const ph = PHENOMENA[p.id] || PHENOMENA[0];
      return `<div class="tt-row"><span class="sw" style="width:9px;height:9px;border-radius:2px;background:${VIGILANCE[p.level].color}"></span>${ph.icon} ${escapeHtml(ph.name)}${p.infra ? ' <small>(une partie du département)</small>' : ''}${escapeHtml(outlookValue(p))}</div>`;
    }).join('');
    // Vigilance infra-départementale de Météo-France : zones du département les plus touchées.
    const zones = (vig.zones || []).filter((z) => z.level >= 2).map((z) => `<div class="tt-row" style="padding-left:12px"><span class="sw" style="width:9px;height:9px;border-radius:2px;background:${VIGILANCE[z.level].color}"></span>${escapeHtml(z.name)} : ${z.phenomena.map((x) => (PHENOMENA[x.id] || PHENOMENA[0]).icon).join(' ')}</div>`).join('');
    return rows + (zones ? `<div class="tt-row" style="margin-top:3px;opacity:.8">Zones du département :</div>${zones}` : '');
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
      html += `<div class="tt-row" style="margin-top:4px"><span class="tag" style="background:${LEVELS[a.level].color};color:${LEVELS[a.level].text}">${escapeHtml(M.alertLevelName(a))}</span>${escapeHtml(alertText(a).title)}</div>`;
    }
    return html;
  }

  // ---------- Carte : Vigilance / Vigicrues, phénomène, zone, noms des niveaux ----------

  // Choix gardés sur l'appareil : carte (vigilance ou vigicrues), phénomène ('' : tous ; « ph:3 »
  // phénomène météo ; « cat:seisme » catégorie), zone ('all', 'metro', 'nc').
  const mapView = { mode: 'vigilance', phen: '', zone: 'all', ...M.storage.get('malert.mapView', {}) };
  let vigicrues = null; // résumé Vigicrues (niveaux par tronçon et par département)
  let vicFull = null; // tracés des tronçons (chargés à la demande)
  let vicFullAt = 0;
  const FLOOD = [2, 4, 12];

  /** L'alerte correspond-elle au filtre de la carte ? */
  function mapWants(a) {
    if (mapView.mode === 'vigicrues') return (a.category || 'meteo') === 'meteo' && FLOOD.includes(Number(a.phenomenon));
    if (!mapView.phen) return true;
    const [kind, v] = mapView.phen.split(':');
    if (kind === 'cat') return M.categoryOf(a) === v;
    return (a.category || 'meteo') === 'meteo' && Number(a.phenomenon) === Number(v);
  }
  /** Vigilance filtrée : seulement le phénomène choisi (niveau du département recalculé). */
  function mapDepartments(p) {
    if (mapView.mode === 'vigicrues') {
      const out = {};
      for (const [code, d] of Object.entries((vigicrues && vigicrues.departments) || {})) out[code] = { level: d.level, phenomena: [{ id: 4, level: d.level, slots: [] }] };
      return out;
    }
    const deps = p ? p.departments : {};
    if (!mapView.phen) return deps;
    const [kind, v] = mapView.phen.split(':');
    if (kind !== 'ph') return {};
    const out = {};
    for (const [code, d] of Object.entries(deps)) {
      const ph = (d.phenomena || []).filter((x) => Number(x.id) === Number(v));
      out[code] = { level: ph.length ? Math.max(...ph.map((x) => x.level)) : 1, phenomena: ph };
    }
    return out;
  }
  async function loadVicFull() {
    if (vicFull && Date.now() - vicFullAt < 5 * 60000) return;
    try {
      const res = await fetch(`${M.normalizeServerUrl(settings.serverUrl)}/api/vigicrues?full=1`);
      vicFull = await res.json();
      vicFullAt = Date.now();
      if (mapView.mode === 'vigicrues') refreshMap();
    } catch (_) { /* serveur injoignable : départements seulement */ }
  }

  function refreshMap() {
    const p = periodData();
    map.setVigilance(mapDepartments(p), M.periodDate(p, day));
    map.setAlerts(mapView.mode === 'vigilance' && !mapView.phen ? alerts : alerts.filter(mapWants));
    map.setVigicrues(mapView.mode === 'vigicrues' ? vicFull : null);
    map.setHighlighted(shownMine());
    renderIntensities();
    renderMapTools();
  }

  /** Carte de la vigilance M-Alert en PDF (une page par jour, comme le bulletin de Météo-France). */
  async function downloadVigPdf() {
    const btn = $('mapPdf');
    btn.disabled = true;
    try {
      await loadVicFull();
      // Filtres de la carte appliqués au PDF : phénomène (ou type d'alerte) et zone.
      const sel = $('mapPhen');
      const filter = { phen: mapView.phen || '', zone: mapView.zone === 'nc' ? 'nc' : 'all', label: mapView.phen && sel ? sel.options[sel.selectedIndex].text.replace(/^\S+\s/, '') : '' };
      const blob = await window.MAlertBanner.vigilancePdf({ vig: vigilance, alerts: alerts.filter((a) => !a.test), rivers: vicFull && vicFull.sections, filter });
      const name = `vigilance-m-alert-${new Date().toISOString().slice(0, 10)}.pdf`;
      // Application mobile : partage du fichier (enregistrer, envoyer…) ; ailleurs : téléchargement.
      const file = typeof File === 'function' ? new File([blob], name, { type: 'application/pdf' }) : null;
      if (window.MAlertMobile && file && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Vigilance M-Alert' }); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      toast('PDF impossible', err.message, '#f87171');
    } finally {
      btn.disabled = false;
    }
  }

  function renderMapTools() {
    let el = document.getElementById('mapTools');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mapTools';
      el.className = 'map-tools';
      const opts = [['', 'Tous les phénomènes'], ...METEO_PHENOMENA.filter(([id]) => Number(id) > 0).map(([id, ph]) => [`ph:${id}`, `${ph.icon} ${ph.name}`]),
        ...Object.entries(M.CATEGORIES).filter(([k]) => k !== 'meteo').map(([k, c]) => [`cat:${k}`, `${c.icon} ${c.name}`])];
      el.innerHTML = `<div class="seg map-mode" role="tablist" aria-label="Carte">
          <button type="button" data-map-mode="vigilance">Vigilance</button><button type="button" data-map-mode="vigicrues" title="Vigilance crues par rivière (Vigicrues)">Vigicrues</button>
        </div>
        <select id="mapPhen" aria-label="Phénomène affiché">${opts.map(([v, t]) => `<option value="${v}">${escapeHtml(t)}</option>`).join('')}</select>
        <select id="mapZone" aria-label="Zone affichée"><option value="all">France entière</option><option value="nc">Nouvelle-Calédonie</option></select>
        <button type="button" class="btn small" id="mapPdf" title="Carte de la vigilance M-Alert en PDF (aujourd'hui, demain, après-demain)">📄 PDF</button>`;
      document.querySelector('.map-wrap').appendChild(el);
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-map-mode]');
        if (!b) return;
        mapView.mode = b.dataset.mapMode;
        M.storage.set('malert.mapView', mapView);
        if (mapView.mode === 'vigicrues') loadVicFull();
        refreshMap();
        renderAll();
      });
      $('mapPdf').addEventListener('click', downloadVigPdf);
      $('mapPhen').addEventListener('change', () => { mapView.phen = $('mapPhen').value; M.storage.set('malert.mapView', mapView); refreshMap(); });
      $('mapZone').addEventListener('change', () => { mapView.zone = $('mapZone').value; M.storage.set('malert.mapView', mapView); map.setZone(mapView.zone); renderAll(); });
      if (mapView.zone !== 'all') setTimeout(() => map.setZone(mapView.zone), 0);
      if (mapView.mode === 'vigicrues') loadVicFull();
    }
    el.querySelectorAll('[data-map-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mapMode === mapView.mode));
    $('mapPhen').value = mapView.phen;
    $('mapPhen').disabled = mapView.mode === 'vigicrues';
    $('mapZone').value = mapView.zone;
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
      // Après-demain pas encore calculé (serveur qui redémarre) : en attente.
      if (d === 2 && !(vigilance && vigilance.outlook)) return `<div class="vig-pill lvl-0"><small>${label}</small>En attente</div>`;
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
      ? '<p class="small" style="margin:8px 0 0;opacity:.8">Après-demain : prévision M-Alert (vent violent, tempête, vagues-submersion, pluie-inondation), pas une vigilance Météo-France.</p>'
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
      <div class="vig-pills">${pill(today, 'Aujourd\'hui', 0)}${pill(tomorrow, 'Demain', 1)}${pill(after, 'Après-demain', 2)}</div>
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
    // Alerte géolocalisée et position connue : seulement si l'appareil est dans la zone dessinée.
    const z = settings.geoloc ? M.inGeoZone(alert, myPos) : null;
    if (z !== null) return z;
    if (alert.departments.includes('ALL')) return true;
    return alert.departments.some((d) => myDepartments().includes(d));
  }

  // ---------- Position de l'appareil (alertes géolocalisées) ----------

  let myPos = settings.geoloc ? M.storage.get('malert.lastPos', null) : null;
  // Position trop ancienne (plus de 12 h) : on ne s'y fie plus (départements de l'alerte).
  if (myPos && Date.now() - (myPos.at || 0) > 12 * 3600000) myPos = null;
  let geoWatch = null;
  function startGeo() {
    if (geoWatch !== null || !settings.geoloc || !navigator.geolocation) return;
    geoWatch = navigator.geolocation.watchPosition((p) => {
      myPos = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, at: Date.now() };
      M.storage.set('malert.lastPos', myPos);
      if ($('geoState')) $('geoState').textContent = `📍 Position connue (précision ${Math.round(p.coords.accuracy)} m).`;
    }, (err) => {
      if ($('geoState')) $('geoState').textContent = `Position indisponible : ${err.code === 1 ? 'autorisation refusée' : 'pas de signal'} (les départements choisis servent à la place).`;
    }, { enableHighAccuracy: false, maximumAge: 5 * 60000, timeout: 60000 });
  }
  function stopGeo() {
    if (geoWatch !== null && navigator.geolocation) navigator.geolocation.clearWatch(geoWatch);
    geoWatch = null;
    myPos = null;
    M.storage.set('malert.lastPos', null);
  }

  function alertItemHtml(a, mf = null) {
    const lv = LEVELS[a.level];
    const ph = M.alertKind(a);
    return `<div class="alert-item ${isMine(a) && !streamer() ? 'mine' : ''}" data-alert="${a.id}" style="border-left-color:${lv.color}">
      <div class="t"><span class="tag" style="background:${lv.color};color:${lv.text}">${escapeHtml(M.alertLevelName(a))}</span>${a.test ? '<span class="tag" style="background:#6d28d9;color:#fff">TEST</span>' : ''}${escapeHtml(alertText(a).title)}</div>
      <div class="m">${ph.icon} ${escapeHtml(ph.name)}${M.quakeMethodTag(a, 'quake-method m-method')}${M.quakeSummary(a) ? ` · ${escapeHtml(M.quakeSummary(a))}` : ''}${M.tornadoSummary(a) ? ` · ${escapeHtml(M.tornadoSummary(a))}` : ''}${M.fireSummary(a) ? ` · ${escapeHtml(M.fireSummary(a))}` : ''}${M.pollutionSummary(a) ? ` · ${escapeHtml(M.pollutionSummary(a))}` : ''}${M.tsunamiSummary(a) ? ` · ${escapeHtml(M.tsunamiSummary(a))}` : ''} · ${escapeHtml(M.departmentsLabel(a.departments, 3))}</div>
      <div class="m">${M.relativeTime(a.createdAt)}${a.updatedAt ? ` · modifiée ${M.relativeTime(a.updatedAt)}` : ''} · ${M.untilText(a, { short: true })}${M.sourceShort(a) ? ` · ${escapeHtml(M.sourceShort(a))}` : ''}</div>
      ${mf && mf.length ? `<div class="m mf-line">${mfHtml(mf)}</div>` : ''}
    </div>`;
  }

  // Vigilances Météo-France fusionnées dans l'alerte M-Alert du même phénomène (une seule ligne dans
  // « Alertes en cours ») : vent violent et tempête, pluie-inondation, crues et inondation,
  // vagues-submersion et forte houle vont ensemble.
  const PH_FAMILY = { 1: 'vent', 14: 'vent', 2: 'pluie', 4: 'pluie', 12: 'pluie', 15: 'pluie', 9: 'mer', 16: 'mer' };
  const phFamily = (p) => PH_FAMILY[Number(p) || 0] || `p${Number(p) || 0}`;

  /**
   * Répartit les vigilances entre les alertes M-Alert : { vig: vigilances restantes (départements sans
   * alerte M-Alert du même phénomène), mf: Map id d'alerte → [{ phenomenon, level, departments }] }.
   */
  function mergeVigilance(list, vig) {
    const mf = new Map();
    const rest = [];
    for (const g of vig) {
      const same = list.filter((a) => !a.__vig && M.categoryOf(a) === 'meteo' && phFamily(a.phenomenon) === phFamily(g.phenomenon));
      const covers = (a, c) => (a.departments || []).includes(c) || (a.departments || []).includes('ALL');
      for (const a of same) {
        const codes = g.departments.filter((c) => covers(a, c));
        if (codes.length) mf.set(a.id, [...(mf.get(a.id) || []), { phenomenon: g.phenomenon, level: g.level, departments: codes }]);
      }
      const left = g.departments.filter((c) => !same.some((a) => covers(a, c)));
      if (left.length) rest.push(left.length === g.departments.length ? g : { ...g, departments: left });
    }
    return { vig: rest, mf };
  }

  /** « 🇫🇷 Météo-France : [Jaune] Pluie-inondation · Gard ». */
  function mfHtml(mf) {
    return `🇫🇷 Météo-France : ${[...mf].sort((x, y) => y.level - x.level).map((v) => {
      const c = VIGILANCE[v.level];
      const ph = PHENOMENA[v.phenomenon] || PHENOMENA[0];
      return `<span class="tag" style="background:${c.color};color:${LEVELS[v.level].text}" title="Vigilance Météo-France">${escapeHtml(c.name)}</span>${escapeHtml(ph.name)} · ${escapeHtml(M.departmentsLabel(v.departments, 3))}`;
    }).join(' · ')}`;
  }

  // Filtre de la liste « Alertes en cours » : catégorie ou phénomène météo.
  let alertFilter = M.storage.get('malert.alertFilter', '');
  $('alertFilter').innerHTML = '<option value="">Toutes les alertes</option>'
    + `<optgroup label="Catégorie">${Object.entries(M.CATEGORIES).map(([id, c]) => `<option value="cat:${id}">${c.icon} ${escapeHtml(c.name)}</option>`).join('')}</optgroup>`
    + `<optgroup label="Phénomène météo">${METEO_PHENOMENA.map(([id, p]) => `<option value="phen:${id}">${p.icon} ${escapeHtml(p.name)}</option>`).join('')}</optgroup>`;
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
    return vigilanceGroups();
  }
  function vigilanceGroups() {
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
    return `<div class="alert-item vig-item ${isMine(g) && !streamer() ? 'mine' : ''}" data-vig="${g.id}" style="border-left-color:${v.color}">
      <div class="t"><span class="tag" style="background:${v.color};color:${LEVELS[g.level].text}" title="Vigilance Météo-France">${escapeHtml(v.name)}</span>${ph.icon} ${escapeHtml(ph.name)}</div>
      <div class="m">🇫🇷 Météo-France${g.manual ? ' (corrigée par M-Alert)' : ''} · ${escapeHtml(M.departmentsLabel(g.departments, 3))}</div>
      <div class="m">${escapeHtml(when)}</div>
    </div>`;
  }

  function renderAlerts() {
    // Vigilances Météo-France : dans l'alerte M-Alert du même phénomène, sinon sur leur propre ligne.
    const merged = mergeVigilance(alerts, vigilanceItems());
    const vig = merged.vig;
    const all = [...alerts, ...vig];
    const sorted = all.filter(passesFilter).sort((a, b) => (streamer() ? 0 : isMine(b) - isMine(a)) || (b.level - a.level) || (Boolean(a.__vig) - Boolean(b.__vig)) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    $('alertCount').textContent = alertFilter ? `${sorted.length}/${all.length}` : all.length;
    $('alertList').innerHTML = sorted.length
      ? sorted.map((a) => (a.__vig ? vigItemHtml(a) : alertItemHtml(a, merged.mf.get(a.id)))).join('')
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
      $('mapCaption').textContent = 'Après-demain : prévision M-Alert pas encore disponible.';
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
      ? `Après-demain (${new Date(`${p.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}) · prévision M-Alert du vent violent, des tempêtes, des vagues-submersion et des pluies-inondations, Météo-France ne publiant pas de vigilance au-delà de demain · ${M.formatTime(p.updatedAt)}`
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
  setInterval(() => { $('clock').textContent = M.clockText(); $('clock').title = M.timeZoneLabel(); }, 1000);

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
  function showNotice(n, { quiet = false } = {}) {
    if (noticeSeen.has(n.id)) return false;
    markNoticeSeen(n.id);
    if (!noticeForMe(n)) return false;
    // Bandeau en haut (comme un séisme) ; derrière une alerte déjà affichée, il attend son tour.
    if (current && !current.__notice) {
      queue.push({ ...n, __notice: true });
      $('ovQueue').textContent = `+${queue.length} autre(s) alerte(s)`;
    } else {
      showNoticeBanner(n);
    }
    // Rattrapage de plusieurs notifications à l'ouverture : résumé unique (voir setNotices).
    if (quiet) return true;
    // Notification qui déclenche l'alerte mobile (M-Alert-sender) : elle sonne comme une alerte (son
    // « Alerte mobile » sur les téléphones), notification urgente avec le titre et le texte tels quels
    // (« Sécurité Civile » / « Avis de tornade »).
    if (n.mobileAlert) {
      const what = { level: 3, category: 'meteo', phenomenon: 0, mobileAlert: true };
      if (settings.sound && soundAllowed(what)) {
        window.MAlertSound.play(what, { volume: settings.volume, loop: false, fadeIn: settings.fadeIn });
        vibrate(3);
      }
      systemNotification(`${n.test ? '[TEST] ' : ''}${n.title}`, n.body || M.departmentsLabel(n.departments, 3),
        { tag: `notice-${n.id}`, urgent: true, level: 3, sound: 'alerte-mobile' });
      if (native) native.alert({ level: 3, front: settings.front });
      return true;
    }
    shortSound({ level: 1, category: 'meteo', phenomenon: 0 });
    // Persistante (comme les alertes orange et rouge) : une notification qui expire seule peut ne
    // jamais s'afficher (KDE Plasma notamment, quand la fenêtre de M-Alert passe au premier plan).
    systemNotification(`${n.test ? '[TEST] ' : ''}🔔 ${n.title}`, n.body || M.departmentsLabel(n.departments, 3), { tag: `notice-${n.id}`, urgent: true });
    // Application de bureau : la fenêtre revient au premier plan, comme pour une alerte.
    if (native) native.alert({ level: 1, front: settings.front });
    return true;
  }

  /**
   * Alerte annulée par M-Alert (fausse alerte : séisme qui n'a pas eu lieu) : bandeau d'annulation,
   * son d'information et notification, comme une notification de M-Alert.
   */
  function showVoided(a) {
    const kind = M.alertKind(a);
    const n = {
      id: `void-${a.id}`, __void: true, test: a.test, departments: a.departments, createdAt: a.voided.at,
      title: `Annulation : ${alertText(a).title}`, phen: `${kind.icon} ${kind.name}`,
      body: `${a.voided.reason}\n\nL'alerte « ${M.alertLevelLabel(a)} » envoyée ${M.formatDateTime(a.createdAt)} est annulée : vous pouvez reprendre vos activités normalement.`,
    };
    if (current && !current.__notice) {
      queue.push({ ...n, __notice: true });
      $('ovQueue').textContent = `+${queue.length} autre(s) alerte(s)`;
    } else {
      showNoticeBanner(n);
    }
    // Toute alerte annulée : son EEW (eew.mp3, réglable dans les sons « Jaune / orange »), jamais le
    // son d'information (le même que « EEW léger ») ; application mobile : son d'alerte mobile.
    // Heures calmes : selon l'alerte annulée.
    const isMobile = document.documentElement.classList.contains('mobile-app');
    if (settings.sound && soundAllowed(a)) {
      window.MAlertSound.play({ level: 2, category: 'meteo', phenomenon: 0, sound: isMobile ? 'alerte-mobile' : undefined },
        { volume: settings.volume, loop: false, fadeIn: settings.fadeIn });
      vibrate(2);
    }
    // « L'alerte de tremblement de terre émise à 14 h 32 a été annulée. (M-Alert) », en deux langues.
    const cancel = window.MAlertI18n.cancelNotification(a, kind.name, settings);
    const pre = `${a.test ? '[TEST] ' : ''}❌ `;
    systemNotification(`${pre}${cancel.title}`, cancel.body, {
      tag: `void-${a.id}`, urgent: true, level: 2, sound: 'alerte-mobile', parts: cancel.parts.map((p) => ({ title: pre + p.title, body: p.body })),
    });
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
  function onVigRing(g, { mobileAlert = false } = {}) {
    if (!g || !(settings.all || isMine(g))) return;
    if (g.phenomenon && (settings.phenomenaOff || []).includes(Number(g.phenomenon))) return;
    showVigBanner(g, { ring: true });
    const ph = PHENOMENA[g.phenomenon] || PHENOMENA[0];
    const title = `Rappel · Vigilance ${VIGILANCE[g.level].name.toLowerCase()} — ${ph.name}`;
    // « 📢 Alerte mobile » depuis M-Alert-sender : sonne comme une alerte mobile (téléphones).
    if (mobileAlert) {
      const what = { level: g.level, category: 'meteo', phenomenon: g.phenomenon, mobileAlert: true };
      if (settings.sound && soundAllowed(what)) {
        window.MAlertSound.play(what, { volume: settings.volume, loop: false, fadeIn: settings.fadeIn });
        vibrate(3);
      }
      systemNotification(title, M.departmentsLabel(g.departments, 3), { tag: `vig-${g.key}`, urgent: true, level: Math.max(3, g.level), sound: 'alerte-mobile' });
      if (native) native.alert({ level: Math.max(3, g.level), front: settings.front });
      return;
    }
    shortSound({ level: g.level, category: 'meteo', phenomenon: g.phenomenon });
    systemNotification(title, M.departmentsLabel(g.departments, 3), { tag: `vig-${g.key}`, urgent: true });
    if (native) native.alert({ level: g.level, front: settings.front });
  }

  /** Bandeau compact en haut de l'écran pour une notification de M-Alert (ou une annulation). */
  function showNoticeBanner(n) {
    current = { ...n, __notice: true };
    stopWaveCountdown();
    const ov = $('alertOverlay');
    ov.className = 'alert-overlay compact notice';
    ov.style.setProperty('--c', n.__void ? VOID_COLOR : n.__vig ? n.color : n.mobileAlert ? '#f97316' : NOTICE_COLOR);
    ov.style.setProperty('--ct', n.__vig ? n.textColor : '#0b1220');
    $('ovLevel').textContent = n.__void ? '❌ Alerte annulée' : n.__vig ? n.levelText : n.mobileAlert ? '📢 Alerte' : '🔔 Notification';
    $('ovPhen').textContent = n.__void || n.__vig ? n.phen : 'M-Alert';
    $('ovTest').classList.toggle('hidden', !n.test);
    $('ovTime').textContent = M.formatDateTime(n.createdAt);
    $('ovTitle').textContent = n.title;
    $('ovTr').classList.add('hidden');
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
    resetCams(current);
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
    const missed = notices.filter((n) => !noticeSeen.has(n.id) && noticeForMe(n)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (missed.length <= 1) { missed.forEach((n) => showNotice(n)); return; }
    // Plusieurs notifications manquées : toutes visibles (bandeaux à la suite), mais un seul son et
    // une seule notification du système.
    for (const n of missed) showNotice(n, { quiet: true });
    const mobile = missed.some((n) => n.mobileAlert);
    if (settings.sound) {
      const what = mobile ? { level: 3, category: 'meteo', phenomenon: 0, mobileAlert: true } : { level: 1, category: 'meteo', phenomenon: 0 };
      if (mobile && soundAllowed(what)) window.MAlertSound.play(what, { volume: settings.volume, loop: false, fadeIn: settings.fadeIn });
      else if (!mobile) shortSound(what);
    }
    const lines = missed.slice(-6).reverse().map((n) => `${n.mobileAlert ? '📢' : '🔔'} ${n.title}`);
    systemNotification(`🔔 ${missed.length} notifications de M-Alert`, lines.join('\n'), { tag: 'malert-notices', urgent: true, level: mobile ? 3 : 1, sound: mobile ? 'alerte-mobile' : null });
    if (native) native.alert({ level: mobile ? 3 : 1, front: settings.front });
  }

  // ---------- Alerte en bannière, son et notification ----------

  function wantsCategory(alert) {
    const cat = M.categoryOf(alert);
    if (settings.categoriesOff.includes(cat)) return false;
    // Phénomène météo désactivé dans les réglages.
    return !(cat === 'meteo' && (settings.phenomenaOff || []).includes(Number(alert.phenomenon) || 0));
  }

  /** Intensité (shindo) la plus forte attendue dans mes départements pour un séisme, ou null. */
  function myQuakeIntensity(alert) {
    let best = null;
    for (const code of myDepartments()) {
      const s = deptIntensity(alert, code);
      if (s !== null && (best === null || M.SHINDO_ORDER.indexOf(String(s)) > M.SHINDO_ORDER.indexOf(String(best)))) best = s;
    }
    return best;
  }

  /**
   * Séisme selon le réglage « M'alerter d'un séisme selon » : magnitude minimale (séismes qui
   * concernent mes départements) ou intensité attendue chez moi. null : règle habituelle (niveau).
   */
  function quakeWanted(alert) {
    const mode = settings.quakeMode || 'level';
    if (alert.category !== 'seisme' || mode === 'level') return null;
    const magOk = typeof alert.magnitude === 'number' && alert.magnitude >= Number(settings.quakeMag || 4) - 1e-9
      && (settings.all || isMine(alert));
    const local = myQuakeIntensity(alert);
    const shOk = local !== null && M.SHINDO_ORDER.indexOf(String(local)) >= M.SHINDO_ORDER.indexOf(String(settings.quakeShindo || '3'));
    return mode === 'magnitude' ? magOk : mode === 'intensity' ? shOk : magOk || shOk;
  }

  function matchesMe(alert) {
    if (!wantsCategory(alert)) return false;
    const quake = quakeWanted(alert);
    if (quake !== null) return quake;
    // Alerte critique (avertissement de tsunami…) : même sous le niveau minimum choisi.
    if (alert.level < settings.minLevel && !M.isCritical(alert)) return false;
    if (settings.all) return true;
    return isMine(alert);
  }

  /** Lieu de l'épicentre pour les notifications : « Alpes-Maritimes (06) », ou ses coordonnées. */
  function quakePlace(a) {
    const e = a.epicenter;
    if (!e) return null;
    const code = map.departmentAt(e.lat, e.lon);
    return code
      ? M.departmentName(code) // « Alpes-Maritimes (06) »
      : `${Math.abs(e.lat).toFixed(2)}° ${e.lat >= 0 ? 'N' : 'S'}, ${Math.abs(e.lon).toFixed(2)}° ${e.lon >= 0 ? 'E' : 'W'}`;
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
      // Mode streamer : sans la distance (elle situerait le domicile), seulement les ondes.
      const html = `${streamer() ? '' : `📍 ${Math.round(arrival.km)} km de ${escapeHtml(M.departmentName(settings.department))} · `}${wave('P', 'wave-p', arrival.p, t)} · ${wave('S', 'wave-s', arrival.s, t)}`;
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
    const sameDay = M.zonedDate(t.getTime()) === M.zonedDate();
    const hm = M.formatTime(t.toISOString());
    return `${r.estimated ? '≈ ' : ''}${sameDay ? hm : `${t.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', timeZone: M.timeZone() })} ${hm}`}`;
  }
  // Vent violent et vagues-submersion automatiques : même tableau, par niveau, chaque département
  // avec ses heures prévues (début, fin, pic) et ses valeurs (rafales et vent moyen, ou vagues et mer).
  const FORECAST_GROUPS = [[5, 'Niveau majeur'], [4, 'Niveau rouge'], [3, 'Niveau orange'], [2, 'Niveau jaune']];
  /**
   * Heure du tableau (« AAAA-MM-JJTHH:MM », heure de Paris, ou du fuseau du tableau : Nouméa) dans
   * le fuseau choisi : « 14 h », précédée du jour si ce n'est pas aujourd'hui.
   */
  function forecastHour(t, withDay, tz) {
    if (!t) return '';
    const f = M.forecastTime(t, tz || 'Europe/Paris');
    if (!withDay || f.date === M.zonedDate()) return f.h;
    return `${new Date(f.ms).toLocaleDateString('fr-FR', { weekday: 'short', timeZone: M.timeZone() })} ${f.h}`;
  }
  const num = (x, d = 1) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  function renderForecastBoard(alert, el) {
    const t = alert.forecastTable;
    const deps = new Set(alert.departments || []);
    const rows = t.rows.filter((r) => deps.has('ALL') || deps.has(r.department));
    if (!rows.length) return false;
    const mine = shownMine();
    const flood = t.kind === 'inondation';
    const wind = t.kind === 'vent' || t.kind === 'tempete';
    const titles = { vent: 'Rafales prévues par département', tempete: 'Tempête : rafales prévues par département', submersion: 'Vagues et niveau de la mer prévus', inondation: 'Pluie et crues prévues par département' };
    const hoursNote = `Heures : ${M.timeZoneLabel()}.`;
    const html = [`<div class="tsu-title">${titles[t.kind] || titles.vent}</div>`];
    const strength = (r) => (wind ? Math.max(r.gust || 0, r.gustCoast || 0) : flood ? Math.max(r.rain24 || 0, (r.river || 0) * 50) : r.hs || 0);
    for (const [level, name] of FORECAST_GROUPS) {
      const group = rows.filter((r) => r.level === level).sort((a, b) => strength(b) - strength(a));
      if (!group.length) continue;
      html.push(`<div class="tsu-head fc-l${level}">${name}</div>`);
      for (const r of group) {
        // Jour affiché quand il change par rapport au début (dans le fuseau choisi).
        const dayOf = (x) => (x ? M.forecastTime(x, t.tz || 'Europe/Paris').date : '');
        const span = r.from ? `${forecastHour(r.from, true, t.tz)} → ${forecastHour(r.to, r.to && dayOf(r.to) !== dayOf(r.from), t.tz)}` : '';
        const peak = r.at ? `pic ${forecastHour(r.at, r.from && dayOf(r.at) !== dayOf(r.from), t.tz)}` : '';
        let value;
        let sub;
        if (wind) {
          const g = Math.max(r.gust || 0, r.gustCoast || 0);
          value = `${g}<small>km/h</small>`;
          sub = [r.gustCoast ? `terres ${r.gust} km/h` : '', r.mean ? `moyen ${r.mean} km/h` : '', r.pressure ? `${r.pressure} hPa` : ''].filter(Boolean).join(' · ');
        } else if (flood) {
          value = r.rain24 >= 1 ? `${Math.round(r.rain24)}<small>mm</small>` : r.river ? `×${num(r.river)}` : '—';
          sub = [r.rain72 > (r.rain24 || 0) + 5 ? `${Math.round(r.rain72)} mm en 72 h` : '', r.river ? `rivière ${r.q} m³/s (×${num(r.river)})` : '',
            r.aboveMf ? `Météo-France : ${r.mfLevel >= 2 ? VIGILANCE[r.mfLevel].name.toLowerCase() : 'vert'}` : ''].filter(Boolean).join(' · ');
        } else {
          const hp = typeof r.hs === 'number' && r.hs > 0 ? M.heightParts(r.hs) : null;
          value = hp ? `${hp.num}<small>${hp.unit}</small>` : '—';
          sub = [typeof r.water === 'number' ? `mer ${M.heightText(r.water, { sign: true, digits: 2 })}` : '', typeof r.setup === 'number' ? `surcote ${M.heightText(r.setup, { digits: 2 })}` : '',
            typeof r.wind === 'number' && (r.byWind || !(r.hs > 0)) ? `vent de mer ${r.wind} km/h` : '',
            r.aboveMf ? `Météo-France : ${r.mfLevel >= 2 ? VIGILANCE[r.mfLevel].name.toLowerCase() : 'vert'}` : ''].filter(Boolean).join(' · ');
          if (!(r.hs > 0) && typeof r.wind === 'number') value = `${r.wind}<small>km/h</small>`;
        }
        html.push(`<div class="tsu-row fc-row${mine.includes(r.department) ? ' mine' : ''}">
          <span class="tsu-name">${mine.includes(r.department) ? '📍 ' : ''}${escapeHtml(M.departmentName(r.department).replace(/ \(\w+\)$/, ''))}</span>
          <span class="tsu-arr fc-time${span ? '' : ' empty'}">${escapeHtml(span)}${peak ? `<small>${escapeHtml(peak)}</small>` : ''}</span>
          <span class="tsu-h fc-l${level}">${value}${sub ? `<span class="tsu-max">${escapeHtml(sub)}</span>` : ''}</span>
        </div>`);
        // Vagues-submersion : pleine mer mesurée par le marégraphe de l'UNESCO.
        const obs = !wind && !flood && !alert.hideMeasures ? seaObs(r.department, 'surge') : '';
        if (obs) html.push(`<div class="tsu-obs">📡 ${escapeHtml(obs)}</div>`);
        // Crues et inondations : hauteur d'eau mesurée (Hub'Eau), là où l'eau monte le plus.
        const riv = flood && !alert.hideMeasures ? M.riverObsText(riverOf(r.department), 1) : '';
        if (riv) html.push(`<div class="tsu-obs">💧 ${escapeHtml(riv)}</div>`);
      }
    }
    html.push(`<div class="tsu-note">${flood
      ? `${rows.some((r) => r.mf) ? 'Niveaux et heures : vigilance pluie-inondation et crues de Météo-France, sauf si M-Alert prévoit plus grave. ' : ''}Cumul de pluie maximal sur 24 heures (et sur 72 heures) ; rivière : débit prévu par GloFAS, rapporté au plus fort débit des 12 derniers mois. ${hoursNote}`
      : wind
      ? `Rafales maximales prévues (sur la côte si elles y sont plus fortes) ; vent moyen sur 10 minutes${t.kind === 'tempete' ? ' ; pression la plus basse au niveau de la mer' : ''}. ${hoursNote}`
      : `${rows.some((r) => r.mf) ? 'Niveaux et heures : vigilance vagues-submersion de Météo-France. ' : ''}${rows.some((r) => r.aboveMf) ? 'M-Alert prévoit plus grave que Météo-France pour certains départements : son niveau l\'emporte. ' : ''}${rows.some((r) => r.byWind) ? 'Vent de mer : vent moyen soufflant vers la côte (vent violent, tempête), qui fait monter la mer et grossir les vagues. ' : ''}Hauteur des vagues au large estimée par M-Alert ; mer : niveau par rapport aux plus hautes mers du mois (marée et pression), surcote due au vent. ${hoursNote}`}</div>`);
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
    const mine = shownMine();
    const html = ['<div class="tsu-title">Arrivée prévue du tsunami</div>'];
    for (const [level, name] of TSUNAMI_GROUPS) {
      const group = rows.filter((r) => r.level === level);
      if (!group.length) continue;
      html.push(`<div class="tsu-head tsu-l${level}">${name}</div>`);
      for (const r of group) {
        // Heure corrigée par les marégraphes (arrivée mesurée, ou temps de trajet recalé).
        const fix = alert.hideMeasures ? null : M.arrivalFix(sealevel, alert, r.department);
        const arrival = fix
          ? (fix.measured ? `Arrivé ${M.formatTime(fix.at)}` : new Date(fix.at).getTime() <= Date.now() ? 'Probablement arrivé' : `≈ ${M.formatTime(fix.at)}`)
          : tsunamiArrivalText(r);
        html.push(`<div class="tsu-row${mine.includes(r.department) ? ' mine' : ''}">
          <span class="tsu-name">${mine.includes(r.department) ? '📍 ' : ''}${escapeHtml(M.departmentName(r.department).replace(/ \(\w+\)$/, ''))}</span>
          <span class="tsu-arr${arrival ? '' : ' empty'}">${escapeHtml(arrival)}</span>
          <span class="tsu-h${typeof r.height === 'number' ? ` tsu-l${level}` : ' empty'}"${r.heightEstimated ? ' title="Hauteur estimée par M-Alert (magnitude et distance)"' : ''}>${typeof r.height === 'number' ? `${r.heightEstimated ? '<span class="tsu-est">≈</span>' : ''}${M.heightParts(r.height).num}<small>${M.heightParts(r.height).unit}</small>` : ''}</span>
        </div>`);
        // Marégraphe de l'UNESCO : vague du tsunami mesurée dans le port.
        const obs = alert.hideMeasures ? '' : seaObs(r.department, 'tsunami');
        if (obs) html.push(`<div class="tsu-obs">📡 ${escapeHtml(obs)}</div>`);
      }
    }
    const notes = [];
    if (rows.some((r) => r.estimated)) notes.push('heure d\'arrivée estimée');
    const fixes = !alert.hideMeasures && sealevel && sealevel.arrivals && sealevel.arrivals.alertId === alert.id ? sealevel.arrivals : null;
    if (fixes && fixes.ratio) notes.push(`heures corrigées d'après l'arrivée mesurée par les marégraphes (${fixes.basis.map((b) => b.name).join(', ')} : trajet ×${fixes.ratio.toLocaleString('fr-FR')})`);
    if (rows.some((r) => r.heightEstimated)) notes.push('hauteur moyenne estimée (type de faille, magnitude, distance, profondeur de la mer)');
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
    // Intensité la plus forte du département : à son point le plus proche de l'épicentre (comme
    // l'intensité maximale de l'alerte, celle du département le plus touché).
    const km = map.departmentKm(code, alert.epicenter.lat, alert.epicenter.lon);
    if (km === null) return null;
    return M.toShindo(M.estimateIntensity(alert.magnitude, Number(alert.depth) || 10, km));
  }

  /** Intensité maximale : la plus forte des intensités par département (elle suit leurs changements). */
  function quakeMaxShindo(alert) {
    let best = null;
    for (const { code } of M.departmentList()) {
      const sh = deptIntensity(alert, code);
      if (sh && M.SHINDO_ORDER.indexOf(String(sh)) >= 1 && (!best || M.SHINDO_ORDER.indexOf(String(sh)) > M.SHINDO_ORDER.indexOf(best))) best = String(sh);
    }
    return best || (alert.shindo ? String(alert.shindo) : null);
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
    // Séisme : étiquette PLUM juste après « Tremblement de terre ».
    $('ovPhen').innerHTML = `${escapeHtml(`${ph.icon} ${ph.name}`)}${M.quakeMethodTag(alert, 'alert-method')}`;
    $('ovTest').classList.toggle('hidden', !alert.test);
    $('ovTime').textContent = M.formatDateTime(alert.createdAt) + (alert.updatedAt ? ` · modifiée ${M.formatTime(alert.updatedAt)}` : '') + ` · ${M.sourceLabel(alert)}`;
    renderTsunamiBoard(alert);
    renderRivers(alert);
    resetCams(alert);
    renderOverlayText(alert);
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
    const maxSh = alert.category === 'seisme' ? quakeMaxShindo(alert) : null;
    if (maxSh && M.SHINDO[maxSh]) {
      quake.push(`<span class="int-pair">${badge(maxSh, 'Intensité maximale (échelle shindo)')}<small>max</small></span>`);
    }
    // Intensité attendue dans mon département (estimée d'après magnitude, profondeur et distance).
    const local = streamer() ? null : localIntensity(alert);
    if (local) quake.push(`<span class="int-pair">${badge(local, 'Intensité attendue dans votre département (estimation)')}<small>chez vous</small></span>`);
    if (alert.category === 'seisme' && typeof alert.magnitude === 'number') quake.push(`<b>M${alert.magnitude.toFixed(1)}</b>`);
    if (alert.category === 'seisme' && typeof alert.depth === 'number') quake.push(`<span>Profondeur : <b>${alert.depth} km</b></span>`);
    if (alert.epicenter) quake.push(`✕ Épicentre : ${escapeHtml(epicenterText(alert.epicenter))}`);
    // Tsunami : hauteur des vagues, seulement si elle a été indiquée.
    if (alert.category === 'tsunami' && typeof alert.waveHeight === 'number') quake.push(`<span>🌊 Vagues attendues : <b>jusqu'à ${M.heightText(alert.waveHeight)}</b></span>`);
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
    // Vigilance Météo-France du même phénomène dans ses départements (fusionnée avec l'alerte).
    const mf = alert.__vig || alert.__notice ? null : mergeVigilance([alert], vigilanceGroups()).mf.get(alert.id);
    if (mf && mf.length) quake.push(`<span class="mf-line">${mfHtml(mf)}</span>`);
    $('ovEpi').classList.toggle('hidden', !quake.length);
    $('ovEpi').innerHTML = quake.join(' ');
    $('ovValid').textContent = alert.noEnd ? 'Sans date de fin : en vigueur jusqu\'à la levée de l\'alerte' : `Valable ${M.untilText(alert)}`;
    $('ovQueue').textContent = queue.length ? `+${queue.length} autre(s) alerte(s)` : '';
    $('ovMute').classList.toggle('hidden', Boolean(silent) || !settings.sound);
    $('ovAck').focus({ preventScroll: true });
    ov.querySelector('.alert-banner').scrollTop = 0;
    ov.querySelector('.alert-body').classList.remove('expanded');
  }

  /** Titre, description et consignes de la bannière (traduits si possible) et mention « Traduit… ». */
  function renderOverlayText(alert) {
    const tx = alert.__notice ? { title: alert.title, description: alert.description, advice: M.adviceFor(alert) } : alertText(alert);
    $('ovTitle').textContent = tx.title;
    $('ovDesc').textContent = tx.description;
    $('ovAdviceWrap').classList.toggle('hidden', !tx.advice);
    $('ovAdvice').textContent = tx.advice || '';
    const tr = $('ovTr');
    tr.classList.toggle('hidden', !tx.available);
    tr.innerHTML = tx.available
      ? (tx.translated ? '<span>🌐 Traduit automatiquement</span> · <u>Voir l\'original</u>' : '<span>🌐 Texte original</span> · <u>Voir la traduction</u>')
      : '';
  }

  /**
   * Crues, pluie-inondation, inondation sans tableau de prévision : hauteurs d'eau mesurées
   * (Hub'Eau) dans les départements de l'alerte, les miens d'abord.
   */
  function renderRivers(alert) {
    const el = $('ovRivers');
    const hasBoard = alert.forecastTable && Array.isArray(alert.forecastTable.rows) && alert.forecastTable.rows.length;
    const mine = shownMine();
    const deps = M.isFloodAlert(alert) && !hasBoard && !alert.hideMeasures
      ? [...(alert.departments || [])].sort((a, b) => Number(mine.includes(b)) - Number(mine.includes(a))) : [];
    const lines = [];
    for (const d of deps) {
      const r = riverOf(d);
      // Une station par élément (texte traduit à part dans les autres langues).
      const sts = r && Array.isArray(r.stations) ? r.stations.slice(0, mine.includes(d) ? 2 : 1).map(M.riverStationText).filter(Boolean) : [];
      if (sts.length) lines.push(`<div class="riv-line${mine.includes(d) ? ' mine' : ''}"><b>${escapeHtml(M.departmentName(d).replace(/ \(\w+\)$/, ''))}</b> ${sts.map((t) => `<span>${escapeHtml(t)}</span>`).join(' · ')}</div>`);
      if (lines.length >= 4) break;
    }
    el.classList.toggle('hidden', !lines.length);
    el.innerHTML = lines.length ? `<div class="riv-title">💧 Hauteurs d'eau mesurées <small>Hub'Eau · Vigicrues</small></div>${lines.join('')}` : '';
  }

  // ---------- Webcams de la zone (Windy) ----------

  let camsFor = null;
  /** Nouvelle alerte en bannière : bouton « Webcams de la zone », images pas encore chargées. */
  function resetCams(alert) {
    // Notifications (y compris « 📢 Alerte ») et vigilances : webcams cherchées par départements.
    const deps = (alert.departments || []).filter((d) => d !== 'ALL');
    const ok = webcamsEnabled && !alert.__void && deps.length + (alert.epicenter ? 1 : 0) > 0;
    $('ovCamsWrap').classList.toggle('hidden', !ok);
    if (camsFor === (alert.id || alert.title)) return;
    camsFor = alert.id || alert.title;
    $('ovCams').classList.add('hidden');
    $('ovCams').innerHTML = '';
    $('ovCamsBtn').disabled = false;
    $('ovCamsBtn').textContent = '📷 Webcams de la zone';
  }
  async function loadCams() {
    const alert = current;
    if (!alert) return;
    const server = M.normalizeServerUrl(settings.serverUrl);
    const mine = shownMine().filter((d) => (alert.departments || []).includes(d));
    const q = new URLSearchParams();
    // Vigilance Météo-France (pas une alerte du serveur) : recherche par départements.
    // Vigilance Météo-France ou notification de M-Alert (pas une alerte du serveur) : recherche par
    // départements (sinon « Alerte inconnue »).
    if (alert.__vig || alert.__notice || !alert.id) {
      q.set('deps', [...new Set([...mine, ...(alert.departments || [])])].filter((d) => d !== 'ALL').slice(0, 5).join(','));
      q.set('kind', M.webcamKind(alert));
    } else {
      q.set('alert', alert.id);
      if (mine.length) q.set('deps', mine.join(','));
    }
    const box = $('ovCams');
    $('ovCamsBtn').disabled = true;
    $('ovCamsBtn').textContent = '📷 Chargement…';
    try {
      const res = await fetch(`${server}/api/webcams?${q}`);
      const data = await res.json();
      if (current !== alert) return;
      const list = Array.isArray(data.webcams) ? data.webcams : [];
      const ago = (t) => {
        const m = Math.round((Date.now() - Date.parse(t)) / 60000);
        return !Number.isFinite(m) ? '' : m < 60 ? `il y a ${Math.max(1, m)} min` : m < 48 * 60 ? `il y a ${Math.round(m / 60)} h` : '';
      };
      box.innerHTML = list.length
        ? `<div class="cams-strip">${list.map((w) => `<a class="cam" href="${escapeHtml(w.day || w.detail)}" target="_blank" rel="noopener" title="${escapeHtml(w.title)}">
            <img src="${escapeHtml(w.preview)}" alt="" loading="lazy" referrerpolicy="no-referrer">
            ${w.source === 'youtube' ? '<span class="cam-live">🔴 Direct</span>' : ''}
            <span class="cam-t">${escapeHtml(w.title)}</span>
            <span class="cam-s">${[w.source === 'youtube' ? `YouTube${w.city ? ` · ${w.city}` : ''}` : w.sourceLabel || '', typeof w.km === 'number' ? `${Math.round(w.km)} km` : '', w.source === 'youtube' ? '' : ago(w.updatedAt), w.live && w.source !== 'youtube' ? 'direct' : ''].filter(Boolean).map((x, i, arr) => (x === 'direct' ? '<b>direct</b>' : `<span>${escapeHtml(x)}</span>`)).join(' · ')}</span>
          </a>`).join('')}</div>
          <div class="cams-credit"><span>${data.live ? 'Directs YouTube et images récentes' : 'Images en direct ou récentes'}</span> · <a href="${escapeHtml((data.credit && data.credit.url) || 'https://www.windy.com/webcams')}" target="_blank" rel="noopener">${escapeHtml((data.credit && data.credit.text) || 'Webcams : Windy.com')}</a></div>`
        : `<div class="cams-credit">${escapeHtml(data.error ? `Webcams indisponibles (${data.error}).` : 'Aucune webcam trouvée près de la zone.')}</div>`;
      box.classList.remove('hidden');
      $('ovCamsBtn').textContent = list.length ? `📷 ${list.length} webcam(s) de la zone` : '📷 Webcams de la zone';
    } catch (_) {
      if (current !== alert) return;
      box.innerHTML = '<div class="cams-credit">Webcams indisponibles (serveur injoignable).</div>';
      box.classList.remove('hidden');
      $('ovCamsBtn').textContent = '📷 Webcams de la zone';
    }
    $('ovCamsBtn').disabled = false;
  }

  /** Heures calmes en cours (réglages) ? */
  function inQuietHours() {
    if (!settings.quiet) return false;
    const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: M.timeZone() });
    const from = settings.quietFrom || '22:00';
    const to = settings.quietTo || '07:00';
    return from <= to ? now >= from && now < to : now >= from || now < to;
  }
  /** Le son (et la vibration) passent-ils pour cette alerte, vu les heures calmes ? */
  function soundAllowed(alert) {
    if (!inQuietHours()) return true;
    const quake = ['seisme', 'tsunami'].includes(alert.category);
    const min = Number(settings.quietMin) || 4;
    return (quake && min < 99) || (min <= 5 && Number(alert.level) >= min);
  }
  /** Vibration du téléphone selon le niveau (navigateur ou application mobile). */
  function vibrate(level) {
    if (!settings.vibrate || !navigator.vibrate) return;
    const patterns = { 1: [150], 2: [300, 150, 300], 3: [500, 200, 500, 200, 500], 4: [800, 200, 800, 200, 800, 200, 800], 5: [1000, 200, 1000, 200, 1000, 200, 1000, 200, 1000] };
    try { navigator.vibrate(patterns[Math.max(1, Math.min(5, level))] || patterns[2]); } catch (_) { /* non pris en charge */ }
  }
  /** Son court (information, notification, rappel) : selon les réglages. */
  function shortSound(what) {
    const level = Number(what.level) || 1;
    if (!settings.sound || !soundAllowed(what) || (level <= 1 && settings.infoSound === false)) return;
    window.MAlertSound.play(what, { volume: settings.volume, loop: false, fadeIn: settings.fadeIn });
    vibrate(level);
  }

  // Son d'une alerte. Majeur.mp3 se répète toujours jusqu'à « J'ai compris », sans limite de durée.
  let pendingSound = null; // alerte qui n'a pas pu sonner (son bloqué par le navigateur)
  function alertSound(alert) {
    if (!soundAllowed(alert)) return;
    const majeur = window.MAlertSound.soundFile(alert) === 'majeur';
    const max = Number(settings.maxSound ?? 120);
    window.MAlertSound.play(alert, {
      volume: settings.volume,
      loop: majeur || (settings.repeat && (alert.level >= 3 || Boolean(alert.mobileAlert))),
      untilStopped: majeur || max === 0,
      maxSeconds: max || 120,
      fadeIn: settings.fadeIn,
    });
    vibrate(alert.level);
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
  $('ovTr').addEventListener('click', () => {
    if (!current || !current.id) return;
    if (showOriginal.has(current.id)) showOriginal.delete(current.id); else showOriginal.add(current.id);
    renderOverlayText(current);
    renderAll();
  });
  $('ovCamsBtn').addEventListener('click', loadCams);
  // Webcam : lecteur Windy (images de la journée) dans le navigateur du téléphone ou de l'ordinateur.
  $('ovCams').addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    const mob = window.MAlertMobile;
    if (!a || native || !mob || !mob.openUrl) return;
    e.preventDefault();
    mob.openUrl(a.href).catch(() => {});
  });
  // Bannière : un clic sur le texte l'affiche en entier (description et consignes).
  // Consignes : affichées sous la description, le bandeau défile jusqu'à elles (le tableau reste visible).
  document.querySelector('#alertOverlay .alert-body').addEventListener('click', (e) => {
    const body = e.currentTarget;
    body.classList.toggle('expanded');
    if (body.classList.contains('expanded')) {
      requestAnimationFrame(() => {
        const target = $('ovAdviceWrap').classList.contains('hidden') || !$('ovAdviceWrap').offsetHeight ? body : $('ovAdviceWrap');
        target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
  });
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

  /**
   * Notification du système. Application iOS : notification native, « urgente » (Time Sensitive)
   * dès l'orange, avec le son d'alerte mobile.
   */
  async function systemNotification(title, body, { tag, urgent, onClick, level = 1, parts = null, sound = null } = {}) {
    const mobile = window.MAlertMobile;
    if (mobile && mobile.notify) {
      Promise.resolve().then(() => mobile.notify({
        id: String(tag || Date.now()), title, body, level,
        // iOS : une notification par langue (le texte d'une bannière est coupé après 4 lignes).
        parts: parts || undefined,
        timeSensitive: settings.timeSensitive !== false && (urgent || level >= 3),
        critical: false,
        sound: sound || (level >= 3 ? 'alerte-mobile' : 'default'),
      })).catch(() => {});
      if (onClick) mobile.onTap = onClick;
      return;
    }
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
      toast(`${M.specialLevel(alert) ? M.alertLevelLabel(alert) : `Nouvelle alerte ${lv.name.toLowerCase()}`} : ${alertText(alert).title}`, M.departmentsLabel(alert.departments, 3), lv.color, () => {
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
    // Rattrapage à l'ouverture (plusieurs alertes en cours) : un seul son et une seule notification
    // pour toutes (voir catchUp), pas une rafale.
    if (batching) {
      batching.push({ alert, updated, ring });
      markSeen(alert.id);
      markAlerted(alert);
      return;
    }
    announce(alert, { updated, ring });
    markSeen(alert.id);
    markAlerted(alert);
  }

  /** Son, notification du système et fenêtre au premier plan pour une alerte affichée. */
  function announce(alert, { updated, ring } = {}) {
    if (settings.sound) {
      alertSound(alert);
      setTimeout(() => {
        if (window.MAlertSound.isLocked() && current && current.id === alert.id) {
          pendingSound = alert; // rejoué au premier clic qui débloque le son
          $('soundHint').classList.remove('hidden');
        }
      }, 1000);
    }
    const prefix = (alert.test ? '[TEST] ' : '') + (ring ? 'RAPPEL · ' : updated ? 'MISE À JOUR · ' : '');
    // Tremblement de terre : notification en deux langues, comme une alerte d'urgence japonaise.
    const quake = alert.category === 'seisme'
      ? window.MAlertI18n.quakeNotification(alert, { place: quakePlace(alert), local: myQuakeIntensity(alert) }, settings)
      : null;
    systemNotification(
      quake ? `${prefix}${quake.title}` : `${prefix}${M.alertKind(alert).icon} ${M.alertLevelLabel(alert)} — ${alertText(alert).title}`,
      quake ? quake.body : `${M.departmentsLabel(alert.departments, 3)}\n${alertText(alert).description}`,
      {
        tag: alert.id, urgent: alert.level >= 3 || Boolean(alert.mobileAlert), level: alert.level,
        parts: quake && quake.parts.map((p) => ({ title: `${prefix}${p.title}`, body: p.body })),
        // Alerte mobile demandée dans M-Alert-sender : son d'alerte mobile, quel que soit le niveau.
        // Son choisi dans M-Alert-sender, sinon alerte mobile demandée : son d'alerte mobile.
        sound: alert.sound || (alert.mobileAlert ? 'alerte-mobile' : null),
      },
    );
    if (native) native.alert({ level: alert.level, front: settings.front });
  }

  /**
   * Alertes en cours rattrapées à l'ouverture de l'application (ou au retour du réseau) : la plus
   * grave s'affiche (les autres attendent leur tour derrière), un seul son et une seule notification
   * résument le tout (« 3 alertes en cours dans vos départements »), au lieu d'une par alerte.
   */
  let batching = null;
  function catchUp(list) {
    // La plus grave d'abord (puis la plus récente).
    const sorted = list.slice().sort((a, b) => (b.level - a.level) || b.createdAt.localeCompare(a.createdAt));
    batching = [];
    try {
      for (const a of sorted) {
        const updated = Boolean(a.__updated);
        const ring = Boolean(a.__ring);
        delete a.__updated;
        delete a.__ring;
        trigger(a, { updated, ring });
      }
    } finally {
      const done = batching;
      batching = null;
      if (done.length === 1) announce(done[0].alert, done[0]);
      else if (done.length > 1) announceMany(done);
    }
  }

  function announceMany(items) {
    const top = items[0].alert;
    if (settings.sound) {
      alertSound(current && items.some((x) => x.alert.id === current.id) ? current : top);
      setTimeout(() => {
        if (window.MAlertSound.isLocked() && current && items.some((x) => x.alert.id === current.id)) {
          pendingSound = current;
          $('soundHint').classList.remove('hidden');
        }
      }, 1000);
    }
    const level = Math.max(...items.map((x) => x.alert.level));
    const test = items.every((x) => x.alert.test) ? '[TEST] ' : '';
    const lines = items.slice(0, 6).map(({ alert: a }) => `${M.alertKind(a).icon} ${M.alertLevelLabel(a)} — ${alertText(a).title}`);
    if (items.length > 6) lines.push(`… et ${items.length - 6} autre(s)`);
    systemNotification(`${test}⚠️ ${items.length} alertes en cours${settings.all ? '' : ' dans vos départements'}`, lines.join('\n'), {
      tag: 'malert-catchup', urgent: level >= 3 || items.some((x) => x.alert.mobileAlert), level,
      sound: items.some((x) => x.alert.mobileAlert) ? 'alerte-mobile' : null,
    });
    if (native) native.alert({ level, front: settings.front });
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
      toast(`Alerte modifiée : ${alertText(alert).title}`, M.departmentsLabel(alert.departments, 3), lv.color, () => {
        focusAlert(alert);
        showOverlay(alert, { silent: true });
      });
    } else if (concernedBefore) {
      toast(`Vos départements ne sont plus concernés : ${alertText(alert).title}`, M.departmentsLabel(alert.departments, 3), '#34d399');
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
        const name = streamer() ? 'votre département' : M.departmentName(code);
        toast(`Vigilance ${v.name.toLowerCase()} — ${name}`, phen, v.color, () => { if (!streamer()) map.focus([code]); });
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

  // Version et empreinte de l'application : envoyées au serveur, qui peut refuser une version trop
  // ancienne ou une application modifiée (réglage de M-Alert-sender).
  let appId = null;
  const appIdReady = M.appIdentity().then((x) => { appId = x; return x; });
  let refusal = null; // { reason, message, minVersion } : application refusée par le serveur

  function subscribeMessage() {
    return JSON.stringify({ type: 'subscribe', role: 'receiver', departments: myDepartments(), all: settings.all, app: appId });
  }

  /** Application refusée par le serveur : écran bloquant (mise à jour nécessaire ou application modifiée). */
  function showRefusal(r) {
    refusal = r;
    let el = document.getElementById('refusal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'refusal';
      el.setAttribute('role', 'alertdialog');
      el.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(8,12,22,.96);color:#fff;font-family:inherit;text-align:center';
      document.body.appendChild(el);
    }
    const update = r.reason === 'version';
    el.innerHTML = `<div style="max-width:520px">
      <div style="font-size:52px;line-height:1">${update ? '⬆️' : '⛔'}</div>
      <h2 style="margin:12px 0 8px">${update ? 'Mise à jour de M-Alert nécessaire' : 'Application refusée par le serveur'}</h2>
      <p style="white-space:pre-line;opacity:.9;line-height:1.45">${escapeHtml(r.message || '')}</p>
      <p style="opacity:.6;font-size:13px">Version de cette application : ${escapeHtml((appId && appId.version) || 'inconnue')}${r.minVersion ? ` · version minimale : ${escapeHtml(r.minVersion)}` : ''}</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px">
        <a class="btn" style="background:#f97316;color:#111;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700" href="https://github.com/malik05051/M-Alert/releases/latest" target="_blank" rel="noopener">Télécharger M-Alert</a>
        <button type="button" class="btn" id="refusalRetry" style="padding:10px 16px;border-radius:10px">Réessayer</button>
      </div></div>`;
    el.querySelector('#refusalRetry').addEventListener('click', () => {
      // Page web : rechargée (dernière version publiée) ; applications : nouvelle tentative.
      if (!native && !(window.MAlertMobile) && /^https?:/.test(location.protocol)) location.reload();
      else { refusal = null; el.remove(); connect(); }
    });
    setStatus('offline', update ? 'Mise à jour nécessaire' : 'Application refusée');
  }

  function connect() {
    clearTimeout(reconnectTimer);
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    const url = M.normalizeServerUrl(settings.serverUrl);
    if (window.MAlertSound.setServer) window.MAlertSound.setServer(url);
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
      const socket0 = ws;
      // Version et empreinte d'abord (le serveur peut attendre ce message avant d'envoyer quoi que ce soit).
      appIdReady.finally(() => { if (socket0.readyState === WebSocket.OPEN) socket0.send(subscribeMessage()); });
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
    ws.onclose = (ev) => {
      // Refusée par le serveur (version trop ancienne, application modifiée) : nouvel essai dans 15 min.
      if (refusal || (ev && ev.code === 4003)) {
        if (!refusal) showRefusal({ reason: ev.reason === 'version' ? 'version' : 'modified', message: ev.reason === 'version' ? 'Cette version de M-Alert n\'est plus acceptée par le serveur : mettez à jour M-Alert.' : 'Cette application M-Alert est refusée par le serveur.' });
        reconnectTimer = setTimeout(connect, 15 * 60000);
        return;
      }
      setStatus('offline', 'Déconnecté — nouvelle tentative…');
      const delay = Math.min(30000, 1000 * 2 ** retry++) + Math.random() * 1000;
      reconnectTimer = setTimeout(connect, delay);
    };
    ws.onerror = () => { /* onclose suit */ };
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'refused':
        showRefusal(msg);
        break;
      case 'sealevel':
        sealevel = msg.sealevel || null;
        if (current && !current.__notice) renderTsunamiBoard(current);
        break;
      case 'alert-i18n': {
        // Traduction arrivée après l'alerte : textes mis à jour, sans nouvelle notification.
        for (const a of alerts) if (a.id === msg.id) a.i18n = msg.i18n;
        for (const a of queue) if (a.id === msg.id) a.i18n = msg.i18n;
        if (current && current.id === msg.id) { current.i18n = msg.i18n; renderOverlayText(current); }
        renderAll();
        break;
      }
      case 'alert-measures': {
        // Mesures affichées ou masquées dans l'alerte (M-Alert-sender) : sans son ni notification.
        for (const list of [alerts, queue]) for (const a of list) if (a.id === msg.id) a.hideMeasures = Boolean(msg.hideMeasures);
        if (current && current.id === msg.id) { current.hideMeasures = Boolean(msg.hideMeasures); renderTsunamiBoard(current); renderRivers(current); }
        renderAll();
        break;
      }
      case 'sound-defaults':
        applySoundDefaults(msg.soundDefaults);
        break;
      case 'vigicrues':
        vigicrues = msg.vigicrues || null;
        vicFull = null; // tracés relus (niveaux changés)
        if (mapView.mode === 'vigicrues') { loadVicFull(); refreshMap(); }
        break;
      case 'rivers':
        rivers = msg.rivers || null;
        if (current && !current.__notice) { renderTsunamiBoard(current); renderRivers(current); }
        break;
      case 'hello': {
        const old = vigilance;
        vigilance = msg.vigilance;
        sealevel = msg.sealevel || null;
        rivers = msg.rivers || null;
        vigicrues = msg.vigicrues || vigicrues;
        webcamsEnabled = Boolean(msg.webcams && msg.webcams.enabled);
        if (msg.soundDefaults) applySoundDefaults(msg.soundDefaults);
        alerts = (msg.alerts || []).filter(M.isActive);
        renderAll();
        checkVigilanceChange(old, vigilance);
        // Alertes envoyées (ou étendues à mon département) pendant que l'application était fermée
        // ou hors ligne. Celles reçues application ouverte sont déjà marquées vues.
        // Plusieurs à la fois : la plus grave affichée, un seul son et une seule notification.
        catchUp(missedAlerts(alerts));
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
          toast(msg.type === 'cancel' ? `Alerte levée : ${alertText(a).title}` : `Fin de l'alerte : ${alertText(a).title}`, M.departmentsLabel(a.departments, 3), '#34d399');
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
        onVigRing(msg.group, { mobileAlert: Boolean(msg.mobileAlert) });
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
          app: await appIdReady,
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
  $('setPhenomena').innerHTML = METEO_PHENOMENA.map(([id, p]) =>
    `<label class="check"><input type="checkbox" value="${id}"> ${p.icon} ${escapeHtml(p.name)}</label>`).join('');

  // Langues, notifications de séisme et seuils des séismes.
  const I18N = window.MAlertI18n;
  const langOptions = (first) => first + Object.entries(I18N.LANGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('setLang').innerHTML = langOptions(`<option value="">${escapeHtml(I18N.t("Langue de l'appareil"))} (${I18N.LANGS[I18N.deviceLang()]})</option>`);
  $('setNotifLang1').innerHTML = langOptions(`<option value="">${escapeHtml(I18N.t("Langue de l'application"))}</option>`);
  $('setNotifLang2').innerHTML = langOptions('<option value="none">Aucune</option><option value="auto">Auto (English / Français)</option>');
  $('setQuakeMag').innerHTML = [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8].map((m) => `<option value="${m}">M${m.toFixed(1)}</option>`).join('');
  $('setQuakeShindo').innerHTML = M.SHINDO_ORDER.filter((x) => x !== '0').map((x) => `<option value="${x}">${x}</option>`).join('');
  function showQuakeFields() {
    const mode = $('setQuakeMode').value;
    document.querySelectorAll('.quake-mag').forEach((el) => el.classList.toggle('hidden', !['magnitude', 'either'].includes(mode)));
    document.querySelectorAll('.quake-shindo').forEach((el) => el.classList.toggle('hidden', !['intensity', 'either'].includes(mode)));
  }
  $('setQuakeMode').addEventListener('change', showQuakeFields);

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
    const mobile = window.MAlertMobile;
    if (mobile && mobile.permission) {
      // iOS : autorisations des notifications, des notifications urgentes et des alertes critiques.
      // (Promise.resolve : une erreur du pont natif n'empêche jamais d'ouvrir les réglages.)
      Promise.resolve().then(() => mobile.permission()).then((p) => {
        const parts = [p.display === 'granted' ? '✅ Notifications autorisées' : p.display === 'denied'
          ? '⛔ Notifications bloquées (Réglages iOS > M-Alert > Notifications)' : 'Notifications non autorisées'];
        el.textContent = parts.map((x) => I18N.t(x)).join(' · ');
        btn.classList.toggle('hidden', p.display === 'granted');
        btn.textContent = p.display === 'denied' ? 'Ouvrir les réglages' : 'Autoriser les notifications';
        btn.dataset.mode = p.display === 'denied' ? 'settings' : 'ask';
      }).catch(() => { el.textContent = ''; });
      return;
    }
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
    const mobile = window.MAlertMobile;
    if (mobile && mobile.permission) {
      if ($('btnNotif').dataset.mode === 'settings') mobile.openSettings();
      else await mobile.requestPermission().catch(() => {});
      updateNotifState();
      return;
    }
    await Notification.requestPermission();
    updateNotifState();
  });

  /** Liste des fuseaux : automatique (appareil), France et outre-mer, puis tous les autres. */
  function fillTimeZones() {
    const sel = $('setTimeZone');
    if (sel.options.length) return;
    const dev = M.deviceTimeZone();
    const main = M.TIME_ZONES.map(([id]) => id);
    const opt = (id, label) => `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`;
    sel.innerHTML = opt('', `Automatique : celui de l'appareil (${M.timeZoneLabel(dev)})`)
      + `<optgroup label="France">${M.TIME_ZONES.map(([id, label]) => opt(id, label)).join('')}</optgroup>`
      + `<optgroup label="Tous les fuseaux">${M.allTimeZones().filter((id) => !main.includes(id)).map((id) => opt(id, id.replace(/_/g, ' '))).join('')}</optgroup>`;
  }

  // ---------- Sauvegarde des réglages (code à copier, puis à importer) ----------

  const BACKUP_PREFIX = 'MALERT1:';
  function backupState(text, ok = true) {
    $('setBackupState').textContent = text;
    $('setBackupState').style.color = ok ? 'var(--ok)' : 'var(--err)';
  }
  $('btnExport').addEventListener('click', async () => {
    const data = { settings, timezone: M.chosenTimeZone() || '' };
    const code = BACKUP_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    const box = $('setBackupCode');
    box.value = code;
    box.readOnly = true;
    box.classList.remove('hidden');
    box.select();
    try {
      await navigator.clipboard.writeText(code);
      backupState('Code copié : gardez-le (notes, message à vous-même) et collez-le dans « Importer » après la réinstallation.');
    } catch (_) {
      backupState('Copiez ce code (sélectionné) et gardez-le : collez-le dans « Importer » après la réinstallation.');
    }
  });
  $('btnImport').addEventListener('click', () => {
    const box = $('setBackupCode');
    if (box.classList.contains('hidden') || box.readOnly) {
      box.value = '';
      box.readOnly = false;
      box.placeholder = 'Collez ici le code exporté (MALERT1:…), puis touchez à nouveau « Importer des réglages ».';
      box.classList.remove('hidden');
      box.focus();
      backupState('');
      return;
    }
    try {
      const raw = box.value.trim();
      if (!raw.startsWith(BACKUP_PREFIX)) throw new Error('code');
      const data = JSON.parse(decodeURIComponent(escape(atob(raw.slice(BACKUP_PREFIX.length)))));
      if (!data || typeof data.settings !== 'object') throw new Error('code');
      settings = { ...DEFAULTS, ...data.settings };
      saveSettings();
      if (typeof data.timezone === 'string') M.setTimeZone(data.timezone);
      backupState('Réglages importés : l\'application redémarre…');
      setTimeout(() => location.reload(), 800);
    } catch (_) {
      backupState('Code invalide : collez le code complet, qui commence par MALERT1:', false);
    }
  });

  async function openSettings({ welcome = false } = {}) {
    fillTimeZones();
    $('setTimeZone').value = M.chosenTimeZone();
    $('settingsTitle').textContent = welcome ? 'Bienvenue sur M-Alert' : 'Réglages';
    $('welcomeText').classList.toggle('hidden', !welcome);
    $('settingsClose').classList.toggle('hidden', welcome);
    $('setDep').value = settings.department || '';
    $('setExtra').querySelectorAll('input').forEach((i) => { i.checked = settings.extra.includes(i.value); });
    $('extraFilter').value = '';
    $('setExtra').querySelectorAll('label').forEach((l) => l.classList.remove('hidden'));
    $('setAll').checked = settings.all;
    $('setMinLevel').value = String(settings.minLevel);
    $('setQuakeMode').value = settings.quakeMode || 'level';
    $('setQuakeMag').value = String(Number(settings.quakeMag || 4));
    $('setQuakeShindo').value = String(settings.quakeShindo || '3');
    showQuakeFields();
    $('setLang').value = settings.lang || '';
    $('setTranslate').checked = settings.translateAlerts !== false;
    $('setNotifLang1').value = settings.notifLang1 || '';
    $('setNotifLang2').value = settings.notifLang2 || 'auto';
    $('setTimeSensitive').checked = settings.timeSensitive !== false;
    document.querySelectorAll('.ios-only').forEach((el) => el.classList.toggle('hidden', !(window.MAlertMobile && window.MAlertMobile.platform === 'ios')));
    $('setCategories').querySelectorAll('input').forEach((i) => { i.checked = !settings.categoriesOff.includes(i.value); });
    $('setPhenomena').querySelectorAll('input').forEach((i) => { i.checked = !(settings.phenomenaOff || []).includes(Number(i.value)); });
    $('setSound').checked = settings.sound;
    $('setVolume').value = String(settings.volume);
    fillSoundRows(settings.sounds);
    $('setRepeat').checked = settings.repeat;
    // Application mobile Android : réception en arrière-plan par le service natif.
    document.querySelectorAll('.mobile-bg').forEach((el) => el.classList.toggle('hidden', !(window.MAlertMobile && window.MAlertMobile.background)));
    $('setMobileBg').checked = settings.mobileBackground !== false;
    // iOS : état de la réception en arrière-plan (connexion, autorisation de localisation).
    $('mobileBgState').textContent = '';
    if (window.MAlertMobile && window.MAlertMobile.status) {
      Promise.resolve().then(() => window.MAlertMobile.status()).then((st) => {
        const loc = {
          always: '✅ Localisation : Toujours',
          whenInUse: '⚠️ Localisation : « Lorsque l\'app est active » ; choisissez « Toujours » (Réglages iOS > M-Alert > Position) pour ne pas être arrêté',
          denied: '⛔ Localisation refusée : la réception s\'arrête quand l\'application est quittée (Réglages iOS > M-Alert > Position > Toujours)',
          notDetermined: '',
        }[st.location] || '';
        const conn = !st.running ? '' : st.connected ? '✅ Connecté en arrière-plan' : '⏳ Connexion en arrière-plan…';
        $('mobileBgState').textContent = [conn, loc].filter(Boolean).map((x) => I18N.t(x)).join(' · ');
      }).catch(() => {});
    }
    $('setMaxSound').value = String(settings.maxSound ?? 120);
    $('setFadeIn').checked = Boolean(settings.fadeIn);
    $('setVibrate').checked = settings.vibrate !== false;
    $('setInfoSound').checked = settings.infoSound !== false;
    $('setQuiet').checked = Boolean(settings.quiet);
    $('setQuietFrom').value = settings.quietFrom || '22:00';
    $('setQuietTo').value = settings.quietTo || '07:00';
    $('setQuietMin').value = String(settings.quietMin || 4);
    $('setVigNotify').checked = settings.vigNotify;
    $('setFront').checked = settings.front;
    $('setPush').checked = settings.push;
    $('setNotices').checked = settings.notices !== false;
    $('setTiles').checked = settings.tiles;
    $('setStreamer').checked = streamer();
    $('setGeoloc').checked = Boolean(settings.geoloc);
    $('setIntensity').checked = settings.intensityMap !== false;
    $('setVigList').checked = settings.vigInList !== false;
    $('setServer').value = settings.serverUrl;
    document.querySelectorAll('.native-only').forEach((el) => el.classList.toggle('hidden', !native));
    // Application mobile : mises à jour (recherche dans les Releases GitHub).
    if (mobileUpdates) {
      document.querySelector('.update-box').classList.remove('hidden');
      $('setAutoUpdate').checked = settings.mobileAutoUpdate !== false;
      if (!lastUpdate) renderUpdate({ current: mobileApp.version, mode: mobileApp.platform, state: 'idle' });
    }
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
      quakeMode: $('setQuakeMode').value,
      quakeMag: Number($('setQuakeMag').value),
      quakeShindo: $('setQuakeShindo').value,
      lang: $('setLang').value,
      translateAlerts: $('setTranslate').checked,
      notifLang1: $('setNotifLang1').value,
      notifLang2: $('setNotifLang2').value,
      timeSensitive: $('setTimeSensitive').checked,
      mobileAutoUpdate: window.MAlertMobile && !native ? $('setAutoUpdate').checked : settings.mobileAutoUpdate,
      categoriesOff: [...$('setCategories').querySelectorAll('input:not(:checked)')].map((i) => i.value),
      phenomenaOff: [...$('setPhenomena').querySelectorAll('input:not(:checked)')].map((i) => Number(i.value)),
      sound: $('setSound').checked,
      volume: Number($('setVolume').value),
      sounds: readSoundRows(),
      repeat: $('setRepeat').checked,
      mobileBackground: $('setMobileBg').checked,
      maxSound: Number($('setMaxSound').value),
      fadeIn: $('setFadeIn').checked,
      vibrate: $('setVibrate').checked,
      infoSound: $('setInfoSound').checked,
      quiet: $('setQuiet').checked,
      quietFrom: $('setQuietFrom').value || '22:00',
      quietTo: $('setQuietTo').value || '07:00',
      quietMin: Number($('setQuietMin').value),
      vigNotify: $('setVigNotify').checked,
      front: $('setFront').checked,
      push: $('setPush').checked,
      notices: $('setNotices').checked,
      tiles: $('setTiles').checked,
      streamer: $('setStreamer').checked,
      geoloc: $('setGeoloc').checked,
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
    if (settings.geoloc) startGeo(); else stopGeo();
    const tzChanged = M.chosenTimeZone() !== $('setTimeZone').value;
    M.setTimeZone($('setTimeZone').value);
    if (tzChanged) renderAll(); // heures affichées dans le nouveau fuseau
    const wasWelcome = Boolean(dlg.dataset.welcome);
    dlg.close();
    // Nouvelle langue : la page est rechargée pour être traduite entièrement.
    if ((settings.lang || I18N.deviceLang()) !== I18N.lang) {
      location.reload();
      return;
    }
    if (wasWelcome && window.MAlertMobile && window.MAlertMobile.requestPermission) {
      window.MAlertMobile.requestPermission().catch(() => {});
    } else if (wasWelcome && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(updateNotifState);
    }
    onSettingsChanged(oldServer !== settings.serverUrl);
    if (wasWelcome && !streamer()) map.focus(myDepartments());
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
    systemNotification('[TEST] Alerte M-Alert', test.description, { tag: test.id, level });
    if (native) native.alert({ level, front: false });
  });

  function onSettingsChanged(serverChanged) {
    document.documentElement.classList.toggle('streamer', streamer());
    if (!streamer() && settings.department) map.focus(myDepartments());
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
  // « Plus tard » : vaut pour cette version (et pour cette version remplacée).
  const updateKey = (s) => (s ? (s.replaced ? `${s.version}+remplacée` : s.version) : null);

  function renderUpdate(s) {
    if (!s) return;
    lastUpdate = s;
    $('updVersion').textContent = `version ${s.current}`;
    const auto = s.mode === 'auto';
    $('updAutoRow').classList.toggle('hidden', s.mode === 'pacman' || s.mode === 'dev');
    // Installation automatique : seulement l'installateur Windows et l'AppImage (mode « auto ») ;
    // ailleurs (mobile, portable, .deb), la recherche seule.
    $('updAutoInstall').classList.toggle('hidden', s.mode !== 'auto');
    $('updAutoCheck').classList.toggle('hidden', s.mode === 'auto');
    if (s.mode === 'android' || s.mode === 'ios') $('btnUpdCheck').disabled = s.state === 'checking';
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
      available: s.mode === 'android'
        ? `${s.replaced ? `La version ${s.version} a été remplacée par une version corrigée` : `La version ${s.version} est disponible`} : téléchargez le fichier .apk et installez-le par-dessus (vos réglages sont conservés).`
        : s.mode === 'ios'
          ? `${s.replaced ? `La version ${s.version} a été remplacée par une version corrigée` : `La version ${s.version} est disponible`} : téléchargez le fichier .ipa et réinstallez-le avec AltStore ou Sideloadly.`
          : s.replaced
            ? `La version ${s.version} a été remplacée par une version corrigée (à télécharger et installer).`
            : `La version ${s.version} est disponible${auto ? '' : ' (à télécharger et installer)'}.`,
      error: `Impossible de vérifier les mises à jour : ${s.error || 'erreur inconnue'}`,
    }[s.state] || '';
    $('updState').textContent = text;

    const showBar = (s.state === 'ready' || s.state === 'available') && dismissedUpdate !== updateKey(s);
    $('updateBar').classList.toggle('hidden', !showBar);
    if (showBar) {
      $('updateBarText').textContent = s.state === 'ready'
        ? `🔄 La mise à jour ${s.version} de M-Alert est prête.`
        : s.replaced ? `🔔 La version ${s.version} de M-Alert a été remplacée par une version corrigée.`
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
      dismissedUpdate = updateKey(lastUpdate);
      $('updateBar').classList.add('hidden');
    });
    // Retour de veille : on se reconnecte tout de suite pour ne rater aucune alerte.
    native.onResume(() => {
      retry = 0;
      connect();
    });
  }

  // ---------- Application mobile : mises à jour ----------
  // Nouvelle version cherchée dans les Releases GitHub de M-Alert (au démarrage, puis toutes les
  // 6 heures si « automatiquement » est coché). Android : téléchargement du nouvel .apk, à installer
  // par-dessus (réglages conservés). iOS : page de la version, avec l'.ipa à réinstaller par AltStore
  // ou Sideloadly.
  const mobileApp = window.MAlertMobile;
  const mobileUpdates = Boolean(!native && mobileApp && mobileApp.openUrl && /^\d+\.\d+/.test(mobileApp.version || ''));
  const RELEASES = 'https://api.github.com/repos/malik05051/M-Alert/releases/latest';
  const newer = (a, b) => {
    const x = String(a).replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
    const y = String(b).replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    return false;
  };
  let mobileRelease = null;

  async function checkMobileUpdate() {
    renderUpdate({ current: mobileApp.version, mode: mobileApp.platform, state: 'checking' });
    try {
      const r = await fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const rel = await r.json();
      const version = String(rel.tag_name || '').replace(/^v/, '');
      const ext = mobileApp.platform === 'android' ? '.apk' : '.ipa';
      const asset = (rel.assets || []).find((a) => a.name.toLowerCase().endsWith(ext));
      // Version remplacée : même numéro, Release reconstruite depuis un autre commit.
      const sha = (x) => /^[0-9a-f]{40}$/.test(String(x || ''));
      const replaced = version === mobileApp.version && sha(mobileApp.build) && sha(rel.target_commitish) && rel.target_commitish !== mobileApp.build;
      if (!version || !(newer(version, mobileApp.version) || replaced) || !asset) {
        mobileRelease = null;
        renderUpdate({ current: mobileApp.version, mode: mobileApp.platform, state: 'none' });
        return;
      }
      mobileRelease = { version, url: mobileApp.platform === 'android' ? asset.browser_download_url : rel.html_url };
      renderUpdate({ current: mobileApp.version, mode: mobileApp.platform, state: 'available', version, replaced });
    } catch (err) {
      renderUpdate({ current: mobileApp.version, mode: mobileApp.platform, state: 'error', error: err.message });
    }
  }

  if (mobileUpdates) {
    $('btnUpdCheck').addEventListener('click', checkMobileUpdate);
    $('updateBarAction').addEventListener('click', () => {
      if (mobileRelease) mobileApp.openUrl(mobileRelease.url).catch(() => {});
      $('updateBar').classList.add('hidden');
    });
    $('updateBarLater').addEventListener('click', () => {
      dismissedUpdate = updateKey(lastUpdate);
      $('updateBar').classList.add('hidden');
    });
    const auto = () => { if (settings.mobileAutoUpdate !== false) checkMobileUpdate(); };
    setTimeout(auto, 8000);
    setInterval(auto, 6 * 3600000);
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
  startGeo();
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
  else if (!streamer()) setTimeout(() => map.focus(myDepartments()), 300);
})();
