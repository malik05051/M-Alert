/* M-Alert — application mobile (Capacitor) : relie la page au service Android qui reçoit les
 * alertes en arrière-plan. Chargé avant app.js, seulement dans l'application mobile.
 *   - Réglages de réception (serveur, départements, niveau, catégories…) transmis au service à
 *     chaque enregistrement des réglages.
 *   - « Recevoir les alertes en arrière-plan » (réglages) : démarre ou arrête le service.
 * Sur iOS, la page fonctionne application ouverte (la réception en arrière-plan demande un compte
 * développeur Apple payant : utilisez plutôt M-Alert ajouté à l'écran d'accueil depuis Safari,
 * qui reçoit les notifications Web Push).
 */
(function () {
  'use strict';

  const C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  const platform = C.getPlatform();
  document.documentElement.classList.add('mobile-app', `mobile-${platform}`);
  const plugin = platform === 'android' ? (C.registerPlugin ? C.registerPlugin('MAlertNative') : (C.Plugins || {}).MAlertNative) : null;
  window.MAlertMobile = { platform, background: Boolean(plugin) };

  const KEY = 'malert.settings';
  function push() {
    if (!plugin) return;
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; }
    if (!s.serverUrl && window.MALERT_CONFIG) s.serverUrl = window.MALERT_CONFIG.serverUrl;
    plugin.configure({ settings: JSON.stringify(s), background: s.mobileBackground !== false }).catch(() => {});
  }
  // Réglages enregistrés par la page : le service suit.
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    setItem.call(this, k, v);
    if (this === window.localStorage && k === KEY) setTimeout(push, 0);
  };
  document.addEventListener('DOMContentLoaded', push);
})();
