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
  if (textLayer) document.body.classList.add('layer-texte');
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
  let manualEew = null;
  // Alerte missile (comme la NHK) : écran plein pendant cardSeconds (à chaque mise à jour aussi), puis
  // bloc en bas sur l'image, tant que l'alerte est en cours.
  const cardSeconds = q.has('cardSeconds') ? Math.max(0, Number(q.get('cardSeconds')) || 0) : 20;
  let manualMissile = null;
  let missileId = null;
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
  // Alerte annulée (fausse alerte) : cadre d'annulation en bas à la place du bandeau, texte du haut
  // « Alerte de … annulée », pendant « hold » secondes (l'écran réduit reste le temps de l'annonce).
  let cancelled = null; // { alert, until }
  const cancelOn = () => Boolean(cancelled && Date.now() < cancelled.until);
  function cancelLines(a) {
    const name = (M.alertKind(a || {}).name || 'alerte').replace(/^./, (c) => c.toLowerCase());
    return [`Alerte de ${name} annulée`, 'Aucun danger est attendu.'];
  }
  // Durée de l'annonce d'annulation (secondes, paramètre cancelHold ; par défaut celle du bandeau).
  const cancelHold = q.has('cancelHold') ? Math.max(3, Number(q.get('cancelHold')) || 30) : (hold || 60);
  function announceCancel(a) {
    cancelled = { alert: a, until: Date.now() + cancelHold * 1000 };
    manualBanner = null;
    document.body.classList.add('cancelling');
    showInfo(B.cancelledInfo(a), cancelHold);
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
  window.addEventListener('obsSceneChanged', (e) => {
    if (reduceScene && e.detail && e.detail.name) document.body.classList.toggle('reduced', e.detail.name === reduceScene);
  });
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
  function coastRows(a) {
    if (a.category === 'tsunami') {
      return (a.tsunamiTable || []).map((r) => ({
        level: r.level, name: depName(r.department),
        when: r.arrival === 'arrived' ? 'Déjà arrivé' : r.arrival === 'imminent' ? 'Arrivée imminente' : r.arrival
          ? (new Date(r.arrival).getTime() <= Date.now() ? (r.estimated ? 'Probablement arrivé' : 'Déjà arrivé') : `${r.estimated ? '≈ ' : ''}${hourText(r.arrival)}`) : '—',
        value: typeof r.height === 'number' ? `${r.heightEstimated ? '≈' : ''}${fr(r.height)} m` : '',
      }));
    }
    const set = new Set(a.departments || []);
    return ((a.forecastTable && a.forecastTable.rows) || []).filter((r) => set.has('ALL') || set.has(r.department)).map((r) => ({
      level: r.level, name: depName(r.department),
      when: r.at ? `pic ${hourText(r.at)}` : r.from ? `dès ${hourText(r.from)}` : '—',
      value: r.hs > 0 ? `${fr(r.hs)} m` : typeof r.water === 'number' ? `mer ${r.water >= 0 ? '+' : '−'}${fr(Math.abs(r.water), 2)} m` : '',
    }));
  }
  function renderCoastTable(a) {
    const key = `${a.id}:${a.revision || 0}:${Math.floor(Date.now() / 60000)}`;
    const tsu = a.category === 'tsunami';
    const LV = tsu ? TSU_LEVELS : SURGE_LEVELS;
    if (key !== tableKey) {
      const keep = tableKey.split(':').slice(0, 2).join(':') === key.split(':').slice(0, 2).join(':');
      tableKey = key;
      const rows = coastRows(a).sort((x, y) => y.level - x.level);
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
    const html = `<div class="ct-title">${tsu ? 'Arrivée prévue du tsunami' : 'Vagues-submersion prévues'}</div>`
      + `<div class="ct-level" style="background:${bg};color:${fg}">${esc(name)}</div>`
      + pg.rows.map((r) => `<div class="ct-row"><span class="ct-name">${esc(r.name)}</span><span class="ct-when">${esc(r.when)}</span>`
        + `<span class="ct-val" style="background:${bg};color:${fg}">${esc(r.value)}</span></div>`).join('')
      + (tablePages.length > 1 ? `<div class="ct-page">${tablePage + 1}/${tablePages.length}</div>` : '');
    if (el.innerHTML !== html) el.innerHTML = html;
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
      $('eew').innerHTML = `<div class="eew-red">Alerte sismique précoce</div><div class="eew-yellow">${esc(where)}</div>`
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
  const MISSILE_COLORS = { 2: ['#ffe11a', '#111'], 4: ['#e0141e', '#fff'], 5: ['#fe05fd', '#fff'] };
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
    const descs = [...new Set(sorted.map((m) => String(m.description || '').trim().replace(/\.$/, '')).filter(Boolean))];
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
      return `<div class="mz-grp"><span class="mz-lv" style="background:${bg};color:${fg}">${esc(missileLevelName(g.level))}</span>${list(g.zones)}</div>`;
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
      $('missileCard').querySelector('.mc-msg').textContent = `Missile lancé. Missile lancé. ${v.titles.map((t) => `${t}. `).join('')}${v.descs.map((t) => `${t}. `).join('')}Abritez-vous à l'intérieur d'un bâtiment ou en sous-sol.`;
      $('missileCard').querySelector('.mc-zones').innerHTML = missileZonesHtml(v);
      $('missileCard').querySelector('.mc-time').textContent = `Reçu le ${v.when.toLocaleDateString('fr-FR', { timeZone: M.timeZone() })} à ${M.formatTime(v.when.toISOString()).replace(':', ' h ')}`;
      $('missileLower').querySelector('.ml-msg').innerHTML = ['Missile lancé. Missile lancé.', ...v.titles.slice(0, 2), 'Abritez-vous à l\'intérieur d\'un bâtiment ou en sous-sol.']
        .map((l) => `<div>${esc(l)}</div>`).join('');
      $('missileLower').querySelector('.ml-zones').innerHTML = missileZonesHtml(v);
      // Légende de la carte : les niveaux en cours.
      $('missileLegend').innerHTML = v.groups.map((g) => g.level).map((l) => `<span><i style="background:${missileColors({ level: l })[0]}"></i>${esc(missileLevelName(l))}</span>`).join('');
      $('missileFlash').querySelector('.mf-text').textContent = v.top.title || M.alertLevelLabel(v.top);
    }
    // Bloc du bas affiché : la liste des zones est réduite si elle ne tient pas (beaucoup de départements).
    if (phase === 2 && missileFitKey !== v.key) {
      missileFitKey = v.key;
      const z = $('missileLower').querySelector('.ml-zones');
      z.style.fontSize = '';
      let size = parseFloat(getComputedStyle(z).fontSize);
      const min = size * 0.55;
      while (z.scrollHeight > z.clientHeight + 1 && size > min) { size -= 1; z.style.fontSize = `${size}px`; }
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
    if (fondLayer) { renderFond(textLayer ? manualAlert() : a); return; }
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
    const coastList = alerts.filter(wanted).filter(isCoast)
      .sort((x, y) => ((y.category === 'tsunami') - (x.category === 'tsunami')) || (y.updatedAt || y.createdAt).localeCompare(x.updatedAt || x.createdAt));
    const lastCoast = isCoast(lastAlert) ? lastAlert : null;
    const tsu = manualMap === false ? null : manualMap === true ? coastList[0] || lastCoast : tsunamiMap ? coastList[0] || null : null;
    if (a && a.id !== shownId) { shownId = a.id; shownAt = Date.now(); }
    if (a) markFirst(a.id);
    if (tsu && tsu.id !== coastId) { coastId = tsu.id; coastStart = Date.now(); coastShownAt = Date.now(); }
    // Alerte missile : écran plein, puis bloc en bas (pas de bandeau ni d'écran réduit pour elle).
    const missiles = alerts.filter(wanted).filter((x) => x.category === 'missile')
      .sort((x, y) => (y.updatedAt || y.createdAt).localeCompare(x.updatedAt || x.createdAt));
    // Toutes les alertes missile en cours sont affichées ensemble (niveaux différents).
    const missileList = manualMissile === false ? [] : missiles.length ? missiles : manualMissile === true && lastMissile ? [lastMissile] : [];
    const lastMissile = lastAlert && lastAlert.category === 'missile' ? lastAlert : null;
    const missile = missileList[0] || null;
    if (missile && missile.id !== missileId) { missileId = missile.id; missileStart = Date.now(); }
    const mPhase = !missile ? 0 : Date.now() - missileStart < cardSeconds * 1000 ? 1 : 2;
    document.body.classList.toggle('show-missile-card', mPhase === 1);
    document.body.classList.toggle('show-missile', mPhase === 2);
    if (mPhase) renderMissile(missileList, mPhase); else missileShown = null;
    // Phase 1 : carte plein écran (le bandeau d'une autre alerte, le séisme, réduit en haut à gauche).
    // Phase 2 : mini-carte et tableau des mesures sur l'image, jusqu'à la fin de « hold ».
    let phase = 0;
    if (tsu) {
      if (manualMap === true || Date.now() - coastStart < mapSeconds * 1000) phase = 1;
      else if (hold === 0 || Date.now() - coastShownAt < hold * 1000 || stays(tsu)) phase = 2;
    }
    const mapOn = phase === 1;
    // Avec la carte des tsunamis : bandeau de la dernière autre alerte (le séisme), réduit en haut à gauche.
    const others = mapOn ? alerts.filter(wanted).filter((x) => x.id !== tsu.id && !isCoast(x))
      .sort((x, y) => (y.updatedAt || y.createdAt).localeCompare(x.updatedAt || x.createdAt)) : [];
    // Carte plein écran ou tableau : pas de bandeau (le séisme est dans le panneau à gauche).
    const ba = phase > 0 || mPhase > 0 || (a && a.category === 'missile') ? null : a;
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
    if (mapOn) B.drawTsunamiMap($('tsunami'), tsu, blink);
    // Mini-carte et tableau : après la carte plein écran, ou à la main.
    const coastAny = tsu || coastList[0] || lastCoast;
    const miniOn = !mapOn && (manualMini === true ? Boolean(coastAny) : manualMini === false ? false : phase === 2);
    const tableOn = !mapOn && (manualTable === true ? Boolean(coastAny) : manualTable === false ? false : phase === 2);
    document.body.classList.toggle('show-mini', miniOn);
    document.body.classList.toggle('show-table', tableOn);
    if (miniOn) B.drawTsunamiMap($('miniMap'), coastAny, blink, { width: 960, height: 540 });
    if (tableOn) renderCoastTable(coastAny);
    // Panneau « Alerte sismique précoce » à gauche : séisme en cours, écran réduit (ou tableau), ou à la main.
    const quakes = alerts.filter(wanted).filter((x) => x.category === 'seisme')
      .sort((x, y) => (y.updatedAt || y.createdAt).localeCompare(x.updatedAt || x.createdAt));
    const quake = quakes[0] || null;
    const quakeAny = quake || (lastAlert && lastAlert.category === 'seisme' ? lastAlert : null);
    const quakeRecent = quake && (hold === 0 || Date.now() - Date.parse(quake.updatedAt || quake.createdAt) < hold * 1000 || phase > 0);
    // Pas en même temps que le bandeau du bas (même alerte deux fois).
    const eewOn = !mapOn && !cancelOn() && (manualEew === true ? Boolean(quakeAny) : manualEew === false ? false
      : eewAuto && !bannerOn && Boolean(quakeRecent || stays(quake)) && Boolean(prevScene || phase === 2));
    document.body.classList.toggle('show-eew', eewOn);
    if (eewOn) renderEew(manualEew === true ? quakeAny : quake);
  }

  function arrived(a) {
    if (!wanted(a)) return;
    // Séisme : « Alerte de tremblement de terre » en haut pendant 3 secondes.
    if (a.category === 'seisme' && !fondLayer && !bannerLayer) {
      document.body.classList.add('show-quake-top');
      clearTimeout(arrived.quakeTimer);
      arrived.quakeTimer = setTimeout(() => document.body.classList.remove('show-quake-top'), 3000);
    }
    manualBanner = null;
    manualMap = null;
    manualMini = null;
    manualTable = null;
    manualEew = null;
    manualMissile = null;
    if (cancelled) { cancelled = null; document.body.classList.remove('cancelling'); }
    shownId = a.id;
    shownAt = Date.now();
    markFirst(a.id);
    if (sound && !fondLayer && !bannerLayer && window.MAlertSound) window.MAlertSound.play(a, { volume: 1, loop: false }).catch(() => {});
  }

  function handle(msg) {
    switch (msg.type) {
      case 'hello':
        alerts = (msg.alerts || []).filter(M.isActive);
        alerts.forEach(remember);
        loadLast();
        break;
      case 'alert':
      case 'ring':
        alerts = alerts.filter((x) => x.id !== msg.alert.id).concat(msg.alert);
        arrived(msg.alert);
        remember(msg.alert);
        break;
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
        // Séisme : le bandeau ne revient que pour des départements ajoutés (pas pour la magnitude ou
        // les intensités recalculées).
        if (msg.alert.id === shownId && (msg.alert.category !== 'seisme' || added.length)) shownAt = Date.now();
        if (msg.alert.id === coastId) coastShownAt = Date.now();
        // Mise à jour d'une alerte missile (n'importe laquelle) : écran plein à nouveau.
        if (msg.alert.category === 'missile' && wanted(msg.alert)) { missileId = msg.alert.id; missileStart = Date.now(); }
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
    if (fondLayer || bannerLayer) return;
    if (d.cmd === 'banner') manualBanner = document.body.classList.contains('show-banner') ? false : true;
    else if (d.cmd === 'map') manualMap = document.body.classList.contains('show-tsunami') ? false : true;
    else if (d.cmd === 'minimap') manualMini = document.body.classList.contains('show-mini') ? false : true;
    else if (d.cmd === 'table') manualTable = document.body.classList.contains('show-table') ? false : true;
    else if (d.cmd === 'missile') manualMissile = document.body.classList.contains('show-missile') || document.body.classList.contains('show-missile-card') ? false : true;
    else if (d.cmd === 'eew') manualEew = document.body.classList.contains('show-eew') ? false : true;
    else return;
    render();
  });

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
    seisme: { id: 'demo', category: 'seisme', level: 5, departments: ['06', '83', '04', '05'], epicenter: { lat: 43.55, lon: 7.45 }, magnitude: 6.4, depth: 12, originTime: new Date(Date.now() - 20000).toISOString(), title: 'Séisme dans les Alpes-Maritimes' },
    tsunami: { id: 'demo', category: 'tsunami', level: 4, title: 'Tsunami en Méditerranée', departments: ['06', '83', '13', '2B', '2A', '30', '34'], epicenter: { lat: 43.2, lon: 7.8 },
      tsunamiTable: [['06', 4, 'arrived', 3], ['83', 4, 'imminent', 3], ['2B', 4, 15, 2.5], ['13', 2, 35, 1], ['2A', 2, 40, 1], ['30', 2, 55, 0.5], ['34', 2, 60, 0.5]]
        .map(([department, level, arr, height]) => ({ department, level, height, arrival: typeof arr === 'number' ? new Date(Date.now() + arr * 60000).toISOString() : arr })) },
    missile: { id: 'demo', category: 'missile', level: 5, departments: ['2B', '2A', '06', '83', '13'], title: 'Missile en direction de la Corse et de la Provence' },
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
  }, 700);
  // Clignotement de la carte missile : seule la carte est redessinée, au changement d'état.
  setInterval(blinkMissileMap, 50);
})();
