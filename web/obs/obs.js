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
 *   reduce=Nom de scène   écran réduit comme la NHK : à l'alerte, OBS passe sur cette scène (fond bleu,
 *                         texte d'informations en haut, la scène en cours réduite) puis revient ;
 *                         la source doit avoir l'accès « avancé » à OBS (script m-alert.lua)
 *   reduceAfter=10        secondes avant l'écran réduit (0 : tout de suite)
 *   cancelHold=30         secondes d'affichage d'une alerte annulée (cadre en bas et texte du haut)
 *   layer=fond            source du fond de l'écran réduit (bleu et texte d'informations)
 *   layer=texte           texte en haut seul (bande bleue), affiché à la main
 *   layer=bandeau         bandeau de l'alerte en cours seul, affiché à la main
 *   stay=quake            écran réduit gardé tant qu'un séisme ou un tsunami est en cours (0 : non ; all : toutes)
 *   cardSeconds=20       missile : secondes d'écran plein « Informations de protection civile », puis bloc en bas
 *   mapSeconds=20        tsunami / vagues-submersion : secondes de carte plein écran, puis mini-carte et tableau
 *   addedSeconds=10       secondes de clignotement des départements ajoutés par une mise à jour
 *   demo=seisme|missile|missiles|ajout|tsunami|submersion|vent|inondation|annulation|info   aperçu sans serveur ; debug=1 : état de la connexion ; level=2|4|5 : niveau de l'aperçu
 */
(function () {
  'use strict';

  const M = window.MAlert;
  const B = window.MAlertBanner;
  const q = new URLSearchParams(location.search);
  const server = M.normalizeServerUrl(q.get('server') || (window.MALERT_CONFIG || {}).serverUrl || '');
  // Sons envoyés depuis M-Alert-sender (.mp3) : lus sur ce serveur.
  if (window.MAlertSound && window.MAlertSound.setServer) window.MAlertSound.setServer(server);
  const types = (q.get('types') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const deps = (q.get('deps') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const minLevel = Number(q.get('min') || 1);
  const hold = q.has('hold') ? Number(q.get('hold')) : 90;
  const sound = q.get('sound') === '1';
  const tests = q.get('tests') !== '0';
  const tsunamiMap = q.get('tsunami') !== '0';
  const infos = q.get('infos') !== '0';
  // Calques à la main (affichés par le script OBS) : texte en haut seul, bandeau seul.
  const textLayer = q.get('layer') === 'texte';
  const bannerLayer = q.get('layer') === 'bandeau';
  const fondLayer = q.get('layer') === 'fond' || textLayer;
  if (textLayer) document.body.classList.add('layer-texte', 'text-off');
  // Texte en haut seul (sans l'écran réduit) : affiché tout seul pendant une alerte (textAuto=1), ou à
  // la main (commande « texte » du script OBS : true affiché, false masqué jusqu'à la prochaine alerte).
  const textAuto = textLayer && q.get('textAuto') === '1';
  let manualText = null;
  let textShown = false;
  const reduceScene = q.get('reduce') || '';
  // Écran réduit quelques secondes après l'arrivée de l'alerte (le bandeau seul d'abord).
  const reduceAfter = q.has('reduceAfter') ? Math.max(0, Number(q.get('reduceAfter')) || 0) : 10;
  if (fondLayer) document.body.classList.add('layer-fond');
  const obsApi = window.obsstudio || null;
  let prevScene = null; // scène d'avant l'écran réduit
  let switching = false;
  const bw = Number(q.get('width'));
  if (bw >= 20 && bw <= 100) document.documentElement.style.setProperty('--bw', `${bw}vw`); // largeur invalide : par défaut
  if (q.get('debug') === '1') document.body.classList.add('debug');

  const $ = (id) => document.getElementById(id);
  let alerts = [];
  let shownId = null;
  let shownAt = 0;
  // Première apparition de l'alerte affichée : départ du délai de l'écran réduit (une mise à jour ou
  // une relance prolonge le bandeau sans refaire la réduction).
  let firstId = null;
  let firstAt = 0;
  const markFirst = (id) => { if (id !== firstId) { firstId = id; firstAt = Date.now(); } };
  let blink = true;
  let drawnKey = '';
  let infoUntil = 0;
  let manualBanner = null; // null : automatique ; true : affiché à la main ; false : masqué à la main
  let manualMap = null; // carte du tsunami / des vagues-submersion : même principe
  // Tsunami / vagues-submersion, comme la NHK : carte plein écran pendant mapSeconds, puis l'image avec
  // la mini-carte en bas à droite et le tableau des mesures en bas à gauche (pages qui défilent).
  const mapSeconds = q.has('mapSeconds') ? Math.max(0, Number(q.get('mapSeconds')) || 0) : 20;
  let coastId = null;
  let coastStart = 0;
  let coastShownAt = 0;
  // À la main (script OBS) : mini-carte, tableau des mesures, panneau « Alerte sismique précoce » à gauche.
  let manualMini = null;
  let manualTable = null;
  // Mesures en plein écran (comme la NHK : « arrivée prévue de la 1re vague, hauteur prévue »),
  // pages de départements qui défilent ; zoom de la mini-carte. Commandés depuis M-Alert-sender.
  let manualBoard = null;
  let miniZoom = null;
  let miniView = null; // vue de la mini-carte déplacée ou zoomée dans M-Alert-sender ({ lat, lon, span })
  let coastPinned = null; // alerte côtière choisie dans M-Alert-sender (id), sinon la plus grave
  let boardCycle = 8; // secondes par page (0 : page fixe, boardPageWanted)
  let boardPageWanted = 0;
  let manualEew = null;
  // Alerte missile (comme la NHK) : écran plein pendant cardSeconds (à chaque mise à jour aussi), puis
  // bloc en bas sur l'image, tant que l'alerte est en cours.
  const cardSeconds = q.has('cardSeconds') ? Math.max(0, Number(q.get('cardSeconds')) || 0) : 20;
  let manualMissile = null;
  let manualCard = null; // écran plein du missile à la main (script OBS) : true affiché, false masqué
  // Séisme, à la main (script OBS) : carte des intensités ('full', 'reduced', 'mini' ou null),
  // « Aucun risque de tsunami » et « Rapport final » en bas à droite.
  let shindoMode = null;
  let shindoKey = '';
  let noTsunamiOn = false; // false, true (« Aucun risque de tsunami ») ou 'sea' (variations du niveau de la mer)
  let finalOn = false;
  // Choisis dans M-Alert-sender : séisme à montrer (sinon celui en cours) et vue de la carte.
  let shindoQuake = null;
  let shindoView = null;
  let epicenterOn = true; // croix de l'épicentre sur la carte des intensités
  let magnitudeOn = true; // magnitude (« M5.7 ») sur la carte des intensités
  // Webcam et bandeau d'évacuation, choisis et placés dans M-Alert-sender.
  let webcamState = null;
  let vig = null; // vigilance Météo-France (cartes et mini-cartes : départements du même phénomène)
  let evacState = null;
  /**
   * État de l'incrustation envoyé par M-Alert-sender (message « obs », et à la connexion). changed :
   * parties modifiées (seules appliquées ; à la connexion, tout).
   */
  function applyObs(o, changed = null) {
    if (!o || fondLayer || bannerLayer) return;
    const part = (k) => !changed || changed.includes(k);
    // Tsunami / vagues-submersion et missile : automatique (null) ou à la main (true / false).
    const tri = (v) => (v === true || v === false ? v : null);
    if (o.coast && part('coast')) {
      manualMap = tri(o.coast.map); manualMini = tri(o.coast.mini); manualTable = tri(o.coast.table); manualBoard = tri(o.coast.board);
      // Tableau des mesures « Afficher (plein écran) » : mesures en plein écran.
      if (o.coast.table === 'full') { manualTable = null; manualBoard = true; }
      miniZoom = o.coast.zoom === 'fit' || [2, 3, 4].includes(Number(o.coast.zoom)) ? o.coast.zoom : null;
      const v = o.coast.view;
      miniView = v && Number.isFinite(v.lat) && Number.isFinite(v.lon) && v.span > 0 ? { lat: v.lat, lon: v.lon, span: v.span } : null;
      coastPinned = typeof o.coast.alert === 'string' && o.coast.alert ? o.coast.alert : null;
      boardCycle = [0, 5, 8, 12].includes(Number(o.coast.cycle)) ? Number(o.coast.cycle) : 8;
      boardPageWanted = Math.max(0, Number(o.coast.page) || 0);
    }
    if (typeof o.gauges === 'boolean' && part('gauges')) { gaugesOn = o.gauges; tableKey = ''; }
    if (o.missile && part('missile')) { manualMissile = tri(o.missile.show); manualCard = tri(o.missile.card); }
    if (o.webcam && part('webcam')) { webcamState = o.webcam; renderWebcam(); }
    if (o.evac && part('evac')) { evacState = o.evac; renderEvac(); }
    if (!part('shindo') && !part('notsunami') && !part('final') && !part('epicenter') && !part('magnitude')) return;
    if (o.shindo && part('shindo')) {
      // « reduced » (ancien choix) : plein écran, qui se réduit avec l'écran.
      shindoMode = o.shindo.mode === 'reduced' ? 'full' : ['full', 'mini'].includes(o.shindo.mode) ? o.shindo.mode : null;
      shindoQuake = o.shindo.quake && o.shindo.quake.epicenter ? { category: 'seisme', ...o.shindo.quake } : null;
      shindoView = o.shindo.view || null;
    }
    if ((typeof o.notsunami === 'boolean' || o.notsunami === 'sea') && part('notsunami')) noTsunamiOn = o.notsunami;
    if (typeof o.final === 'boolean' && part('final')) finalOn = o.final;
    if (typeof o.epicenter === 'boolean' && part('epicenter')) epicenterOn = o.epicenter;
    if (typeof o.magnitude === 'boolean' && part('magnitude')) magnitudeOn = o.magnitude;
  }
  // ---------- Webcam (Windy) : dernière image actualisée, journée en accéléré ou direct ; ou direct YouTube ----------
  let webcamData = null; // { id, preview, day, live, at }
  let webcamTimer = null;
  async function loadWebcam(id) {
    try {
      const r = await fetch(`${server}/api/webcams/${encodeURIComponent(id)}`);
      const j = await r.json();
      if (j && j.webcam && webcamState && webcamState.id === id) { webcamData = { ...j.webcam, credit: j.credit || null, at: Date.now() }; renderWebcam(); }
    } catch (_) { /* nouvel essai au prochain rafraîchissement */ }
  }
  function renderWebcam() {
    const w = webcamState;
    const on = Boolean(w && w.show && w.id && server);
    document.body.classList.toggle('show-webcam', on);
    clearTimeout(webcamTimer);
    if (!on) return;
    const el = $('webcam');
    // Plein écran (choisi dans le sender) : toute l'image, légende par-dessus en bas.
    el.classList.toggle('full', Boolean(w.full));
    el.style.left = w.full ? '' : `${w.x}%`; el.style.top = w.full ? '' : `${w.y}%`; el.style.width = w.full ? '' : `${w.w}vw`;
    el.querySelector('.wc-cap span').textContent = [w.title, w.city].filter(Boolean).join(' · ');
    // Liens des images Windy valables 10 minutes : nouvelle demande toutes les 5 minutes ; caméras
    // Criter (nouvelle image chaque minute) : toutes les minutes.
    if (!webcamData || webcamData.id !== w.id || Date.now() - webcamData.at > (webcamData.refreshMs || 5 * 60000) - 2000) { loadWebcam(w.id); }
    webcamTimer = setTimeout(renderWebcam, 60000);
    if (!webcamData || webcamData.id !== w.id) return;
    const frameUrl = w.mode === 'live' ? webcamData.live || webcamData.day : w.mode === 'day' ? webcamData.day : null;
    el.classList.toggle('frame', Boolean(frameUrl));
    el.classList.toggle('img', !frameUrl);
    const fr = el.querySelector('iframe');
    // Direct YouTube : le lecteur intégré de YouTube demande l'adresse de la page (sinon « erreur 153 »).
    const yt = /^yt:/.test(w.id);
    fr.setAttribute('referrerpolicy', yt ? 'strict-origin-when-cross-origin' : 'no-referrer');
    el.querySelector('.wc-cap span:last-child').textContent = (webcamData.credit && webcamData.credit.text) || (yt ? 'Direct : YouTube' : 'Webcam : Windy.com');
    if (frameUrl && fr.getAttribute('src') !== frameUrl) fr.setAttribute('src', frameUrl);
    if (!frameUrl && fr.getAttribute('src')) fr.removeAttribute('src');
    const img = el.querySelector('img');
    const pic = webcamData.preview || webcamData.daylight;
    if (!frameUrl && pic && img.getAttribute('src') !== pic) img.setAttribute('src', pic);
  }

  // ---------- Bandeau d'évacuation (4 langues, ou les 4 en alternance) ----------
  let evacKey = '';
  let evacRolling = 0; // heure du début du changement de langue en cours (0 : aucun)
  function renderEvac() {
    const e = evacState;
    const on = Boolean(e && e.show);
    document.body.classList.toggle('show-evac', on);
    if (!on) { evacKey = ''; return; }
    const langs = B.EVAC_LANGS;
    const lang = e.lang === 'cycle' ? langs[Math.floor(Date.now() / 4000) % langs.length] : e.lang;
    const el = $('evac');
    // « auto » : message de l'alerte en cours (choisie dans le sender, sinon la dernière) ;
    // « custom » : texte écrit dans le sender, traduit pour les autres langues.
    const shownAlert = (coastPinned && alerts.find((x) => x.id === coastPinned)) || current() || lastAlert;
    const kind = e.kind === 'auto' ? B.evacKindOf(shownAlert) : e.kind;
    const custom = e.kind === 'custom' && e.custom && e.custom.main ? (lang === 'fr' ? e.custom : (e.tr && e.tr[lang]) || e.custom) : null;
    const key = JSON.stringify([kind, lang, e.icon, custom]);
    const inner = $('evacIn');
    // Toujours entier dans l'image : réduit s'il est trop long, gardé loin des bords.
    const place = () => {
      // Case du pictogramme carrée : sa largeur suit sa hauteur (celle du bandeau).
      const ico = inner.querySelector('.evac-ico');
      if (ico && ico.offsetHeight) ico.style.width = `${ico.offsetHeight}px`;
      const f = B.evacPlace(el, window.innerWidth, window.innerHeight, e);
      el.style.left = `${f.left}px`; el.style.top = `${f.top}px`;
      el.style.setProperty('--es', String(f.scale));
    };
    // Changement de langue resté bloqué (source OBS masquée, animation jamais terminée) : on repart à plat.
    if (evacRolling && Date.now() - evacRolling > 1500) stopEvacRoll(inner);
    if (key !== evacKey) {
      const html = B.evacHtml(kind, lang, { icon: e.icon, text: custom });
      const roll = evacKey && e.lang === 'cycle' && inner.animate && !evacRolling;
      evacKey = key;
      if (roll) {
        // Comme la NHK (variante « C » choisie) : le bandeau se referme vers son centre (≈ 0,23 s), un
        // instant à plat, puis le suivant s'ouvre depuis le centre (≈ 0,23 s) ; origine de la
        // transformation au centre (.evac dans index.html). Une seule animation sans « fill » : à la fin
        // (ou si elle est interrompue), le bandeau retrouve toujours sa taille normale. Le texte change
        // quand l'animation elle-même est à plat (son horloge, pas une minuterie à part : dans OBS,
        // l'animation peut démarrer en retard et le texte changeait alors avant l'écrasement).
        evacRolling = Date.now();
        // Rotation autour de l'axe horizontal, vers le haut (le bas du bandeau avance puis passe
        // par-dessus) : la langue actuelle s'en va par le haut, la suivante arrive par le bas, comme
        // un prisme qui tourne. 480 ms, départ et arrivée en douceur ; texte changé quand le bandeau
        // est vu par la tranche (90°).
        const P = 'perspective(1400px) ';
        // Deux temps : la face actuelle part vers le haut (0 → 90°) ; à la fin de ce temps, la
        // traduction est posée, puis seulement la nouvelle face arrive par le bas (−90° → 0) : jamais
        // l'ancienne langue sur la nouvelle face.
        const half = 240;
        let swapped = false;
        const swap = () => { if (!swapped) { swapped = true; inner.innerHTML = html; place(); } };
        const done = () => { swap(); evacRolling = 0; };
        const first = inner.animate([
          { transform: `${P}rotateX(0deg)` },
          { transform: `${P}rotateX(90deg)` },
        ], { duration: half, easing: 'cubic-bezier(.45, 0, .8, .5)', fill: 'forwards' });
        first.oncancel = done;
        first.onfinish = () => {
          swap();
          const second = inner.animate([
            { transform: `${P}rotateX(-90deg)` },
            { transform: `${P}rotateX(0deg)` },
          ], { duration: half, easing: 'cubic-bezier(.2, .5, .55, 1)' });
          // La première (gardée à 90° par « fill ») est retirée : la seconde prend la main.
          first.oncancel = null;
          try { first.cancel(); } catch (_) { /* déjà retirée */ }
          second.onfinish = done;
          second.oncancel = done;
        };
        return;
      }
      inner.innerHTML = html;
    }
    if (!evacRolling) place();
  }
  function stopEvacRoll(inner) {
    if (inner.getAnimations) for (const an of inner.getAnimations()) an.cancel();
    inner.style.transform = '';
    evacRolling = 0;
    evacKey = '';
  }

  let missileId = null;
  // Alerte (de n'importe quel type) montrée avec le style de l'alerte missile, au choix dans le sender.
  let asMissile = null;
  const missileLike = (x) => x.category === 'missile' || x.id === asMissile;
  let missileStart = 0;
  let missileKey = '';
  let missileMapKey = '';
  let missileFitKey = '';
  let missileShown = null; // alertes missile affichées (pour le clignotement de la carte)
  // Panneau à gauche (comme la NHK) : automatique avec l'écran réduit pendant un séisme (eewPanel=0 : jamais).
  const eewAuto = q.get('eewPanel') !== '0';
  // Séisme et tsunami : l'écran réduit (texte en haut, panneau à gauche, tableau) reste tant que l'alerte
  // est en cours ; seul le bandeau du bas part après « hold ». stay=0 : jamais ; stay=all : toutes les alertes.
  const stayParam = q.get('stay') || 'quake';
  // (Missile : jamais d'écran réduit, son affichage occupe déjà l'image.)
  const stays = (x) => Boolean(x) && x.category !== 'missile' && stayParam !== '0' && (stayParam === 'all' || x.category === 'seisme' || x.category === 'tsunami');
  // Départements ajoutés par la dernière mise à jour d'une alerte (clignotants pendant ADDED_MS).
  const ADDED_MS = q.has('addedSeconds') ? Math.max(2, Number(q.get('addedSeconds')) || 10) * 1000 : 10000;
  let addedInfo = null; // { id, revision, codes, until }
  const addedNow = (x) => (x && addedInfo && addedInfo.id === x.id && Date.now() < addedInfo.until ? addedInfo.codes : null);
  const isCoast = (x) => Boolean(x) && (x.category === 'tsunami' || ((x.category || 'meteo') === 'meteo' && [9, 16].includes(Number(x.phenomenon))));
  // Alertes à carte : côtes (tsunami, vagues-submersion, forte houle) et crues (rivières Vigicrues,
  // hauteurs d'eau mesurées).
  const isFlood = (x) => Boolean(B.isFloodMap && B.isFloodMap(x));
  const isMap = (x) => isCoast(x) || isFlood(x);
  // Alerte annulée (fausse alerte) : cadre d'annulation en bas à la place du bandeau, texte du haut
  // « Alerte de … annulée », pendant « hold » secondes (l'écran réduit reste le temps de l'annonce).
  let cancelled = null; // { alert, until }
  const cancelOn = () => Boolean(cancelled && Date.now() < cancelled.until);
  function cancelLines(a) {
    const name = (M.alertKind(a || {}).name || 'alerte').replace(/^./, (c) => c.toLowerCase());
    return [`Alerte de ${name} annulée`, 'Aucun danger n\'est attendu.'];
  }
  // Durée de l'annonce d'annulation (secondes, paramètre cancelHold ; par défaut celle du bandeau).
  const cancelHold = q.has('cancelHold') ? Math.max(3, Number(q.get('cancelHold')) || 30) : (hold || 60);
  function announceCancel(a) {
    cancelled = { alert: a, until: Date.now() + cancelHold * 1000 };
    manualBanner = null;
    document.body.classList.add('cancelling');
    showInfo(B.cancelledInfo(a), cancelHold);
  }

  /**
   * Cadre bleu « L'alerte sismique précoce a été annulée » au milieu de la carte affichée (intensités
   * en plein écran ou en mini, carte des côtes, mini-carte, alerte missile), comme le cadre
   * d'annulation de la NHK : pendant l'annonce d'annulation, sur la carte de l'alerte annulée.
   */
  function voidText(a) {
    if (a.category === 'seisme') return ['L\'alerte sismique précoce a été annulée', 'Aucun danger n\'est attendu.'];
    const label = M.alertLevelLabel(a) || 'Alerte';
    const lower = label.replace(/^./, (c) => c.toLowerCase());
    const fem = /^(alerte|vigilance)/i.test(label);
    const head = /^[aeiouyéèh]/i.test(lower) ? `L'${lower}` : `La ${lower}`;
    const coast = isCoast(a) ? (a.category === 'tsunami' ? 'Vous pouvez reprendre vos activités, en restant prudents près de la mer.' : 'Restez prudents près de la mer.') : 'Aucun danger n\'est attendu.';
    return [`${head} a été ${fem ? 'annulée' : 'annulé'}`, coast];
  }
  function renderVoid(target) {
    const box = $('voidBox');
    if (!target || !target.alert || !target.el) { document.body.classList.remove('show-void'); box.dataset.k = ''; return; }
    const r = target.el.getBoundingClientRect();
    if (!r.width || !r.height) { document.body.classList.remove('show-void'); return; }
    const k = `${target.alert.id}:${Math.round(r.left)}:${Math.round(r.top)}:${Math.round(r.width)}:${Math.round(r.height)}`;
    if (box.dataset.k !== k) {
      const [main, sub] = voidText(target.alert);
      box.querySelector('.vb-main').textContent = main;
      box.querySelector('.vb-sub').textContent = sub;
      Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, fontSize: `${Math.max(10, r.height / 22)}px` });
      box.dataset.k = k;
    }
    document.body.classList.add('show-void');
  }

  /** Carte « Information(s) M-Alert » : alerte annulée ou notification, pendant « hold » secondes. */
  function showInfo(info, seconds) {
    if (!infos || fondLayer || bannerLayer) return;
    B.drawInfo($('info'), info, { width: 670, height: 330 });
    infoUntil = Date.now() + (seconds || hold || 60) * 1000;
    document.body.classList.add('show-info');
  }

  const status = (t) => { $('status').textContent = t; };

  function wanted(a) {
    if (!M.isActive(a) || a.pending || a.silent) return false;
    if (a.test && !tests) return false;
    if (types.length && !types.includes(M.categoryOf(a))) return false;
    if (Number(a.level) < minLevel) return false;
    if (deps.length && !a.departments.includes('ALL') && !a.departments.some((d) => deps.includes(d))) return false;
    return true;
  }

  /** Alerte du bandeau : la dernière reçue (ou mise à jour) parmi celles qui doivent l'être. */
  function current() {
    const list = alerts.filter(wanted).sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
    // Alerte montrée depuis M-Alert-sender (« 🎥 Afficher dans OBS ») : en tête jusqu'à la suivante.
    return (forcedId && list.find((a) => a.id === forcedId)) || list[0] || null;
  }
  let forcedId = null;
  const forcedFirst = (x, y) => (forcedId ? (y.id === forcedId) - (x.id === forcedId) : 0);

  // Dernière alerte reçue (en cours ou terminée) : bandeau et texte affichés à la main quand aucune
  // alerte n'est en cours.
  let lastAlert = null;
  function remember(a) {
    if (!a || a.pending || a.silent || a.voided) return;
    const ok = wanted({ ...a, expiresAt: new Date(Date.now() + 60000).toISOString(), cancelledAt: null, noEnd: false });
    if (ok && (!lastAlert || (a.updatedAt || a.createdAt) >= (lastAlert.updatedAt || lastAlert.createdAt) || a.id === lastAlert.id)) lastAlert = a;
  }
  function loadLast() {
    if (!server) return;
    fetch(`${server}/api/alerts/last?n=10`).then((r) => (r.ok ? r.json() : [])).then((list) => {
      for (const a of (list || []).slice().reverse()) remember(a);
      render();
    }).catch(() => {});
  }
  const manualAlert = () => current() || lastAlert;

  /** Écran réduit : passe sur la scène de l'alerte (on), ou revient à la scène d'avant (off). */
  function reduce(on) {
    if (!reduceScene || !obsApi || !obsApi.setCurrentScene || switching) return;
    if (on && !prevScene) {
      switching = true;
      const go = (name) => {
        switching = false;
        if (name === reduceScene) return;
        prevScene = name || null;
        obsApi.setCurrentScene(reduceScene);
        document.body.classList.add('reduced');
      };
      if (obsApi.getCurrentScene) obsApi.getCurrentScene((sc) => go(sc && sc.name)); else go(null);
    } else if (!on && prevScene) {
      obsApi.setCurrentScene(prevScene);
      prevScene = null;
      document.body.classList.remove('reduced');
    }
  }

  // Texte du haut (fond de l'écran réduit, ou texte seul) : des pages qui défilent en boucle, sans
  // rien couper : « Informations M-Alert », puis les informations de l'alerte (titre, mesures,
  // description), puis « Restez informés… ». Alerte mise à jour : texte refait, cycle repris au début.
  const INTRO_MS = 4000;
  const CLOSING_MS = 4000;
  let pages = [];
  let pageIdx = 0;
  let pageUntil = 0;
  let pagesKey = '';
  const restartPages = () => { pageIdx = 0; pageUntil = Date.now() + (pages[0] ? pages[0].ms : INTRO_MS); };
  window.addEventListener('obsSourceVisibleChanged', (e) => { if (e.detail && e.detail.visible) { restartPages(); pagesKey = ''; render(); } });
  window.addEventListener('obsSourceActiveChanged', (e) => { if (e.detail && e.detail.active) { restartPages(); pagesKey = ''; render(); } });

  let measureCtx = null;
  function textWidth(t) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    const probe = $('fondText');
    const cs = getComputedStyle(probe);
    measureCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return measureCtx.measureText(t).width;
  }
  /** Lignes qui tiennent dans la largeur : morceaux (mots ou éléments de liste) joints par sep. */
  function wrap(tokens, sep, first = '') {
    const max = $('fondText').clientWidth * 0.98 || window.innerWidth * 0.8;
    const lines = [];
    let line = first;
    for (const tk of tokens) {
      const cand = line && line !== first ? `${line}${sep}${tk}` : `${line}${tk}`;
      if (textWidth(cand) <= max || !line || line === first) line = cand;
      else { lines.push(line); line = tk; }
    }
    if (line) lines.push(line);
    return lines;
  }
  const words = (t) => String(t || '').split(/\s+/).filter(Boolean);
  function buildPages(a) {
    const out = [{ lines: ['Informations M-Alert'], ms: INTRO_MS, intro: true }];
    const P = a ? B.infoParts(a) : null;
    // Mise à jour avec des départements ajoutés : annoncés juste après « Informations M-Alert ».
    if (a && addedInfo && addedInfo.id === a.id && addedInfo.revision === (a.revision || 0)) {
      const names = addedInfo.codes.map((c) => M.departmentName(c).replace(/ \(\w+\)$/, ''));
      for (let i = 0, lines = wrap(names, ', ', `${names.length > 1 ? 'Départements ajoutés' : 'Département ajouté'} : `); i < lines.length; i += 2) {
        out.push({ lines: lines.slice(i, i + 2), ms: 6000 });
      }
    }
    if (P) {
      const push = (lines) => {
        for (let i = 0; i < lines.length; i += 2) {
          const chunk = lines.slice(i, i + 2);
          const chars = chunk.join(' ').length;
          out.push({ lines: chunk, ms: Math.min(10000, Math.max(5000, 2500 + chars * 45)) });
        }
      };
      push(P.head.flatMap((h) => wrap(words(h), ' ')));
      for (const l of P.lists) push(wrap(l.items, ' · ', `${l.label} : `));
      if (P.text) push(wrap(words(P.text), ' ').slice(0, 12));
      out.push({ lines: [P.closing], ms: CLOSING_MS, intro: true });
    }
    return out;
  }
  function showLines(lines, intro) {
    const el = $('fondText');
    const html = lines.filter(Boolean).map((l) => `<div>${M.escapeHtml(l)}</div>`).join('');
    if (el.innerHTML === html && el.classList.contains('intro') === Boolean(intro)) return;
    el.classList.toggle('intro', Boolean(intro));
    el.innerHTML = html;
  }
  // Scène changée (aussi à la main, bouton « Écran réduit ») : positions selon l'écran réduit ou non.
  // Aussi l'écran réduit à la main (bouton du script, même sans le réglage « Écran réduit »).
  const REDUCED_SCENE = reduceScene || 'M-Alert (alerte)';
  window.addEventListener('obsSceneChanged', (e) => {
    if (e.detail && e.detail.name) document.body.classList.toggle('reduced', e.detail.name === REDUCED_SCENE);
  });
  if (obsApi && obsApi.getCurrentScene) {
    try { obsApi.getCurrentScene((sc) => { if (sc && sc.name === REDUCED_SCENE) document.body.classList.add('reduced'); }); } catch (_) { /* accès refusé */ }
  }
  // Texte en haut seul possible (sans l'écran réduit) : « Rapport final » placé dessous.
  if (q.get('textTop') === '1') document.body.classList.add('text-top');
  // Magnitude et intensités d'un séisme (pour annoncer leur changement).
  let fondPrev = null;
  function quakeSig(a) {
    if (a.category !== 'seisme') return null;
    const P = B.infoParts(a);
    const ints = (P && P.lists.find((l) => l.label === 'Intensités')) || { items: [] };
    return { mag: String(a.magnitude), ints: `${a.shindo || ''}|${ints.items.join(',')}` };
  }
  function renderFond(a) {
    if (cancelOn()) { showLines(cancelLines(cancelled.alert), false); return; }
    const key = a ? `${a.id}:${a.revision || 0}:${a.updatedAt || ''}` : '-';
    if (key !== pagesKey) {
      pagesKey = key;
      // Page « Informations M-Alert » mesurée à sa taille, les autres à la taille normale.
      $('fondText').classList.remove('intro');
      pages = buildPages(a);
      // Séisme mis à jour (magnitude, intensités) : « La magnitude a changé… » à la place de
      // « Informations M-Alert », une seule fois, puis les informations.
      const sig = a ? quakeSig(a) : null;
      if (a && fondPrev && fondPrev.id === a.id && sig) {
        const mag = sig.mag !== fondPrev.mag;
        const ints = sig.ints !== fondPrev.ints;
        if (mag || ints) {
          const m = typeof a.magnitude === 'number' ? ` (${a.magnitude.toLocaleString('fr-FR', { maximumFractionDigits: 1 })})` : '';
          const text = mag && ints ? `La magnitude${m} et les intensités ont changé` : mag ? `La magnitude a changé${m}` : 'Les intensités ont changé';
          pages[0] = { lines: [text], ms: 5000, intro: true, once: true };
        }
      }
      fondPrev = a ? { id: a.id, ...(sig || {}) } : null;
      restartPages();
    } else if (Date.now() >= pageUntil && pages.length > 1) {
      if (pages[pageIdx] && pages[pageIdx].once) pages[pageIdx] = { lines: ['Informations M-Alert'], ms: INTRO_MS, intro: true };
      pageIdx = (pageIdx + 1) % pages.length;
      pageUntil = Date.now() + pages[pageIdx].ms;
    }
    const pg = pages[pageIdx] || pages[0];
    if (pg) showLines(pg.lines, pg.intro);
  }


  // Tableau des mesures (tsunami : arrivée et hauteur ; vagues-submersion : pic et hauteur des vagues),
  // par niveau, en pages de ROWS_PER_PAGE lignes qui défilent toutes les 6 secondes.
  const ROWS_PER_PAGE = 5;
  let tablePages = [];
  let tableKey = '';
  let tablePage = 0;
  let tableUntil = 0;
  const TSU_LEVELS = { 5: ['Avertissement majeur', '#d500f9', '#fff'], 4: ['Avertissement', '#e60012', '#fff'], 2: ['Avis de tsunami', '#f2d500', '#111'] };
  const SURGE_LEVELS = { 5: ['Vigilance majeure', '#e040fb', '#fff'], 4: ['Vigilance rouge', '#e60012', '#fff'], 3: ['Vigilance orange', '#ff8c00', '#111'], 2: ['Vigilance jaune', '#f2d500', '#111'] };
  const depName = (c) => M.departmentName(c).replace(/ \(\w+\)$/, '');
  const hourText = (iso) => {
    const t = new Date(iso);
    const hm = M.formatTime(t.toISOString()).replace(':', ' h ');
    return M.zonedDate(t.getTime()) === M.zonedDate() ? hm : `${t.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: M.timeZone() })} ${hm}`;
  };
  const fr = (x, d = 1) => Number(x).toLocaleString('fr-FR', { maximumFractionDigits: d });
  // Mesures des marégraphes de l'UNESCO (envoyées par le serveur pendant ces alertes).
  let sealevel = null;
  let gaugesOn = true; // mesures affichées (choix de M-Alert-sender)
  const seaOf = (code) => (gaugesOn && sealevel && sealevel.departments && sealevel.departments[code]) || null;
  // Hauteurs d'eau mesurées (Hub'Eau) pendant les alertes crues, pluie-inondation, inondation.
  let rivers = null;
  function floodRows(a) {
    const set = new Set(a.departments || []);
    const lvOf = (code) => {
      const r = ((a.forecastTable && a.forecastTable.rows) || []).find((x) => x.department === code);
      return r ? r.level : a.level;
    };
    const out = [];
    // Mesures masquées pour cette alerte (choix de M-Alert-sender) : niveaux prévus seulement.
    for (const [code, d] of Object.entries((gaugesOn && !a.hideMeasures && rivers && rivers.departments) || {})) {
      if (!set.has('ALL') && !set.has(code)) continue;
      for (const st of (d && d.stations) || []) {
        if (typeof st.h !== 'number') continue;
        const rise = typeof st.rise === 'number' ? (st.rise === 0 ? 'stable' : `${M.heightText(st.rise, { sign: true, digits: 2 })} en ${st.hours || 6} h`) : '';
        out.push({ level: lvOf(code), name: `${st.name}`, sub: [st.river, rise].filter(Boolean).join(' · '), when: `mesuré ${hourText(st.at)}`, value: M.heightText(st.h, { digits: 2 }), h: typeof st.rise === 'number' ? st.rise : -1, measured: true });
      }
    }
    // Sans mesure : niveaux prévus par département (tableau de l'alerte).
    if (!out.length) {
      for (const r of ((a.forecastTable && a.forecastTable.rows) || [])) {
        if (!set.has('ALL') && !set.has(r.department)) continue;
        out.push({ level: r.level, name: depName(r.department), when: r.at ? `pic ${hourText(r.at)}` : r.from ? `dès ${hourText(r.from)}` : '—', value: r.rain24 ? `${Math.round(r.rain24)} mm` : '', h: r.rain24 || 0 });
      }
    }
    return out;
  }
  function coastRows(a) {
    if (isFlood(a)) return floodRows(a);
    if (a.category === 'tsunami') {
      return (a.tsunamiTable || []).map((r) => {
        // Heure corrigée par les marégraphes (arrivée mesurée, ou temps de trajet recalé).
        const fix = gaugesOn && !a.hideMeasures ? M.arrivalFix(sealevel, a, r.department) : null;
        if (fix && !fix.measured) r = { ...r, arrival: fix.at, estimated: true };
        // Vague mesurée dans le port : elle remplace l'estimation (« mesuré », comme la NHK).
        const o = a.hideMeasures ? null : seaOf(r.department);
        const seen = o && o.tsunami && typeof o.tsunami.height === 'number' ? o.tsunami : null;
        if (seen) return { level: r.level, name: depName(r.department), when: `mesuré ${hourText(seen.at)}`, value: M.heightText(seen.height, { digits: 2 }), h: seen.height, measured: true };
        return {
          level: r.level, name: depName(r.department),
          when: r.arrival === 'arrived' ? 'Déjà arrivé' : r.arrival === 'imminent' ? 'Arrivée imminente' : r.arrival
            ? (new Date(r.arrival).getTime() <= Date.now() ? (r.estimated ? 'Probablement arrivé' : 'Déjà arrivé') : `${r.estimated ? '≈ ' : ''}${hourText(r.arrival)}`) : '—',
          value: typeof r.height === 'number' ? `${r.heightEstimated ? '≈' : ''}${M.heightText(r.height)}` : '',
          h: typeof r.height === 'number' ? r.height : -1,
        };
      });
    }
    const set = new Set(a.departments || []);
    return ((a.forecastTable && a.forecastTable.rows) || []).filter((r) => set.has('ALL') || set.has(r.department)).map((r) => {
      const row = {
        level: r.level, name: depName(r.department),
        when: r.at ? `pic ${hourText(r.at)}` : r.from ? `dès ${hourText(r.from)}` : '—',
        value: r.hs > 0 ? M.heightText(r.hs) : typeof r.water === 'number' ? `mer ${M.heightText(r.water, { sign: true, digits: 2 })}` : '',
        // Tri : vagues, sinon niveau de la mer (après toutes les hauteurs de vagues).
        h: r.hs > 0 ? r.hs : typeof r.water === 'number' ? -10 + r.water : -100,
      };
      // Pleine mer mesurée par le marégraphe (par rapport aux plus hautes mers du mois), sous les vagues.
      const o = a.hideMeasures ? null : seaOf(r.department);
      if (o && !o.error && o.surge && typeof o.surge.above === 'number') row.sub = `mer mesurée ${M.heightText(o.surge.above, { sign: true, digits: 2 })}`;
      // Vagues mesurées par la bouée du Cerema : elles remplacent la prévision (« mesuré »).
      if (o && o.buoy && typeof o.buoy.hs === 'number') Object.assign(row, { when: `mesuré ${hourText(o.buoy.at)}`, value: M.heightText(o.buoy.hs), h: o.buoy.hs, measured: true });
      return row;
    });
  }
  function renderCoastTable(a) {
    const key = `${a.id}:${a.revision || 0}:${Math.floor(Date.now() / 60000)}`;
    const tsu = a.category === 'tsunami';
    const LV = tsu ? TSU_LEVELS : SURGE_LEVELS;
    if (key !== tableKey) {
      const keep = tableKey.split(':').slice(0, 2).join(':') === key.split(':').slice(0, 2).join(':');
      tableKey = key;
      // Par niveau, puis hauteur des vagues décroissante (la plus haute d'abord ; sans hauteur à la fin).
      const rows = coastRows(a).sort((x, y) => (y.level - x.level) || (y.h - x.h));
      tablePages = [];
      for (const lv of Object.keys(LV).map(Number).sort((x, y) => y - x)) {
        const group = rows.filter((r) => r.level === lv);
        for (let i = 0; i < group.length; i += ROWS_PER_PAGE) tablePages.push({ level: lv, rows: group.slice(i, i + ROWS_PER_PAGE) });
      }
      if (!keep) { tablePage = 0; tableUntil = Date.now() + 6000; }
      tablePage = Math.min(tablePage, Math.max(0, tablePages.length - 1));
    } else if (Date.now() >= tableUntil && tablePages.length > 1) {
      tablePage = (tablePage + 1) % tablePages.length;
      tableUntil = Date.now() + 6000;
    }
    const pg = tablePages[tablePage];
    const el = $('coastTable');
    if (!pg) { el.innerHTML = ''; return; }
    const [name, bg, fg] = LV[pg.level] || ['', '#e60012', '#fff'];
    const esc = M.escapeHtml;
    const html = `<div class="ct-title">${tsu ? 'Arrivée prévue du tsunami' : isFlood(a) ? 'Crues · hauteurs d\'eau mesurées' : 'Vagues-submersion prévues'}</div>`
      + `<div class="ct-level" style="background:${bg};color:${fg}">${esc(name)}</div>`
      + pg.rows.map((r) => `<div class="ct-row${r.measured ? ' measured' : ''}"><span class="ct-name">${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span><span class="ct-when">${esc(r.when)}</span>`
        + `<span class="ct-val" style="background:${bg};color:${fg}">${esc(r.value)}</span></div>`).join('')
      + (tablePages.length > 1 ? `<div class="ct-page">${tablePage + 1}/${tablePages.length}</div>` : '');
    if (el.innerHTML !== html) el.innerHTML = html;
  }


  // Mesures en plein écran, comme la NHK (« 第1波到達予想時刻・予想高さ ») : titre en haut à droite,
  // niveaux en étiquettes, une ligne par département (nom, heure en jaune, hauteur), « mesuré » en
  // cyan ; pages de BOARD_LINES lignes (étiquettes comprises) qui défilent, « 1 / 5 » et l'heure.
  const BOARD_LINES = 6;
  function boardPages(a) {
    const tsu = a.category === 'tsunami';
    const LV = tsu ? TSU_LEVELS : SURGE_LEVELS;
    const rows = coastRows(a).sort((x, y) => (y.level - x.level) || (y.h - x.h));
    const pages = [];
    let page = null;
    for (const lv of Object.keys(LV).map(Number).sort((x, y) => y - x)) {
      const group = rows.filter((r) => r.level === lv);
      group.forEach((r, i) => {
        // Nouvelle page : page pleine, ou étiquette du niveau sans place pour une ligne dessous.
        const lines = page ? page.reduce((n, b) => n + 1 + b.rows.length, 0) : BOARD_LINES;
        if (lines + (i === 0 ? 2 : 1) > BOARD_LINES) { page = []; pages.push(page); }
        let block = page[page.length - 1];
        if (!block || block.level !== lv) { block = { level: lv, rows: [] }; page.push(block); }
        block.rows.push(r);
      });
    }
    return pages;
  }
  let boardKey = '';
  let boardPage = 0;
  let boardUntil = 0;
  function renderBoard(a) {
    const pages = boardPages(a);
    const id = `${a.id}:${a.revision || 0}`;
    if (boardKey.split('|')[0] !== id) { boardPage = 0; boardUntil = Date.now() + boardCycle * 1000; }
    if (boardCycle === 0) boardPage = pages.length ? boardPageWanted % pages.length : 0;
    else if (Date.now() >= boardUntil) { boardPage = pages.length ? (boardPage + 1) % pages.length : 0; boardUntil = Date.now() + boardCycle * 1000; }
    boardPage = Math.min(boardPage, Math.max(0, pages.length - 1));
    const tsu = a.category === 'tsunami';
    const LV = tsu ? TSU_LEVELS : SURGE_LEVELS;
    const esc = M.escapeHtml;
    const pg = pages[boardPage] || [];
    const clock = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: M.timeZone ? M.timeZone() : undefined });
    const html = `<div class="cb-title">${tsu ? 'Arrivée de la 1<sup>re</sup> vague · hauteur prévue' : isFlood(a) ? 'Crues · hauteurs d\'eau mesurées (Hub\'Eau)' : 'Vagues-submersion · vagues prévues'}</div>`
      + `<div class="cb-body">`
      + pg.map((b) => {
        const [name, bg, fg] = LV[b.level] || ['', '#e60012', '#fff'];
        return `<div class="cb-level"><span style="background:${bg};color:${fg}">${esc(name)}</span></div>`
          + b.rows.map((r) => `<div class="cb-row${r.measured ? ' measured' : ''}"><span class="cb-name">${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>`
            + `<span class="cb-when">${esc(r.when).replace(/^mesuré /, '<small>mesuré</small>')}</span><span class="cb-val">${esc(r.value).replace(/(\d)\s?(m|cm)$/, '$1<small>$2</small>')}</span></div>`).join('');
      }).join('')
      + `</div><div class="cb-foot">${pages.length > 1 ? `<span>${boardPage + 1} / ${pages.length}</span>` : ''}<span>${esc(clock)}</span></div>`;
    boardKey = `${id}|${html}`;
    const el = $('coastBoard');
    if (el.innerHTML !== html) el.innerHTML = html;
    return pages.length;
  }

  // Panneau « Alerte sismique précoce » à gauche (comme la NHK, en colonne étroite) : titre rouge, lieu
  // du séisme en jaune, départements en blanc, un par ligne, texte horizontal.
  let eewKey = '';
  // Départements trop nombreux pour la hauteur du panneau : pages qui défilent toutes les 5 secondes.
  let eewPages = [];
  let eewPage = 0;
  let eewUntil = 0;
  function renderEew(a) {
    const key = `${a.id}:${a.revision || 0}`;
    if (key !== eewKey) {
      eewKey = key;
      const places = B.placesOf(a);
      let where = 'Séisme';
      if (a.epicenter) where = B.onLand(a.epicenter.lat, a.epicenter.lon) ? `Séisme : ${places[0] || ''}` : 'Séisme en mer';
      const esc = M.escapeHtml;
      // Étiquette : intensités par la méthode PLUM (stations), hybride, ou sans PLUM.
      const qm = M.quakeMethod(a);
      const qmTag = qm === 'plum' || qm === 'hybrid' ? `<div class="eew-method qm-${qm}">PLUM</div>` : ''; // rien sans PLUM
      $('eew').innerHTML = `<div class="eew-red">Alerte sismique précoce</div><div class="eew-yellow">${esc(where)}</div>${qmTag}`
        // Noms composés : retour à la ligne possible après les traits d'union (« Alpes-de- / Haute-Provence »).
        + `<div class="eew-list">${places.map((p) => `<span class="eew-dep">${esc(p).replace(/-/g, '-<wbr>')}</span>`).join('')}</div>`
        + '<div class="eew-page"></div>';
      // Pages : les noms qui tiennent dans la hauteur de la liste.
      const list = $('eew').querySelector('.eew-list');
      const deps = [...list.children];
      deps.forEach((d) => { d.style.display = ''; });
      const h = list.clientHeight;
      eewPages = [];
      let top = null;
      let cur = [];
      for (const d of deps) {
        const t = d.offsetTop; const bottom = t + d.offsetHeight;
        if (top === null) top = t;
        if (cur.length && bottom - top > h) { eewPages.push(cur); cur = []; top = t; }
        cur.push(d);
      }
      if (cur.length) eewPages.push(cur);
      eewPage = 0;
      eewUntil = Date.now() + 5000;
    } else if (eewPages.length > 1 && Date.now() >= eewUntil) {
      eewPage = (eewPage + 1) % eewPages.length;
      eewUntil = Date.now() + 5000;
    } else return;
    eewPages.forEach((pg, i) => pg.forEach((d) => { d.style.display = i === eewPage ? '' : 'none'; }));
    $('eew').querySelector('.eew-page').textContent = eewPages.length > 1 ? `${eewPage + 1}/${eewPages.length}` : '';
  }


  // Couleurs des niveaux de missile (celles de l'application) : Avis en jaune, Avertissement en rouge,
  // Avertissement majeur en rose.
  const MISSILE_COLORS = { 2: ['#ffe11a', '#111'], 3: ['#ff9300', '#111'], 4: ['#e0141e', '#fff'], 5: ['#fe05fd', '#fff'] };
  const missileColors = (m) => MISSILE_COLORS[m && m.level] || MISSILE_COLORS[4];
  const missileLevelName = (lv) => ((M.CATEGORY_LEVELS.missile || {})[lv] || {}).name || M.alertLevelLabel({ category: 'missile', level: lv });
  const byLevel = (x, y) => (y.level - x.level) || (y.updatedAt || y.createdAt).localeCompare(x.updatedAt || x.createdAt);

  // Plusieurs alertes missile en cours, de niveaux différents : affichées ensemble. Chaque département
  // prend le niveau le plus haut qui le vise ; l'alerte la plus grave donne la couleur principale.
  function missileView(list) {
    const sorted = [...list].sort(byLevel);
    const top = sorted[0];
    const allLevel = Math.max(0, ...sorted.filter((m) => (m.departments || []).includes('ALL')).map((m) => m.level));
    const levelOf = {};
    for (const m of sorted) for (const c of m.departments || []) if (c !== 'ALL') levelOf[c] = Math.max(levelOf[c] || 0, m.level);
    const levels = [...new Set(sorted.map((m) => m.level))].sort((x, y) => y - x);
    // Zones par niveau (du plus haut au plus bas) ; « Toute la France » au niveau d'une alerte nationale.
    const groups = levels.map((lv) => {
      const codes = lv === allLevel ? ['ALL'] : lv < allLevel ? [] : Object.keys(levelOf).filter((c) => levelOf[c] === lv);
      return { level: lv, zones: codes.length ? B.placesOf({ category: 'missile', departments: codes }) : [] };
    }).filter((g) => g.zones.length);
    const layers = [...levels].reverse().map((lv) => ({ color: missileColors({ level: lv })[0],
      departments: lv === allLevel ? ['ALL'] : Object.keys(levelOf).filter((c) => levelOf[c] === lv) }));
    const titles = [...new Set(sorted.map((m) => String(m.title || '').trim().replace(/\.$/, '')).filter(Boolean))];
    // Description écrite dans M-Alert-sender : c'est le message affiché (une ligne par ligne saisie).
    const descs = [...new Set(sorted.map((m) => String(m.description || '').trim()).filter(Boolean))];
    const when = new Date(sorted.map((m) => m.updatedAt || m.createdAt).sort().pop());
    const key = sorted.map((m) => `${m.id}:${m.revision || 0}:${m.updatedAt || ''}:${m.level}`).join('|');
    return { top, levels, groups, layers, titles, descs, when, key };
  }

  // Zones : par niveau, avec l'étiquette de couleur du niveau quand il y en a plusieurs.
  function missileZonesHtml(v) {
    const esc = M.escapeHtml;
    const list = (zones) => zones.map((z) => `<span style="white-space:nowrap">${esc(z)}</span>`).join('\u2003 ');
    if (v.groups.length < 2) return list(v.groups[0] ? v.groups[0].zones : []);
    return v.groups.map((g) => {
      const [bg, fg] = missileColors({ level: g.level });
      return `<div class="mz-grp"><span class="mz-lv" style="background:${bg};color:${fg}">${esc(v.top.category !== 'missile' ? M.alertLevelLabel({ ...v.top, level: g.level }) : missileLevelName(g.level))}</span>${list(g.zones)}</div>`;
    }).join('');
  }

  function renderMissile(list, phase) {
    const v = missileView(list);
    const lv = missileColors(v.top);
    const esc = M.escapeHtml;
    if (v.key !== missileKey) {
      missileKey = v.key;
      // Couleur du niveau le plus haut : barre, bandeaux et encart ; zones et carte : chaque niveau.
      document.body.style.setProperty('--mlv', lv[0]);
      document.body.style.setProperty('--mlt', lv[1]);
      $('missileCard').querySelector('.mc-bar').textContent = M.alertLevelLabel(v.top);
      // Message : la description de l'alerte (M-Alert-sender) ; sans description, le message type.
      // Autre alerte au style missile, sans description : son titre et ses consignes.
      const other = v.top.category !== 'missile';
      const advice = other ? String(v.top.instructions || '').split(/\n+/).map((l) => l.trim()).filter(Boolean) : [];
      const msgLines = v.descs.length ? v.descs.flatMap((t) => t.split(/\n+/)).map((l) => l.trim()).filter(Boolean)
        : other ? [...v.titles.map((t) => `${t}.`), ...advice]
          : ['Missile lancé. Missile lancé.', ...v.titles.map((t) => `${t}.`), 'Abritez-vous à l\'intérieur d\'un bâtiment ou en sous-sol.'];
      $('missileCard').querySelector('.mc-msg').innerHTML = msgLines.map((l) => `<div>${esc(l)}</div>`).join('');
      $('missileCard').querySelector('.mc-zones').innerHTML = missileZonesHtml(v);
      $('missileCard').querySelector('.mc-time').textContent = `Reçu le ${v.when.toLocaleDateString('fr-FR', { timeZone: M.timeZone() })} à ${M.formatTime(v.when.toISOString()).replace(':', ' h ')}`;
      $('missileLower').querySelector('.ml-msg').innerHTML = (v.descs.length || other ? msgLines
        : ['Missile lancé. Missile lancé.', ...v.titles.slice(0, 2), 'Abritez-vous à l\'intérieur d\'un bâtiment ou en sous-sol.'])
        .map((l) => `<div>${esc(l)}</div>`).join('');
      $('missileLower').querySelector('.ml-zones').innerHTML = missileZonesHtml(v);
      // Légende de la carte : les niveaux en cours.
      $('missileLegend').innerHTML = v.groups.map((g) => g.level).map((l) => `<span><i style="background:${missileColors({ level: l })[0]}"></i>${esc(other ? M.alertLevelLabel({ ...v.top, level: l }) : missileLevelName(l))}</span>`).join('');
      $('missileFlash').querySelector('.mf-text').textContent = v.top.title || M.alertLevelLabel(v.top);
    }
    // Textes réduits s'ils ne tiennent pas (longue description, beaucoup de départements), une fois
    // affichés : écran plein (message et zones), bloc du bas (message, puis zones).
    const fit = (el, box = el, ratio = 0.5) => {
      el.style.fontSize = '';
      let size = parseFloat(getComputedStyle(el).fontSize);
      const min = size * ratio;
      while (box.scrollHeight > box.clientHeight + 1 && size > min) { size -= 1; el.style.fontSize = `${size}px`; }
    };
    const fitKey = `${phase}:${v.key}`;
    if (missileFitKey !== fitKey) {
      missileFitKey = fitKey;
      if (phase === 1) fit($('missileCard').querySelector('.mc-body'));
      else { fit($('missileLower').querySelector('.ml-msg')); fit($('missileLower').querySelector('.ml-zones')); }
    }
    missileShown = phase === 2 ? v : null;
    blinkMissileMap();
    // Consigne en haut à droite : « Intérieur » et « Extérieur » en alternance (6 secondes).
    const indoor = Math.floor(Date.now() / 6000) % 2 === 0;
    const tag = indoor ? 'Intérieur' : 'Extérieur';
    if ($('missileAdvice').querySelector('.ma-tag').textContent !== tag) {
      $('missileAdvice').querySelector('.ma-tag').textContent = tag;
      $('missileAdvice').querySelector('.ma-text').innerHTML = indoor
        ? 'Éloignez-vous des fenêtres<br>Pièce sans fenêtre'
        : 'Entrez dans un bâtiment<br>ou en sous-sol';
    }
  }

  // Carte missile : les départements concernés clignotent comme à la NHK (≈ 0,55 s en jaune, 0,5 s en gris).
  // Cartes (plein écran et mini-carte) : côtes et départements en alerte clignotent au rythme de la
  // carte missile de la NHK ; redessinées seulement au changement d'état (ou à la demande de render).
  let mapReq = null;
  let miniReq = null;
  let mapsOn = null;
  function drawMaps(force) {
    const on = Date.now() % 1050 < 550;
    if (!force && on === mapsOn) return;
    mapsOn = on;
    if (mapReq) B.drawTsunamiMap($('tsunami'), mapReq, on);
    if (miniReq) B.drawTsunamiMap($('miniMap'), miniReq.alert, on, { width: 960, height: 540, zoom: miniReq.zoom, view: miniReq.view });
  }

  function blinkMissileMap() {
    const v = missileShown;
    if (!v) return;
    const on = Date.now() % 1050 < 550;
    const mk = `${v.key}:${on}`;
    if (mk === missileMapKey) return;
    B.drawZonesMap($('missileMap'), null, { width: 640, height: 600, blinkOn: on, layers: v.layers });
    missileMapKey = mk;
  }

  function render() {
    const a = current();
    if (textLayer) {
      if (a && a.id !== shownId) { shownId = a.id; shownAt = Date.now(); }
      if (a) markFirst(a.id);
      // Comme l'écran réduit : après reduceAfter secondes, le temps du bandeau (ou tant qu'un séisme
      // ou un tsunami est en cours), et le temps d'annoncer une annulation.
      const autoOn = textAuto && a && (hold === 0 || Date.now() - shownAt < hold * 1000 || stays(a)) && Date.now() - firstAt >= reduceAfter * 1000;
      const on = manualText === true ? Boolean(manualAlert()) || cancelOn() : manualText === false ? false : Boolean(autoOn) || (cancelOn() && textShown);
      textShown = on;
      document.body.classList.toggle('text-off', !on);
      if (on) renderFond(manualText === true && !a ? manualAlert() : a);
      return;
    }
    if (fondLayer) { renderFond(a); return; }
    if (bannerLayer) {
      // Bandeau de l'alerte en cours, tant que la source est affichée (sans durée ni écran réduit).
      document.body.classList.toggle('top', q.get('pos') === 'top');
      const m = manualAlert();
      document.body.classList.toggle('show-banner', Boolean(m));
      const add = addedNow(m);
      const k = m ? `${m.id}:${m.revision || 0}${add ? (blink ? ':+' : ':-') : ''}` : '';
      if (m && k !== drawnKey) { B.drawBanner($('banner'), m, { width: 1600, height: 450, added: add, blinkOn: blink }); drawnKey = k; }
      return;
    }
    // Carte plein écran : tsunami, ou vagues-submersion / forte houle (automatique, ou à la main).
    // Alerte choisie dans M-Alert-sender, sinon tsunami, puis la plus grave (niveau le plus haut d'une
    // côte : la vigilance orange passe avant les alertes jaunes plus récentes), puis la plus récente.
    const coastTop = (x) => Math.max(x.level || 0, ...Object.values(B.coastLevelsOf ? B.coastLevelsOf(x) : {}));
    const coastList = alerts.filter(wanted).filter(isMap)
      .sort((x, y) => forcedFirst(x, y) || ((y.id === coastPinned) - (x.id === coastPinned)) || ((y.category === 'tsunami') - (x.category === 'tsunami'))
        || (coastTop(y) - coastTop(x)) || (y.updatedAt || y.createdAt).localeCompare(x.updatedAt || x.createdAt));
    const lastCoast = isMap(lastAlert) ? lastAlert : null;
    // Alerte choisie dans M-Alert-sender, quelle qu'elle soit (toutes les alertes en carte et mini-carte).
    // « vig:<phénomène> » : vigilance Météo-France seule (sans alerte M-Alert), choisie dans le sender.
    const pinnedAny = coastPinned ? alerts.filter(wanted).find((x) => x.id === coastPinned)
      || (/^vig:/.test(coastPinned) ? B.vigAlerts(vig).find((x) => x.id === coastPinned) || null : null) : null;
    // Alerte de la carte annulée (fausse alerte) : la carte reste le temps de l'annonce, avec le cadre bleu.
    const voidCoast = cancelOn() && isMap(cancelled.alert) && cancelled.alert.id === coastId && manualMap !== false ? cancelled.alert : null;
    const tsu = manualMap === false ? null : (manualMap === true ? pinnedAny || coastList[0] || lastCoast : tsunamiMap ? coastList[0] || null : null) || voidCoast;
    if (a && a.id !== shownId) { shownId = a.id; shownAt = Date.now(); }
    if (a) markFirst(a.id);
    if (tsu && tsu.id !== coastId) { coastId = tsu.id; coastStart = Date.now(); coastShownAt = Date.now(); }
    // Alerte missile : écran plein, puis bloc en bas (pas de bandeau ni d'écran réduit pour elle).
    const missiles = alerts.filter(wanted).filter(missileLike)
      .sort((x, y) => forcedFirst(x, y) || (y.updatedAt || y.createdAt).localeCompare(x.updatedAt || x.createdAt));
    // Toutes les alertes missile en cours sont affichées ensemble (niveaux différents).
    const lastMissile = lastAlert && missileLike(lastAlert) ? lastAlert : null;
    const voidMissile = cancelOn() && missileLike(cancelled.alert) && cancelled.alert.id === missileId ? cancelled.alert : null;
    const missileList = manualMissile === false ? [] : missiles.length ? missiles
      : (manualMissile === true || manualCard === true) && lastMissile ? [lastMissile] : voidMissile ? [voidMissile] : [];
    const missile = missileList[0] || null;
    if (missile && missile.id !== missileId) { missileId = missile.id; missileStart = Date.now(); }
    // Écran plein : cardSeconds au début (et à chaque mise à jour), ou affiché / masqué à la main.
    const cardOn = manualCard === true ? true : manualCard === false ? false : Date.now() - missileStart < cardSeconds * 1000;
    const mPhase = !missile ? 0 : cardOn ? 1 : 2;
    document.body.classList.toggle('show-missile-card', mPhase === 1);
    document.body.classList.toggle('show-missile', mPhase === 2);
    if (mPhase) renderMissile(missileList, mPhase); else missileShown = null;
    // Phase 1 : carte plein écran (le bandeau d'une autre alerte, le séisme, réduit en haut à gauche).
    // Phase 2 : mini-carte et tableau des mesures sur l'image, jusqu'à la fin de « hold ».
    // Phase 3 (automatique) : mesures en plein écran après la carte, le temps d'un tour des pages.
    let phase = 0;
    if (tsu) {
      const boardSec = manualBoard === false ? 0 : Math.min(60, Math.max(8, boardPages(tsu).length * (boardCycle || 15)));
      const t = Date.now() - coastStart;
      if (manualMap === true || t < mapSeconds * 1000) phase = 1;
      else if (manualBoard !== false && boardPages(tsu).length && t < (mapSeconds + boardSec) * 1000) phase = 3;
      else if (hold === 0 || Date.now() - coastShownAt < hold * 1000 || stays(tsu)) phase = 2;
    }
    // Mesures plein écran : en phase 3, ou à la main (au-dessus de tout, sauf la carte à la main).
    const pinnedMap = pinnedAny && isMap(pinnedAny) ? pinnedAny : null;
    const boardAlert = manualBoard === true && manualMap !== true ? pinnedMap || tsu || coastList[0] || lastCoast : phase === 3 ? tsu : null;
    const boardOn = Boolean(boardAlert);
    const mapOn = phase === 1 && !boardOn;
    // Avec la carte des tsunamis : bandeau de la dernière autre alerte (le séisme), réduit en haut à gauche.
    const others = mapOn ? alerts.filter(wanted).filter((x) => x.id !== tsu.id && !isMap(x))
      .sort((x, y) => (y.updatedAt || y.createdAt).localeCompare(x.updatedAt || x.createdAt)) : [];
    // Carte plein écran ou tableau : pas de bandeau (le séisme est dans le panneau à gauche).
    const ba = phase > 0 || boardOn || mPhase > 0 || (a && missileLike(a)) ? null : a;
    const autoOn = ba && (hold === 0 || Date.now() - shownAt < hold * 1000);
    // Bandeau à la main (script OBS) : affiché sans durée, ou masqué jusqu'à la prochaine alerte.
    const shown = manualBanner === true ? manualAlert() : ba;
    const bannerOn = cancelOn() ? false : manualBanner === true ? shown && !(mapOn && shown.id === tsu.id) : manualBanner === false ? false : autoOn;
    // Écran réduit : bandeau toujours en bas (le texte d'informations est en haut).
    document.body.classList.toggle('top', (q.get('pos') === 'top' && !reduceScene) || mapOn);
    document.body.classList.toggle('show-banner', Boolean(bannerOn));
    // Bandeau redessiné seulement quand l'alerte change (le clignotement ne concerne que la carte).
    const add = addedNow(shown);
    const key = shown ? `${shown.id}:${shown.revision || 0}${add ? (blink ? ':+' : ':-') : ''}` : '';
    if (bannerOn && key !== drawnKey) { B.drawBanner($('banner'), shown, { width: 1600, height: 450, added: add, blinkOn: blink }); drawnKey = key; }
    // Annulation : l'écran réduit (s'il l'est déjà) reste le temps de l'annonce.
    const stayOn = alerts.filter(wanted).some(stays);
    reduce(Boolean(((autoOn || phase > 0 || stayOn) && (Date.now() - firstAt >= reduceAfter * 1000 || prevScene)) || (cancelOn() && prevScene)));
    document.body.classList.toggle('show-tsunami', mapOn);
    // Alerte météo complétée par la vigilance Météo-France du même phénomène (tous les départements concernés).
    mapReq = mapOn ? B.withVigilance(tsu, vig) : null;
    document.body.classList.toggle('show-board', boardOn);
    if (boardOn) renderBoard(boardAlert);
    // Mini-carte et tableau : après la carte plein écran, ou à la main.
    const coastAny = tsu || coastList[0] || lastCoast;
    const miniAlert = pinnedAny || coastAny;
    const tableAlert = pinnedMap || (isMap(coastAny) ? coastAny : null);
    // Mini-carte masquée tant que le bandeau d'alerte est affiché, puis de nouveau là quand il disparaît.
    const miniOn = !bannerOn && !mapOn && !boardOn && (manualMini === true ? Boolean(miniAlert) : manualMini === false ? false : phase === 2);
    const tableOn = !mapOn && !boardOn && (manualTable === true ? Boolean(tableAlert) : manualTable === false ? false : phase === 2 && Boolean(tableAlert));
    document.body.classList.toggle('show-mini', miniOn);
    document.body.classList.toggle('show-table', tableOn);
    miniReq = miniOn ? { alert: B.withVigilance(miniAlert, vig), zoom: miniZoom, view: miniView } : null;
    drawMaps(true);
    if (tableOn) renderCoastTable(tableAlert);
    // Panneau « Alerte sismique précoce » à gauche : séisme en cours, écran réduit (ou tableau), ou à la main.
    const quakes = alerts.filter(wanted).filter((x) => x.category === 'seisme')
      .sort((x, y) => forcedFirst(x, y) || (y.updatedAt || y.createdAt).localeCompare(x.updatedAt || x.createdAt));
    const quake = quakes[0] || null;
    const quakeAny = quake || (lastAlert && lastAlert.category === 'seisme' ? lastAlert : null);
    const quakeRecent = quake && (hold === 0 || Date.now() - Date.parse(quake.updatedAt || quake.createdAt) < hold * 1000 || phase > 0);
    // Pas en même temps que le bandeau du bas (même alerte deux fois).
    const eewOn = !mapOn && !boardOn && !cancelOn() && (manualEew === true ? Boolean(quakeAny) : manualEew === false ? false
      : eewAuto && !bannerOn && Boolean(quakeRecent || stays(quake)) && Boolean(prevScene || phase === 2));
    document.body.classList.toggle('show-eew', eewOn);
    if (eewOn) renderEew(manualEew === true ? quakeAny : quake);
    // Intensités du séisme en cours (ou du dernier) : plein écran, écran réduit ou mini.
    // Séisme choisi dans M-Alert-sender, sinon celui en cours (ou le dernier).
    // Séisme choisi dans M-Alert-sender : sa version à jour s'il est encore en cours (magnitude,
    // épicentre et intensités corrigés après coup, intensités PLUM), sinon celle reçue du sender.
    const liveChosen = shindoQuake && alerts.find((x) => x.id === shindoQuake.id && x.category === 'seisme');
    // Séisme annulé (fausse alerte) pendant que ses intensités sont affichées : carte gardée le temps
    // de l'annonce, avec le cadre bleu « L'alerte sismique précoce a été annulée ».
    const voidQuake = cancelOn() && cancelled.alert.category === 'seisme' ? cancelled.alert : null;
    const mapQuake = liveChosen || shindoQuake || quakeAny || voidQuake;
    const smode = mapQuake ? shindoMode : null;
    for (const m of ['full', 'mini']) document.body.classList.toggle(`shindo-${m}`, smode === m);
    if (smode) {
      // Terre verte, puis brune une fois le « Rapport final » affiché (comme la NHK).
      // Redessinée à chaque changement : révision, magnitude, profondeur, épicentre, intensités.
      const sk = `${mapQuake.id}:${mapQuake.revision || 0}:${mapQuake.updatedAt || ''}:${mapQuake.magnitude}:${mapQuake.depth}:${mapQuake.shindo}:${JSON.stringify(mapQuake.epicenter || null)}:${JSON.stringify(mapQuake.intensities || {})}:${smode === 'mini'}:${JSON.stringify(shindoView)}:${finalOn}:${epicenterOn}:${magnitudeOn}`;
      if (sk !== shindoKey) {
        B.drawShindoMap($('shindoMap'), mapQuake, smode === 'mini' ? { width: 1020, height: 750, mini: true, view: shindoView, final: finalOn, epicenter: epicenterOn, magnitude: magnitudeOn } : { width: 1920, height: 1080, view: shindoView, final: finalOn, epicenter: epicenterOn, magnitude: magnitudeOn });
        shindoKey = sk;
      }
    }
    // Cadre d'annulation : sur la carte qui montre l'alerte annulée (intensités, côtes, mini-carte, missile).
    const isVoid = (x) => Boolean(x && cancelOn() && x.id === cancelled.alert.id);
    renderVoid(smode && isVoid(mapQuake) ? { el: $('shindoMap'), alert: mapQuake }
      : mapOn && isVoid(tsu) ? { el: $('tsunami'), alert: tsu }
        : miniOn && isVoid(miniAlert) ? { el: $('miniMap'), alert: miniAlert }
          : mPhase === 1 && isVoid(missile) ? { el: $('missileCard'), alert: missile } : null);
    document.body.classList.toggle('show-notsunami', noTsunamiOn === true);
    document.body.classList.toggle('show-seavar', noTsunamiOn === 'sea');
    document.body.classList.toggle('show-final', finalOn);
    // En bas à droite : au-dessus du bandeau s'il est affiché.
    const notes = $('quakeNotes');
    const br = bannerOn ? $('banner').getBoundingClientRect() : null;
    notes.style.bottom = br && br.height && br.right > window.innerWidth * 0.6 ? `${Math.round(window.innerHeight - br.top + window.innerHeight * 0.015)}px` : '';
  }

  function arrived(a) {
    if (!wanted(a)) return;
    if (a.id !== forcedId) forcedId = null; // nouvelle alerte : elle passe devant celle montrée à la main
    // Séisme : « Alerte de tremblement de terre » en haut pendant 3 secondes.
    if (a.category === 'seisme' && !fondLayer && !bannerLayer) {
      document.body.classList.add('show-quake-top');
      clearTimeout(arrived.quakeTimer);
      arrived.quakeTimer = setTimeout(() => document.body.classList.remove('show-quake-top'), 3000);
    }
    manualBanner = null;
    manualMap = null;
    // Mini-carte affichée à la main : gardée (masquée seulement le temps du bandeau d'alerte).
    manualTable = null;
    manualEew = null;
    manualMissile = null;
    manualCard = null;
    manualText = null;
    // Nouveau séisme : « Aucun risque de tsunami » et « Rapport final » à refaire à la main.
    if (a.category === 'seisme') { noTsunamiOn = false; finalOn = false; }
    if (cancelled) { cancelled = null; document.body.classList.remove('cancelling'); }
    shownId = a.id;
    shownAt = Date.now();
    markFirst(a.id);
    if (sound && !fondLayer && !bannerLayer && window.MAlertSound) {
      const S = window.MAlertSound;
      clearTimeout(arrived.soundTimer);
      if (a.category === 'seisme') {
        // Séisme : « EEW (léger) » pendant le mini bandeau « Alerte de tremblement de terre » (3 s),
        // puis le son de l'alerte.
        S.play(a, { volume: 1, loop: false, file: 'seisme-leger' }).catch(() => {});
        if (S.soundFile(a) !== 'seisme-leger') arrived.soundTimer = setTimeout(() => S.play(a, { volume: 1, loop: false }).catch(() => {}), 3200);
      } else S.play(a, { volume: 1, loop: false }).catch(() => {});
    }
  }

  function handle(msg) {
    switch (msg.type) {
      case 'refused':
        refusedMsg = `⛔ ${msg.message || 'M-Alert refusé par le serveur.'}`;
        status(refusedMsg);
        break;
      case 'hello':
        if (msg.soundDefaults && window.MAlertSound) window.MAlertSound.setDefaults(msg.soundDefaults);
        alerts = (msg.alerts || []).filter(M.isActive);
        alerts.forEach(remember);
        loadLast();
        applyObs(msg.obs);
        sealevel = msg.sealevel || null;
        vig = msg.vigilance || null;
        rivers = msg.rivers || null;
        loadRivers();
        break;
      case 'rivers':
        rivers = msg.rivers || null;
        tableKey = '';
        break;
      case 'sound-defaults':
        if (window.MAlertSound) window.MAlertSound.setDefaults(msg.soundDefaults);
        break;
      case 'vigicrues':
        loadRivers(true);
        break;
      case 'vigilance':
        vig = msg.vigilance || null;
        break;
      case 'sealevel':
        sealevel = msg.sealevel || null;
        tableKey = ''; // tableau refait avec les mesures
        break;
      case 'alert-measures':
        // Mesures affichées ou masquées pour une alerte (M-Alert-sender) : tableau refait, sans son.
        for (const a of alerts) if (a.id === msg.id) a.hideMeasures = Boolean(msg.hideMeasures);
        if (lastAlert && lastAlert.id === msg.id) lastAlert.hideMeasures = Boolean(msg.hideMeasures);
        tableKey = '';
        break;
      case 'obs':
        applyObs(msg.obs, Array.isArray(msg.changed) ? msg.changed : null);
        break;
      case 'alert':
      case 'ring':
        alerts = alerts.filter((x) => x.id !== msg.alert.id).concat(msg.alert);
        arrived(msg.alert);
        remember(msg.alert);
        break;
      case 'obs-show': {
        // Alerte existante montrée depuis M-Alert-sender : rejouée comme à son arrivée (bandeau, carte
        // des côtes, panneau du séisme, écran du missile…), en tête jusqu'à la prochaine alerte.
        const a = msg.alert;
        if (!a || !M.isActive(a)) break;
        alerts = alerts.filter((x) => x.id !== a.id).concat(a);
        forcedId = a.id;
        if (isMap(a)) coastId = null; // carte plein écran à nouveau
        // Style missile choisi pour une autre alerte : écran plein du missile, puis bloc en bas.
        asMissile = msg.style === 'missile' ? a.id : asMissile === a.id ? null : asMissile;
        if (missileLike(a)) { missileId = null; manualCard = null; manualMissile = null; }
        remember(a);
        arrived(a);
        // Style choisi dans M-Alert-sender pour cette alerte (sinon : comme à son arrivée).
        if (msg.style && msg.style !== 'auto' && msg.style !== 'missile') {
          manualBanner = msg.style === 'banner' ? true : false;
          manualMap = msg.style === 'map' ? true : false;
          manualMini = msg.style === 'mini' ? true : false;
          manualBoard = msg.style === 'board' ? true : false;
          manualTable = msg.style === 'table' ? true : false;
          manualText = msg.style === 'text' ? true : null;
          if (['map', 'mini', 'board', 'table'].includes(msg.style)) coastPinned = a.id;
        }
        break;
      }
      case 'update': {
        // Départements ajoutés : clignotants sur la carte du bandeau, noms en jaune, annoncés en haut.
        const before = alerts.find((x) => x.id === msg.alert.id) || (lastAlert && lastAlert.id === msg.alert.id ? lastAlert : null);
        let added = [];
        if (before && !msg.alert.departments.includes('ALL')) {
          const was = new Set(before.departments || []);
          added = (msg.alert.departments || []).filter((c) => !was.has(c));
          if (added.length) addedInfo = { id: msg.alert.id, revision: msg.alert.revision || 0, codes: added, until: Date.now() + ADDED_MS };
        }
        alerts = alerts.filter((x) => x.id !== msg.alert.id);
        if (M.isActive(msg.alert)) alerts.push(msg.alert);
        if (lastAlert && lastAlert.id === msg.alert.id) lastAlert = msg.alert;
        // Séisme montré dans les intensités : ses nouvelles valeurs (même s'il n'est plus en cours).
        if (shindoQuake && shindoQuake.id === msg.alert.id && msg.alert.category === 'seisme') shindoQuake = { ...msg.alert };
        // Séisme : le bandeau ne revient que pour des départements ajoutés (pas pour la magnitude ou
        // les intensités recalculées).
        if (msg.alert.id === shownId && (msg.alert.category !== 'seisme' || added.length)) shownAt = Date.now();
        if (msg.alert.id === coastId) coastShownAt = Date.now();
        // Mise à jour d'une alerte missile (n'importe laquelle) : écran plein à nouveau.
        if (msg.alert.category === 'missile' && wanted(msg.alert)) { missileId = msg.alert.id; missileStart = Date.now(); manualCard = null; }
        break;
      }
      case 'cancel':
      case 'expire':
        alerts = alerts.filter((x) => x.id !== msg.alert.id);
        if (msg.alert.voided && lastAlert && lastAlert.id === msg.alert.id) lastAlert = null;
        // Fausse alerte : annonce de l'annulation (si l'alerte était de celles montrées ici).
        if (msg.type === 'cancel' && msg.alert.voided && wanted({ ...msg.alert, expiresAt: new Date(Date.now() + 60000).toISOString(), cancelledAt: null })) {
          announceCancel(msg.alert);
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

  // Commandes du script OBS (javascript_event d'obs-browser) : { cmd: "banner" } affiche ou masque
  // le bandeau de l'alerte en cours.
  window.addEventListener('malert', (e) => {
    const d = (e && e.detail) || {};
    if (textLayer && d.cmd === 'texte') {
      manualText = document.body.classList.contains('text-off') ? true : false;
      render();
      return;
    }
    if (fondLayer || bannerLayer) return;
    if (d.cmd === 'banner') manualBanner = document.body.classList.contains('show-banner') ? false : true;
    else if (d.cmd === 'map') manualMap = document.body.classList.contains('show-tsunami') ? false : true;
    else if (d.cmd === 'minimap') manualMini = document.body.classList.contains('show-mini') ? false : true;
    else if (d.cmd === 'table') manualTable = document.body.classList.contains('show-table') ? false : true;
    else if (d.cmd === 'missile') manualMissile = document.body.classList.contains('show-missile') || document.body.classList.contains('show-missile-card') ? false : true;
    else if (d.cmd === 'missilecard') {
      // Écran plein du missile : affiché ou masqué (le bloc en bas reste) ; l'alerte missile revient si elle était masquée.
      manualCard = document.body.classList.contains('show-missile-card') ? false : true;
      if (manualCard && manualMissile === false) manualMissile = null;
    }
    else if (d.cmd === 'eew') manualEew = document.body.classList.contains('show-eew') ? false : true;
    else if (d.cmd === 'shindofull' || d.cmd === 'shindoreduced' || d.cmd === 'shindomini') {
      const m = d.cmd === 'shindomini' ? 'mini' : 'full'; // plein écran : réduit avec l'écran
      shindoMode = shindoMode === m ? null : m;
    }
    else if (d.cmd === 'notsunami') noTsunamiOn = noTsunamiOn === true ? false : true;
    else if (d.cmd === 'seavar') noTsunamiOn = noTsunamiOn === 'sea' ? false : 'sea';
    else if (d.cmd === 'final') finalOn = !finalOn;
    else if (d.cmd === 'epicenter') epicenterOn = !epicenterOn;
    else if (d.cmd === 'magnitude') magnitudeOn = !magnitudeOn;
    else if (d.cmd === 'evac') {
      // Bandeau de consigne : affiché ou masqué (réglages du sender gardés ; sans réglage : celui de l'alerte en cours).
      const on = document.body.classList.contains('show-evac');
      evacState = { kind: 'auto', icon: '', lang: 'fr', x: 50, y: 62, scale: 1, ...(evacState || {}), show: !on };
      renderEvac();
    }
    else if (d.cmd === 'webcam') {
      // Webcam choisie dans M-Alert-sender : affichée ou masquée (rien si aucune n'est choisie).
      if (!webcamState || !webcamState.id) { status('Aucune webcam choisie (M-Alert-sender : 📷 Webcams → 🎥 Dans OBS)'); return; }
      webcamState = { ...webcamState, show: !document.body.classList.contains('show-webcam') };
      renderWebcam();
    }
    else return;
    render();
  });

  // Tracés Vigicrues (rivières colorées sur la carte des crues) : relus au changement de niveaux.
  let riversAt = 0;
  async function loadRivers(force) {
    if (!server || (!force && Date.now() - riversAt < 10 * 60000)) return;
    riversAt = Date.now();
    try {
      const r = await fetch(`${server}/api/vigicrues?full=1`);
      if (r.ok) { B.setRivers(await r.json()); drawMaps(true); }
    } catch (_) { /* serveur plus ancien : départements seulement */ }
  }

  let retry = 0;
  let refusedMsg = '';
  function connect() {
    if (!server) { status('Pas de serveur (paramètre server=…)'); return; }
    const ws = new WebSocket(M.toWsUrl(server));
    ws.onopen = () => {
      retry = 0;
      status(`Connecté à ${server}`);
      // Version et empreinte de M-Alert (le serveur peut refuser une version trop ancienne ou modifiée).
      M.appIdentity().then((app) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'subscribe', role: 'obs', departments: deps, all: !deps.length, app })); });
    };
    ws.onmessage = (ev) => { try { handle(JSON.parse(ev.data)); } catch (_) { /* message illisible */ } };
    ws.onclose = (ev) => {
      // Refusée (version trop ancienne ou modifiée) : message, nouvel essai dans 15 minutes.
      if (ev && ev.code === 4003) { status(refusedMsg || 'M-Alert refusé par le serveur : mettez à jour M-Alert.'); setTimeout(connect, 15 * 60000); return; }
      status('Déconnecté — nouvelle tentative…');
      setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
    };
  }

  // Aperçu sans serveur.
  const DEMOS = {
    seisme: { id: 'demo', category: 'seisme', level: 5, departments: ['06', '83', '04', '05'], epicenter: { lat: 43.55, lon: 7.45 }, magnitude: 6.4, depth: 12, originTime: new Date(Date.now() - 20000).toISOString(), title: 'Séisme dans les Alpes-Maritimes' },
    tsunami: { id: 'demo', category: 'tsunami', level: 4, title: 'Tsunami en Méditerranée', departments: ['06', '83', '13', '2B', '2A', '30', '34'], epicenter: { lat: 43.2, lon: 7.8 },
      tsunamiTable: [['06', 4, 'arrived', 3], ['83', 4, 'imminent', 3], ['2B', 4, 15, 2.5], ['13', 2, 35, 1], ['2A', 2, 40, 1], ['30', 2, 55, 0.5], ['34', 2, 60, 0.5]]
        .map(([department, level, arr, height]) => ({ department, level, height, arrival: typeof arr === 'number' ? new Date(Date.now() + arr * 60000).toISOString() : arr })) },
    missile: { id: 'demo', category: 'missile', level: 5, departments: ['2B', '2A', '06', '83', '13'], title: 'Missile en direction de la Corse et de la Provence',
      description: 'Missile lancé. Missile lancé.\nUn missile semble avoir été lancé en direction de la Corse et de la Provence.\nAbritez-vous immédiatement à l\'intérieur d\'un bâtiment ou en sous-sol.' },
    missiles: { id: 'demo', category: 'missile', level: 5, departments: ['57', '55', '54'], title: 'Missile en direction de la Lorraine' },
    vent: { id: 'demo', category: 'meteo', phenomenon: 1, level: 3, departments: ['29', '22', '56', '35', '50'], title: 'Vent violent en Bretagne et dans la Manche',
      forecastTable: { kind: 'vent', rows: [['29', 3, 132], ['22', 3, 118], ['56', 3, 112], ['50', 2, 104], ['35', 2, 98]].map(([department, level, gust]) => ({ department, level, gust })) } },
    submersion: { id: 'demo', category: 'meteo', phenomenon: 9, level: 4, departments: ['29', '56', '44', '85', '17'], title: 'Vagues-submersion sur la façade atlantique',
      forecastTable: { kind: 'submersion', rows: [['29', 4, 9.5, 3], ['56', 4, 8.2, 4], ['44', 3, 7.1, 5], ['85', 3, 6.8, 5], ['17', 2, 5.5, 6]].map(([department, level, hs, h]) => ({ department, level, hs, at: new Date(Date.now() + h * 3600e3).toISOString() })) } },
    inondation: { id: 'demo', category: 'meteo', phenomenon: 2, level: 4, departments: ['30', '34', '07'], title: 'Pluie-inondation : épisode cévenol',
      forecastTable: { kind: 'inondation', rows: [['30', 4, 310, 3.2], ['34', 3, 190, 1.8], ['07', 3, 220, 2.4]].map(([department, level, rain24, river]) => ({ department, level, rain24, river })) } },
  };
  if (q.get('demo') === 'annulation') announceCancel({ category: 'seisme', title: 'Séisme de magnitude 5.2 — Alpes-Maritimes' });
  if (q.get('demo') === 'info') showInfo({ title: 'Exercice M-Alert', body: 'Un exercice d\'alerte aura lieu demain à 10 h. Aucune action n\'est demandée.' });
  const demo = q.get('demo');
  if (demo === 'ajout') {
    // Aperçu : séisme puis mise à jour qui ajoute des départements (au bout de 3 secondes).
    const a = { ...DEMOS.seisme, departments: ['06', '83'], revision: 0, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600e3).toISOString() };
    alerts = [a]; arrived(a); remember(a);
    setTimeout(() => handle({ type: 'update', alert: { ...a, departments: ['06', '83', '04', '05', '13'], revision: 1, updatedAt: new Date().toISOString() } }), 3000);
  }
  if (demo && DEMOS[demo]) {
    const a = { ...DEMOS[demo], ...(q.get('level') ? { level: Number(q.get('level')) } : {}), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600e3).toISOString() };
    alerts = [a];
    // Aperçu du tsunami : avec le séisme qui l'a causé (bandeau réduit en haut à gauche).
    // Aperçu de plusieurs alertes missile de niveaux différents (Avis, Avertissement, Avertissement majeur).
    if (demo === 'missiles') {
      alerts.unshift({ ...a, id: 'demo-m4', level: 4, departments: ['57', '67', '68'], title: 'Missile en direction du Grand Est' },
        { ...a, id: 'demo-m2', level: 2, departments: ['54', '88', '90', '70', '25'], title: '' });
    }
    if (demo === 'tsunami') alerts.unshift({ ...DEMOS.seisme, id: 'demo-seisme', epicenter: a.epicenter, createdAt: new Date(Date.now() - 1000).toISOString(), expiresAt: a.expiresAt });
    arrived(a);
    remember(a);
  } else if (!demo) connect(); // aperçu d'une carte d'information (ci-dessus) : pas de serveur

  // Côtes du tsunami : clignotement ; bandeau : masqué après « hold » secondes.
  setInterval(() => {
    blink = !blink;
    if (infoUntil && Date.now() > infoUntil) { infoUntil = 0; document.body.classList.remove('show-info'); }
    if (cancelled && !cancelOn()) { cancelled = null; document.body.classList.remove('cancelling'); }
    render();
    if (evacState && evacState.show) renderEvac(); // alternance des langues, alerte en cours (« auto »)
  }, 700);
  // Clignotement de la carte missile : seule la carte est redessinée, au changement d'état.
  setInterval(() => { blinkMissileMap(); drawMaps(false); }, 50);
})();
