/* M-Alert — incrustation OBS (source navigateur) : bandeau d'alerte façon NHK et carte des
 * tsunamis aux côtes clignotantes, en temps réel depuis le serveur M-Alert.
 *
 * Paramètres de l'adresse (tous facultatifs) :
 *   server=https://…      serveur M-Alert (par défaut : celui de config.js)
 *   types=seisme,tsunami,meteo,…   catégories montrées (par défaut : toutes)
 *   deps=29,56            départements suivis (par défaut : tous)
 *   min=2                 niveau minimum (1 : information … 5 : majeur)
 *   hold=90               secondes d'affichage du bandeau après l'alerte (0 : tant qu'elle dure)
 *   sound=1               joue le son de l'alerte (« Contrôler l'audio via OBS » dans OBS)
 *   tests=0               ignore les alertes de test
 *   pos=top               bandeau en haut (par défaut : en bas) ; width=66 : largeur (% de l'écran)
 *   tsunami=0             pas de carte plein écran pour les tsunamis
 *   infos=0               pas de carte « Information(s) M-Alert » (alerte annulée, notification)
 *   demo=seisme|tsunami|vent   aperçu sans serveur ; debug=1 : état de la connexion
 */
(function () {
  'use strict';

  const M = window.MAlert;
  const B = window.MAlertBanner;
  const q = new URLSearchParams(location.search);
  const server = M.normalizeServerUrl(q.get('server') || (window.MALERT_CONFIG || {}).serverUrl || '');
  const types = (q.get('types') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const deps = (q.get('deps') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const minLevel = Number(q.get('min') || 1);
  const hold = q.has('hold') ? Number(q.get('hold')) : 90;
  const sound = q.get('sound') === '1';
  const tests = q.get('tests') !== '0';
  const tsunamiMap = q.get('tsunami') !== '0';
  const infos = q.get('infos') !== '0';
  if (q.get('width')) document.documentElement.style.setProperty('--bw', `${Number(q.get('width'))}vw`);
  if (q.get('debug') === '1') document.body.classList.add('debug');

  const $ = (id) => document.getElementById(id);
  let alerts = [];
  let shownId = null;
  let shownAt = 0;
  let blink = true;
  let drawnKey = '';
  let infoUntil = 0;

  /** Carte « Information(s) M-Alert » : alerte annulée ou notification, pendant « hold » secondes. */
  function showInfo(info) {
    if (!infos) return;
    B.drawInfo($('info'), info, { width: 670, height: 330 });
    infoUntil = Date.now() + (hold || 60) * 1000;
    document.body.classList.add('show-info');
  }

  const status = (t) => { $('status').textContent = t; };

  function wanted(a) {
    if (!M.isActive(a) || a.pending || a.silent) return false;
    if (a.test && !tests) return false;
    if (types.length && !types.includes(a.category || 'meteo')) return false;
    if (Number(a.level) < minLevel) return false;
    if (deps.length && !a.departments.includes('ALL') && !a.departments.some((d) => deps.includes(d))) return false;
    return true;
  }

  /** Alerte du bandeau : la dernière reçue (ou mise à jour) parmi celles qui doivent l'être. */
  function current() {
    const list = alerts.filter(wanted).sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
    return list[0] || null;
  }

  function render() {
    const a = current();
    const tsu = alerts.filter(wanted).find((x) => x.category === 'tsunami');
    if (a && a.id !== shownId) { shownId = a.id; shownAt = Date.now(); }
    // Carte des tsunamis à l'écran : elle remplace le bandeau du tsunami (légende comprise) ; le
    // bandeau d'une autre alerte (le séisme) passe en haut.
    const mapOn = Boolean(tsu && tsunamiMap);
    const bannerOn = a && (hold === 0 || Date.now() - shownAt < hold * 1000) && !(mapOn && a.category === 'tsunami');
    document.body.classList.toggle('top', q.get('pos') === 'top' || mapOn);
    document.body.classList.toggle('show-banner', Boolean(bannerOn));
    // Bandeau redessiné seulement quand l'alerte change (le clignotement ne concerne que la carte).
    const key = a ? `${a.id}:${a.revision || 0}` : '';
    if (bannerOn && key !== drawnKey) { B.drawBanner($('banner'), a, { width: 1600, height: 450 }); drawnKey = key; }
    document.body.classList.toggle('show-tsunami', Boolean(tsu && tsunamiMap));
    if (tsu && tsunamiMap) B.drawTsunamiMap($('tsunami'), tsu, blink);
  }

  function arrived(a) {
    if (!wanted(a)) return;
    shownId = a.id;
    shownAt = Date.now();
    if (sound && window.MAlertSound) window.MAlertSound.play(a, { volume: 1, loop: false }).catch(() => {});
  }

  function handle(msg) {
    switch (msg.type) {
      case 'hello':
        alerts = (msg.alerts || []).filter(M.isActive);
        break;
      case 'alert':
      case 'ring':
        alerts = alerts.filter((x) => x.id !== msg.alert.id).concat(msg.alert);
        arrived(msg.alert);
        break;
      case 'update':
        alerts = alerts.filter((x) => x.id !== msg.alert.id);
        if (M.isActive(msg.alert)) alerts.push(msg.alert);
        if (msg.alert.id === shownId) shownAt = Date.now();
        break;
      case 'cancel':
      case 'expire':
        alerts = alerts.filter((x) => x.id !== msg.alert.id);
        // Fausse alerte : annonce de l'annulation (si l'alerte était de celles montrées ici).
        if (msg.type === 'cancel' && msg.alert.voided && wanted({ ...msg.alert, expiresAt: new Date(Date.now() + 60000).toISOString(), cancelledAt: null })) {
          showInfo(B.cancelledInfo(msg.alert));
        }
        break;
      case 'notice':
        if (msg.notice && (!deps.length || (msg.notice.departments || []).some((d) => d === 'ALL' || deps.includes(d)))) {
          showInfo({ title: msg.notice.title, body: msg.notice.body });
        }
        break;
      default:
    }
    render();
  }

  let retry = 0;
  function connect() {
    if (!server) { status('Pas de serveur (paramètre server=…)'); return; }
    const ws = new WebSocket(M.toWsUrl(server));
    ws.onopen = () => { retry = 0; status(`Connecté à ${server}`); };
    ws.onmessage = (ev) => { try { handle(JSON.parse(ev.data)); } catch (_) { /* message illisible */ } };
    ws.onclose = () => { status('Déconnecté — nouvelle tentative…'); setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++)); };
  }

  // Aperçu sans serveur.
  const DEMOS = {
    seisme: { id: 'demo', category: 'seisme', level: 5, departments: ['06', '83', '04', '05'], epicenter: { lat: 43.85, lon: 7.25 }, magnitude: 6.4 },
    tsunami: { id: 'demo', category: 'tsunami', level: 4, departments: ['06', '83', '13', '2B', '2A'], epicenter: { lat: 43.2, lon: 7.8 }, tsunamiTable: [{ department: '06', level: 4 }, { department: '83', level: 4 }, { department: '2B', level: 4 }, { department: '13', level: 2 }, { department: '2A', level: 2 }] },
    vent: { id: 'demo', category: 'meteo', phenomenon: 1, level: 3, departments: ['29', '22', '56', '35', '50'] },
  };
  if (q.get('demo') === 'annulation') showInfo(B.cancelledInfo({ title: 'Séisme de magnitude 5.2 — Alpes-Maritimes' }));
  if (q.get('demo') === 'info') showInfo({ title: 'Exercice M-Alert', body: 'Un exercice d\'alerte aura lieu demain à 10 h. Aucune action n\'est demandée.' });
  const demo = q.get('demo');
  if (demo) {
    if (!DEMOS[demo]) return; // aperçu d'une carte d'information (ci-dessus) : pas de serveur
    const a = { ...DEMOS[demo], createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600e3).toISOString() };
    alerts = [a];
    arrived(a);
  } else connect();

  // Côtes du tsunami : clignotement ; bandeau : masqué après « hold » secondes.
  setInterval(() => {
    blink = !blink;
    if (infoUntil && Date.now() > infoUntil) { infoUntil = 0; document.body.classList.remove('show-info'); }
    render();
  }, 700);
})();
