/* M-Alert — application mobile (Capacitor). Chargé avant i18n.js et app.js, seulement dans l'application.
 *
 * Android : relie la page au service natif qui reçoit les alertes en arrière-plan.
 *   - Réglages de réception (serveur, départements, niveau, catégories, seuils des séismes…)
 *     transmis au service à chaque enregistrement des réglages, avec le contour simplifié des
 *     départements suivis (intensité d'un séisme chez soi calculée par le service).
 *   - « Recevoir les alertes en arrière-plan » (réglages) : démarre ou arrête le service.
 * iOS : notifications natives (plugin MAlertNotify de l'application) : urgentes, critiques, avec le
 *   son d'alerte mobile ; réception en arrière-plan, application fermée, par une connexion native
 *   (AlertListener.swift) qui reste active grâce à la localisation (sans son silencieux), comme
 *   l'application Clip d'AltStore. Mêmes réglages que le service Android.
 */
(function () {
  'use strict';

  const C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  const platform = C.getPlatform();
  document.documentElement.classList.add('mobile-app', `mobile-${platform}`);
  const reg = (name) => (C.registerPlugin ? C.registerPlugin(name) : (C.Plugins || {})[name]);
  const plugin = platform === 'android' ? reg('MAlertNative') : null;
  // Version de l'application (écrite par copy-web.js) : recherche des mises à jour.
  const iosPlugin = platform === 'ios' ? reg('MAlertNotify') : null;
  // build : commit de la Release (version remplacée = même numéro, autre commit).
  const mobile = { platform, version: '__MALERT_VERSION__', build: '__MALERT_BUILD__', background: Boolean(plugin || iosPlugin), onTap: null };
  if (plugin) mobile.openUrl = (url) => plugin.openUrl({ url });
  window.MAlertMobile = mobile;

  // Plugin absent (application iOS plus ancienne) : la page fonctionne sans notifications natives.
  if (iosPlugin) {
    const notify = iosPlugin;
    mobile.notify = (o) => notify.notify(o);
    mobile.permission = () => notify.permission();
    mobile.requestPermission = () => notify.requestPermission();
    mobile.openSettings = () => notify.openSettings();
    mobile.openUrl = (url) => notify.openUrl({ url });
    mobile.status = () => notify.status();
    mobile.configure = (o) => notify.configure(o);
    // Notification touchée : la page (déjà ouverte par iOS) montre l'alerte.
    try {
      if (notify.addListener) {
        Promise.resolve(notify.addListener('tap', () => {
          const fn = mobile.onTap;
          mobile.onTap = null;
          if (fn) fn();
        })).catch(() => {});
      }
    } catch (_) {
      // notification touchée : simple ouverture de l'application
    }
  }

  /** Contour simplifié (au plus ~150 points) des départements suivis, pour le service Android. */
  function areas(s) {
    const codes = [s.department, ...(s.extra || [])].filter(Boolean);
    const out = {};
    for (const f of (window.MALERT_DEPARTMENTS || { features: [] }).features) {
      if (!codes.includes(f.properties.code)) continue;
      const g = f.geometry || {};
      const rings = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []).flatMap((p) => p);
      const total = rings.reduce((n, r) => n + r.length, 0);
      const step = Math.max(1, Math.ceil(total / 150));
      out[f.properties.code] = rings.map((r) => r.filter((_, i) => i % step === 0).map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]))
        .filter((r) => r.length >= 3);
    }
    return out;
  }

  const KEY = 'malert.settings';
  // iOS : réglages copiés dans le trousseau (gardé après la suppression de l'application). Après une
  // réinstallation (réglages vides), ils sont rétablis et la page est rechargée.
  const BACKUP_KEYS = [KEY, 'malert.timezone', 'malert.seen', 'malert.noticeSeen', 'malert.alerted'];
  let backupTimer = null;
  function backup() {
    if (!iosPlugin || !iosPlugin.saveBackup) return;
    clearTimeout(backupTimer);
    backupTimer = setTimeout(() => {
      const data = {};
      for (const k of BACKUP_KEYS) { const v = localStorage.getItem(k); if (v !== null) data[k] = v; }
      // Trop grand : seulement les réglages (les alertes déjà vues ne sont qu'un confort).
      let text = JSON.stringify(data);
      if (text.length > 150000) text = JSON.stringify({ [KEY]: data[KEY], ...(data['malert.timezone'] ? { 'malert.timezone': data['malert.timezone'] } : {}) });
      if (data[KEY]) iosPlugin.saveBackup({ data: text }).catch(() => {});
    }, 500);
  }
  if (iosPlugin && iosPlugin.loadBackup) {
    let empty = true;
    try { empty = !localStorage.getItem(KEY); } catch (_) { empty = false; }
    if (empty) {
      iosPlugin.loadBackup().then((r) => {
        if (!r || !r.data) return;
        const data = JSON.parse(r.data);
        if (!data || !data[KEY] || localStorage.getItem(KEY)) return;
        for (const [k, v] of Object.entries(data)) if (BACKUP_KEYS.includes(k)) localStorage.setItem(k, v);
        location.reload();
      }).catch(() => {});
    } else {
      backup(); // réglages d'une version précédente : première copie dans le trousseau
    }
  }
  async function push() {
    const target = plugin || (mobile.configure ? { configure: mobile.configure } : null);
    if (!target) return;
    // Version et empreinte de l'application : le service de fond les donne au serveur (?v=…&b=…).
    let app = null;
    try { app = window.MAlert && window.MAlert.appIdentity ? await window.MAlert.appIdentity() : null; } catch (_) { app = null; }
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; }
    if (!s.serverUrl && window.MALERT_CONFIG) s.serverUrl = window.MALERT_CONFIG.serverUrl;
    s.quakeAreas = areas(s);
    // Langues des notifications de séisme (comme la page).
    if (window.MAlertI18n) {
      s.notifLangs = window.MAlertI18n.notifLangs(s).filter(Boolean);
      s.kindNames = window.MAlertI18n.kindNames(s); // « L'alerte de <phénomène> … a été annulée »
    }
    if (app) { s.appVersion = app.version || ''; s.appBuild = app.build || ''; }
    target.configure({ settings: JSON.stringify(s), background: s.mobileBackground !== false }).catch(() => {});
  }
  // Réglages enregistrés par la page : le service suit.
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    setItem.call(this, k, v);
    if (this === window.localStorage && k === KEY) setTimeout(push, 0);
    if (this === window.localStorage && BACKUP_KEYS.includes(k)) backup();
  };
  document.addEventListener('DOMContentLoaded', push);
})();
