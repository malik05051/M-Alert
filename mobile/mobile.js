/* M-Alert — application mobile (Capacitor). Chargé avant i18n.js et app.js, seulement dans l'application.
 *
 * Android : relie la page au service natif qui reçoit les alertes en arrière-plan.
 *   - Réglages de réception (serveur, départements, niveau, catégories, seuils des séismes…)
 *     transmis au service à chaque enregistrement des réglages, avec le contour simplifié des
 *     départements suivis (intensité d'un séisme chez soi calculée par le service).
 *   - « Recevoir les alertes en arrière-plan » (réglages) : démarre ou arrête le service.
 * iOS : notifications natives (plugin MAlertNotify de l'application) : urgentes, critiques, avec le
 *   son d'alerte mobile ; réception en arrière-plan, application fermée, par une connexion native
 *   (AlertListener.swift) qui reste active grâce à la localisation et à un son silencieux, comme
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
  const mobile = { platform, version: '__MALERT_VERSION__', background: Boolean(plugin) || platform === 'ios', onTap: null };
  if (plugin) mobile.openUrl = (url) => plugin.openUrl({ url });
  window.MAlertMobile = mobile;

  if (platform === 'ios') {
    const notify = reg('MAlertNotify');
    mobile.notify = (o) => notify.notify(o);
    mobile.permission = () => notify.permission();
    mobile.requestPermission = () => notify.requestPermission();
    mobile.openSettings = () => notify.openSettings();
    mobile.openUrl = (url) => notify.openUrl({ url });
    mobile.status = () => notify.status();
    mobile.configure = (o) => notify.configure(o);
    // Notification touchée : la page (déjà ouverte par iOS) montre l'alerte.
    if (notify.addListener) {
      notify.addListener('tap', () => {
        const fn = mobile.onTap;
        mobile.onTap = null;
        if (fn) fn();
      });
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
  function push() {
    const target = plugin || (mobile.configure ? { configure: mobile.configure } : null);
    if (!target) return;
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; }
    if (!s.serverUrl && window.MALERT_CONFIG) s.serverUrl = window.MALERT_CONFIG.serverUrl;
    s.quakeAreas = areas(s);
    // Langues des notifications de séisme (comme la page).
    if (window.MAlertI18n) s.notifLangs = window.MAlertI18n.notifLangs(s).filter(Boolean);
    target.configure({ settings: JSON.stringify(s), background: s.mobileBackground !== false }).catch(() => {});
  }
  // Réglages enregistrés par la page : le service suit.
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    setItem.call(this, k, v);
    if (this === window.localStorage && k === KEY) setTimeout(push, 0);
  };
  document.addEventListener('DOMContentLoaded', push);
})();
