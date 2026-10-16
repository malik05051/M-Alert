/* M-Alert — carte interactive des départements (Leaflet), partagée par M-alert et M-Alert-sender. */
(function () {
  'use strict';

  const M = window.MAlert;
  const { VIGILANCE, LEVELS } = M;
  const FRANCE_BOUNDS = [[41.3, -5.2], [51.1, 9.6]];

  function create(elementId, options = {}) {
    const map = L.map(elementId, {
      zoomControl: true,
      attributionControl: true,
      minZoom: 4,
      maxZoom: 11,
      zoomSnap: 0.25,
      preferCanvas: false,
    });
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution('Contours © IGN · Vigilance © Météo-France');
    map.fitBounds(FRANCE_BOUNDS);

    // Limite de dézoom : la France entière remplit la carte, on ne peut pas dézoomer au-delà
    // (recalculée quand la carte change de taille). On ne peut pas non plus trop s'en éloigner.
    map.setMaxBounds(L.latLngBounds(FRANCE_BOUNDS).pad(0.25));
    function updateMinZoom() {
      const size = map.getSize();
      if (!size.x || !size.y) return; // carte encore cachée
      // getBoundsZoom est borné par le zoom minimum actuel : on le relâche avant le calcul,
      // sinon il ne pourrait jamais redescendre quand la fenêtre rétrécit.
      map.options.minZoom = 0;
      map.setMinZoom(map.getBoundsZoom(FRANCE_BOUNDS));
    }
    updateMinZoom();

    let tiles = null;
    const state = {
      vigilance: {},      // code -> { level, phenomena }
      alertLevels: {},    // code -> niveau d'alerte M-Alert le plus élevé
      highlighted: new Set(),
      selected: new Set(),
    };
    const layers = {};    // code -> layer
    const blinking = new Map(); // départements ajoutés qui clignotent : code -> fin (ms)
    const blinkPhaseOff = () => Math.floor(Date.now() / 500) % 2 === 1;
    const reducedMotion = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    function styleFor(code) {
      const vig = state.vigilance[code];
      const level = vig ? vig.level : 0;
      const style = {
        fillColor: VIGILANCE[level] ? VIGILANCE[level].color : VIGILANCE[0].color,
        fillOpacity: tiles ? 0.55 : 0.85,
        color: '#0b1220',
        weight: 1.1,
        opacity: 1,
        dashArray: null,
      };
      // Vos départements : contour blanc en pointillés.
      if (state.highlighted.has(code)) {
        style.color = '#ffffff';
        style.weight = 2;
        style.dashArray = '5 4';
      }
      // Alerte M-Alert en cours : tout le département prend la couleur du niveau d'alerte, avec la
      // même luminosité et la même frontière noire que les autres départements.
      const alertLevel = state.alertLevels[code];
      // Département ajouté à l'alerte : phase « éteinte » du clignotement, couleur habituelle.
      const blinkOff = blinking.has(code) && blinkPhaseOff();
      if (alertLevel && !blinkOff) {
        style.fillColor = LEVELS[alertLevel].color;
        style.color = '#0b1220';
        style.weight = 1.1;
        style.dashArray = null;
      }
      if (state.selected.has(code)) {
        style.color = '#22d3ee';
        style.weight = 3;
        style.dashArray = '6 4';
        style.fillOpacity = Math.min(1, style.fillOpacity + 0.1);
      }
      return style;
    }

    // Le style n'est réappliqué que s'il a changé : chaque setStyle redessine la carte.
    function refreshLayer(code) {
      const layer = layers[code];
      if (!layer) return;
      const style = styleFor(code);
      const key = JSON.stringify(style);
      if (layer._malertStyle === key) return;
      layer._malertStyle = key;
      layer.setStyle(style);
      // Les contours importants passent au premier plan pour rester visibles.
      if (state.alertLevels[code] || state.selected.has(code) || state.highlighted.has(code)) layer.bringToFront();
    }

    function refreshAll() {
      Object.keys(layers).forEach(refreshLayer);
    }

    const geo = L.geoJSON(window.MALERT_DEPARTMENTS, {
      style: (f) => styleFor(f.properties.code),
      onEachFeature: (feature, layer) => {
        const code = feature.properties.code;
        layers[code] = layer;
        layer.bindTooltip(() => (options.tooltip ? options.tooltip(code, feature.properties.nom) : feature.properties.nom), {
          sticky: true,
          direction: 'top',
          className: 'dep-tooltip',
          offset: [0, -8],
        });
        layer.on('mouseover', () => {
          layer._malertStyle = null;
          layer.setStyle({ weight: Math.max(2.5, styleFor(code).weight), color: '#ffffff' });
        });
        layer.on('mouseout', () => refreshLayer(code));
        layer.on('click', (e) => {
          if (options.onDepartmentClick) options.onDepartmentClick(code, feature.properties.nom, e);
        });
      },
    }).addTo(map);

    // Leaflet recalcule mal la taille si le conteneur change (panneaux, mobile).
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      updateMinZoom();
    });
    ro.observe(document.getElementById(elementId));

    // Alertes tsunami et vagues-submersion : trait épais de la couleur du niveau le long des côtes touchées (comme
    // JQuake), au-dessus de tout le reste, qui clignote (2 s allumé, 0,75 s éteint : classe coast-blink).
    // Les départements sans côte ne sont pas tracés.
    const tsunamiPane = map.createPane('tsunami');
    tsunamiPane.style.zIndex = 470;
    tsunamiPane.style.pointerEvents = 'none';
    tsunamiPane.classList.add('coast-blink');
    const tsunamiRenderer = L.svg({ pane: 'tsunami', padding: 0.5 });
    const tsunamiGroup = L.layerGroup().addTo(map);
    let tsunamiKey = '';

    function renderTsunami(levels) {
      const coasts = window.MALERT_COASTS || {};
      const codes = Object.keys(levels).filter((c) => coasts[c]).sort((a, b) => levels[a] - levels[b]);
      const key = codes.map((c) => `${c}:${levels[c]}`).join(',');
      if (key === tsunamiKey) return;
      tsunamiKey = key;
      tsunamiGroup.clearLayers();
      // Liseré sombre sous les traits (comme JQuake), pour qu'ils ressortent sur la carte.
      for (const c of codes) {
        tsunamiGroup.addLayer(L.polyline(coasts[c], {
          renderer: tsunamiRenderer, interactive: false, color: '#05070d', weight: 8, opacity: 0.9, lineCap: 'round', lineJoin: 'round',
        }));
      }
      for (const c of codes) { // niveaux croissants : le plus grave est tracé par-dessus
        tsunamiGroup.addLayer(L.polyline(coasts[c], {
          renderer: tsunamiRenderer, interactive: false, color: LEVELS[levels[c]].color, weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round',
        }));
      }
    }

    // Départements ajoutés à une alerte déjà en cours : ils clignotent 5 s (0,5 s couleur de
    // l'alerte, 0,5 s couleur habituelle), tous ensemble sur la même horloge, comme les alertes
    // précoces japonaises ; les autres restent fixes.
    const knownDeps = new Map(); // id d'alerte -> départements déjà affichés
    const blinkTimer = { id: null };
    function blinkAdded(alerts) {
      const live = new Set();
      const now = Date.now();
      let added = false;
      for (const a of alerts) {
        live.add(a.id);
        const coastal = a.category === 'tsunami' || ((a.category || 'meteo') === 'meteo' && Number(a.phenomenon) === 9);
        const codes = a.departments.includes('ALL') ? Object.keys(layers) : a.departments;
        const before = knownDeps.get(a.id);
        knownDeps.set(a.id, new Set(codes));
        if (!before || coastal) continue; // nouvelle alerte : pas de clignotement
        for (const code of codes) {
          if (before.has(code) || !layers[code] || reducedMotion()) continue;
          blinking.set(code, 0);
          added = true;
        }
      }
      if (added) {
        // Fin commune, sur une seconde ronde (phase allumée) : tous s'arrêtent ensemble.
        const end = Math.ceil((now + 5000) / 1000) * 1000;
        for (const code of blinking.keys()) blinking.set(code, Math.max(end, blinking.get(code)));
      }
      for (const id of [...knownDeps.keys()]) if (!live.has(id)) knownDeps.delete(id);
      if (added && !blinkTimer.id) blinkTick();
    }
    function blinkTick() {
      const now = Date.now();
      for (const [code, until] of [...blinking]) if (now >= until) blinking.delete(code);
      for (const code of Object.keys(layers)) if (state.alertLevels[code] || blinking.has(code)) refreshLayer(code);
      blinkTimer.id = blinking.size ? setTimeout(blinkTick, 500 - (now % 500) + 5) : null;
    }

    // Stations sismiques (détection dans M-Alert-sender) : points colorés selon le signal, comme
    // GlobalQuake ; dessinés sur un canvas (plusieurs centaines de points mis à jour chaque seconde).
    const stationPane = map.createPane('stations');
    stationPane.style.zIndex = 465;
    stationPane.style.pointerEvents = 'none';
    const stationRenderer = L.canvas({ pane: 'stations', padding: 0.2 });
    const stationGroup = L.layerGroup().addTo(map);
    const stationMarkers = new Map();

    function stationStyle(s) {
      if (!s.live) return { color: '#1e293b', fillColor: '#64748b', fillOpacity: 0.45, weight: 1 };
      if (s.triggered) return { color: '#ffffff', fillColor: '#ef4444', fillOpacity: 1, weight: 1.5 };
      const fill = s.ratio >= 3 ? '#eab308' : s.ratio >= 2 ? '#22c55e' : '#3b82f6';
      return { color: '#0b1220', fillColor: fill, fillOpacity: 0.9, weight: 1 };
    }

    // Épicentres des tremblements de terre : croix de la couleur du niveau (comme JQuake).
    const epicenterPane = map.createPane('epicenter');
    epicenterPane.style.zIndex = 640; // au-dessus des contours, sous les info-bulles (650)
    const epicenterGroup = L.layerGroup().addTo(map);
    let draftMarker = null;

    function crossIcon(level, draft, size = 32) {
      const color = LEVELS[level] ? LEVELS[level].color : '#ffffff';
      const svg = `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true">
        <path d="M6 6 26 26 M26 6 6 26" stroke="#0b1220" stroke-width="11" stroke-linecap="round"/>
        <path d="M6 6 26 26 M26 6 6 26" stroke="#ffffff" stroke-width="7.5" stroke-linecap="round"/>
        <path d="M6 6 26 26 M26 6 6 26" stroke="${color}" stroke-width="4" stroke-linecap="round"${draft ? ' stroke-dasharray="4 3"' : ''}/>
      </svg>`;
      return L.divIcon({ className: 'epicenter-icon', html: svg, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    }

    // Intensités estimées par département pendant un séisme (pastilles carrées comme les cartes
    // d'intensité japonaises), sous la croix de l'épicentre.
    const intensityPane = map.createPane('intensity');
    intensityPane.style.zIndex = 630;
    intensityPane.style.pointerEvents = 'none';
    const intensityGroup = L.layerGroup().addTo(map);
    let intensityKey = '';

    function shindoIcon(shindo) {
      const sh = M.SHINDO[shindo] || M.SHINDO[0];
      const label = String(shindo).replace(/([0-9])([+-])$/, '$1<small>$2</small>');
      return L.divIcon({
        className: 'shindo-pin', iconSize: [22, 22], iconAnchor: [11, 11],
        html: `<span class="shindo-badge" style="background:${sh.color};color:${sh.text}">${label}</span>`,
      });
    }

    // Aperçu des épicentres (séismes EMSC dans M-Alert-sender), indépendant des alertes en cours.
    const previewGroup = L.layerGroup().addTo(map);
    let simMarker = null; // séisme à simuler (onglet 📡 du sender)

    function renderEpicenters(alerts) {
      epicenterGroup.clearLayers();
      for (const a of [...alerts].sort((x, y) => x.level - y.level)) {
        epicenterGroup.addLayer(L.marker([a.epicenter.lat, a.epicenter.lon], {
          icon: crossIcon(a.level), pane: 'epicenter', keyboard: false, title: `Épicentre — ${a.title}${M.quakeSummary(a) ? ` (${M.quakeSummary(a)})` : ''}`,
        }));
      }
    }

    // Point dans un polygone Leaflet (anneaux et multipolygones, règle pair-impair).
    // Ondes sismiques P et S : cercles qui s'élargissent depuis l'épicentre (vitesses moyennes dans
    // la croûte), visibles tant que l'onde S n'a pas parcouru WAVE_MAX_KM.
    const VP = 6.5; // km/s
    const VS = 3.75; // km/s
    const WAVE_MAX_KM = 1500;
    const wavePane = map.createPane('waves');
    wavePane.style.zIndex = 465; // au-dessus du masque hors de France : les ondes passent aussi en mer
    wavePane.style.pointerEvents = 'none';
    const waves = new Map(); // id -> { lat, lon, depth, t0, p, s }
    let waveTimer = null;
    // Une seule surface de dessin (canvas) pour toutes les ondes, réutilisée à chaque révision du
    // séisme : recréer un rendu SVG par révision les accumulait et ralentissait l'application.
    const waveRenderer = L.canvas({ pane: 'waves', padding: 0.1 });
    const appHidden = () => document.hidden || document.documentElement.classList.contains('app-hidden');

    /** Rayon (km) en surface du front d'onde de vitesse v, t secondes après le séisme. */
    function frontKm(v, t, depth) {
      const d = v * t;
      return d > depth ? Math.sqrt(d * d - depth * depth) : 0;
    }

    /** Distance (km) de l'épicentre au coin le plus éloigné de la carte affichée. */
    function farthestVisibleKm(lat, lon) {
      const b = map.getBounds();
      const c = L.latLng(lat, lon);
      return Math.max(...[b.getNorthWest(), b.getNorthEast(), b.getSouthWest(), b.getSouthEast()].map((p) => c.distanceTo(p) / 1000));
    }

    function drawWaves() {
      if (appHidden()) return; // fenêtre cachée : rien à dessiner
      const now = Date.now();
      for (const [id, w] of waves) {
        const t = (now - w.t0) / 1000;
        if (t < 0) continue;
        const sKm = frontKm(VS, t, w.depth);
        // Onde S au-delà de WAVE_MAX_KM ou de toute la carte affichée : plus rien à montrer.
        if (sKm > WAVE_MAX_KM || sKm > farthestVisibleKm(w.lat, w.lon)) {
          w.p.remove();
          w.s.remove();
          waves.delete(id);
          continue;
        }
        const pKm = frontKm(VP, t, w.depth);
        // Onde P sortie de la carte : on ne la redessine plus.
        if (!w.pOut) {
          if (pKm > farthestVisibleKm(w.lat, w.lon)) { w.p.remove(); w.pOut = true; } else w.p.setRadius(Math.max(1, pKm * 1000));
        }
        w.s.setRadius(Math.max(1, sKm * 1000));
      }
      if (!waves.size) {
        clearInterval(waveTimer);
        waveTimer = null;
      }
    }

    /** Ondes des séismes en cours : [{ id, lat, lon, depth, originTime }]. */
    function setWaves(list) {
      const keep = new Set();
      for (const q of list) {
        const t0 = new Date(q.originTime).getTime();
        if (!Number.isFinite(t0) || frontKm(VS, (Date.now() - t0) / 1000, q.depth || 0) > WAVE_MAX_KM) continue;
        keep.add(q.id);
        const old = waves.get(q.id);
        if (old) {
          // Révision du séisme : mêmes cercles, déplacés (pas de nouveau calque).
          if (old.lat !== q.lat || old.lon !== q.lon) { old.p.setLatLng([q.lat, q.lon]); old.s.setLatLng([q.lat, q.lon]); }
          Object.assign(old, { lat: q.lat, lon: q.lon, depth: q.depth || 0, t0 });
          continue;
        }
        waves.set(q.id, {
          lat: q.lat, lon: q.lon, depth: q.depth || 0, t0, pOut: false,
          p: L.circle([q.lat, q.lon], { radius: 1, renderer: waveRenderer, interactive: false, color: '#60a5fa', weight: 2, opacity: 0.9, fill: false }).addTo(map),
          s: L.circle([q.lat, q.lon], { radius: 1, renderer: waveRenderer, interactive: false, color: '#f43f5e', weight: 3, opacity: 0.95, fillColor: '#f43f5e', fillOpacity: 0.08 }).addTo(map),
        });
      }
      for (const [id, w] of waves) {
        if (!keep.has(id)) { w.p.remove(); w.s.remove(); waves.delete(id); }
      }
      drawWaves();
      // 10 images par seconde suffisent pour un front qui avance de quelques km par seconde.
      if (waves.size && !waveTimer) waveTimer = setInterval(drawWaves, 100);
    }

    function containsPoint(latlngs, lat, lon) {
      const rings = [];
      (function collect(arr) {
        if (arr.length && arr[0] instanceof L.LatLng) rings.push(arr);
        else arr.forEach(collect);
      }(latlngs));
      let inside = false;
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[i];
          const b = ring[j];
          if ((a.lat > lat) !== (b.lat > lat) && lon < ((b.lng - a.lng) * (lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
        }
      }
      return inside;
    }

    // Cache hors de France : un polygone de la couleur du fond couvrant le monde entier, percé
    // de chaque département. Placé au-dessus des noms de villes, il masque les autres pays.
    let mask = null;
    function franceMask() {
      if (mask) return mask;
      if (!map.getPane('mask')) {
        const pane = map.createPane('mask');
        pane.style.zIndex = 460;
        pane.style.pointerEvents = 'none';
      }
      const holes = [];
      for (const layer of Object.values(layers)) {
        const latlngs = layer.getLatLngs();
        // Polygon : [contour, trous…] ; MultiPolygon : [[contour, trous…], …]
        const polygons = Array.isArray(latlngs[0][0]) ? latlngs : [latlngs];
        for (const polygon of polygons) holes.push(polygon[0]);
      }
      const world = [[-89, -179.9], [89, -179.9], [89, 179.9], [-89, 179.9]];
      const bg = getComputedStyle(map.getContainer()).backgroundColor || '#0b1220';
      mask = L.polygon([world, ...holes], {
        pane: 'mask', renderer: L.svg({ pane: 'mask' }), interactive: false, stroke: false, fillColor: bg, fillOpacity: 1,
      });
      return mask;
    }

    return {
      leaflet: map,

      setVigilance(departments) {
        state.vigilance = departments || {};
        refreshAll();
      },

      /** Stations sismiques [{ key, lat, lon, ratio, triggered, live }] ; null ou [] pour les retirer. */
      setStations(list) {
        const seen = new Set();
        for (const s of list || []) {
          seen.add(s.key);
          let m = stationMarkers.get(s.key);
          if (!m) {
            m = L.circleMarker([s.lat, s.lon], { renderer: stationRenderer, interactive: false, radius: 3.5 });
            stationGroup.addLayer(m);
            stationMarkers.set(s.key, m);
          }
          m.setStyle(stationStyle(s));
          m.setRadius(s.triggered ? 6 : 3.5);
        }
        for (const [key, m] of stationMarkers) {
          if (seen.has(key)) continue;
          stationGroup.removeLayer(m);
          stationMarkers.delete(key);
        }
      },

      setAlerts(alerts) {
        const levels = {};
        const tsunami = {};
        for (const a of alerts || []) {
          const codes = a.departments.includes('ALL') ? Object.keys(layers) : a.departments;
          // Tsunami et vagues-submersion : la côte est colorée, pas le département.
          const coastal = a.category === 'tsunami' || ((a.category || 'meteo') === 'meteo' && Number(a.phenomenon) === 9);
          const target = coastal ? tsunami : levels;
          // Tsunami avec tableau par côte : chaque côte prend son propre niveau.
          if (a.category === 'tsunami' && Array.isArray(a.tsunamiTable) && a.tsunamiTable.length) {
            for (const r of a.tsunamiTable) target[r.department] = Math.max(target[r.department] || 0, r.level);
            continue;
          }
          for (const c of codes) target[c] = Math.max(target[c] || 0, a.level);
        }
        state.alertLevels = levels;
        blinkAdded(alerts || []);
        refreshAll();
        renderTsunami(tsunami);
        renderEpicenters((alerts || []).filter((a) => a.epicenter));
        setWaves((alerts || []).filter((a) => a.category === 'seisme' && a.epicenter).map((a) => ({
          id: a.id, lat: a.epicenter.lat, lon: a.epicenter.lon, depth: Number(a.depth) || 10, originTime: a.originTime || a.createdAt,
        })));
      },

      /**
       * Arrivée des ondes P et S en un point : { km (distance épicentrale), p, s } en secondes
       * depuis le séisme (estimation à vitesses moyennes).
       */
      waveArrival(epicenter, depth, lat, lon) {
        const km = map.distance([epicenter.lat, epicenter.lon], [lat, lon]) / 1000;
        const hypo = Math.hypot(km, Number(depth) || 10);
        return { km, p: hypo / VP, s: hypo / VS };
      },

      /**
       * Intensités estimées par département [{ code, shindo }] (vide pour les retirer) ; redessinées
       * seulement si elles changent.
       */
      setIntensities(list) {
        const key = (list || []).map((x) => `${x.code}:${x.shindo}`).join(',');
        if (key === intensityKey) return;
        intensityKey = key;
        intensityGroup.clearLayers();
        for (const { code, shindo } of list || []) {
          const layer = layers[code];
          if (!layer) continue;
          intensityGroup.addLayer(L.marker(layer.getBounds().getCenter(), {
            icon: shindoIcon(shindo), pane: 'intensity', keyboard: false, interactive: false,
          }));
        }
      },

      /** Centre (approximatif) d'un département. */
      departmentCenter(code) {
        const layer = layers[code];
        if (!layer) return null;
        const c = layer.getBounds().getCenter();
        return { lat: c.lat, lon: c.lng };
      },

      /** Croix d'épicentre en cours de saisie (sender), ou null pour la retirer. */
      setDraftEpicenter(epicenter, level) {
        if (draftMarker) draftMarker.remove();
        draftMarker = epicenter ? L.marker([epicenter.lat, epicenter.lon], { icon: crossIcon(level, true), pane: 'epicenter', interactive: false, keyboard: false }).addTo(map) : null;
      },

      /**
       * Aperçu d'épicentres : [{ id, lat, lon, level, label }] en croix pointillées ; celui dont
       * l'id vaut selected est agrandi avec son info-bulle ouverte. onClick(id) au clic.
       */
      setPreviewEpicenters(list, { selected, onClick } = {}) {
        previewGroup.clearLayers();
        const sorted = [...(list || [])].sort((a, b) => (a.id === selected) - (b.id === selected) || (a.level || 0) - (b.level || 0));
        for (const q of sorted) {
          const big = q.id === selected;
          const marker = L.marker([q.lat, q.lon], {
            icon: crossIcon(q.level, true, big ? 34 : 22), pane: 'epicenter', keyboard: false, zIndexOffset: big ? 1000 : 0,
          });
          if (q.label) marker.bindTooltip(q.label, { direction: 'top', offset: [0, big ? -16 : -10], permanent: big, className: 'epi-tip' });
          if (onClick) marker.on('click', () => onClick(q.id));
          previewGroup.addLayer(marker);
        }
      },

      /** Croix rouge du séisme à simuler (sender), avec son étiquette ; null pour la retirer. */
      setSimEpicenter(point, label) {
        if (simMarker) simMarker.remove();
        simMarker = null;
        if (!point) return;
        simMarker = L.marker([point.lat, point.lon], { icon: crossIcon(4, false, 34), pane: 'epicenter', interactive: false, keyboard: false, zIndexOffset: 2000 }).addTo(map);
        if (label) simMarker.bindTooltip(label, { direction: 'top', offset: [0, -16], permanent: true, className: 'epi-tip' });
      },

      /** Code du département contenant ce point, ou null (en mer, hors de France). */
      departmentAt(lat, lon) {
        return Object.keys(layers).find((c) => containsPoint(layers[c].getLatLngs(), lat, lon)) || null;
      },

      setHighlighted(codes) {
        state.highlighted = new Set(codes || []);
        refreshAll();
      },

      setSelected(codes) {
        state.selected = new Set(codes || []);
        refreshAll();
      },

      setTiles(enabled) {
        if (enabled && !tiles) {
          // Fond sombre d'Esri (sans clé API ; CARTO exige une clé depuis août 2026). Les noms de
          // villes sont dans une couche à part, posée au-dessus des départements colorés.
          if (!map.getPane('labels')) {
            const pane = map.createPane('labels');
            pane.style.zIndex = 450;
            pane.style.pointerEvents = 'none';
          }
          const esri = (name, opts) => L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${name}/MapServer/tile/{z}/{y}/{x}`, { maxNativeZoom: 16, maxZoom: 19, ...opts });
          tiles = L.layerGroup([
            esri('World_Dark_Gray_Base', { attribution: 'Fond de carte © Esri, HERE, Garmin, © OpenStreetMap' }),
            esri('World_Dark_Gray_Reference', { pane: 'labels' }),
            franceMask(),
          ]).addTo(map);
        } else if (!enabled && tiles) {
          map.removeLayer(tiles);
          tiles = null;
        }
        refreshAll();
      },

      /**
       * Centre la carte sur des départements (et un épicentre éventuel).
       * options.top : hauteur (px) cachée en haut de la carte, par exemple par le bandeau d'alerte.
       */
      focus(codes, { epicenter, top = 0 } = {}) {
        const fly = { duration: 0.8, maxZoom: 8, paddingTopLeft: [20, top + 20], paddingBottomRight: [20, 20] };
        if (!codes || !codes.length || codes.includes('ALL')) {
          map.flyToBounds(FRANCE_BOUNDS, { ...fly, maxZoom: undefined });
          return;
        }
        let bounds = null;
        for (const c of codes) {
          if (!layers[c]) continue;
          bounds = bounds ? bounds.extend(layers[c].getBounds()) : L.latLngBounds(layers[c].getBounds().getSouthWest(), layers[c].getBounds().getNorthEast());
        }
        if (epicenter) bounds = bounds ? bounds.extend([epicenter.lat, epicenter.lon]) : L.latLngBounds([[epicenter.lat, epicenter.lon], [epicenter.lat, epicenter.lon]]);
        if (bounds) map.flyToBounds(bounds.pad(0.25), fly);
      },

      resetView() {
        map.flyToBounds(FRANCE_BOUNDS, { duration: 0.6 });
      },

      codes() {
        return Object.keys(layers);
      },

      invalidate() {
        map.invalidateSize();
        updateMinZoom();
      },

      geo,
    };
  }

  window.MAlertMap = { create };
})();
