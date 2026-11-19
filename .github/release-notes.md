## M-Alert 3.1.1

- **Consignes des alertes** : « Afficher les consignes » ne masque plus le tableau (vagues, vent, pluie, tsunami). Les consignes s'affichent sous la description, le tableau reste visible avec son propre défilement, et « Masquer les consignes » les referme.
- **Mode streamer** (Réglages > Application) : votre département n'apparaît plus à l'écran (contour sur la carte, « Mon département », 📍, intensité et distance « chez vous ») et il est flouté dans les réglages ; les alertes et les notifications ne changent pas.
- **Incrustation OBS : mesures en plein écran**, comme la NHK : arrivée de la 1re vague et hauteur par département, regroupés par niveau (vigilance orange, jaune…), avec les mesures des marégraphes et des bouées ; pages qui défilent (« 1 / 3 ») et l'heure. Elles s'affichent après la carte des tsunamis et vagues-submersion, ou avec « Afficher (plein écran) » du tableau des mesures dans M-Alert-sender.
- **Incrustation OBS : alerte la plus grave d'abord** : avec plusieurs alertes vagues-submersion, la carte, la mini-carte et les mesures montrent celle de plus haut niveau (une vigilance orange passe avant une jaune plus récente), ou celle choisie dans M-Alert-sender.
- **Incrustation OBS : mini-carte déplaçable** des tsunamis et vagues-submersion : glisser et zoomer dans M-Alert-sender (comme la carte des intensités), ou cadrer les côtes en alerte.
- Script OBS mis à jour (version de la page 3.1.1-2) : remplacez `m-alert.lua` dans OBS.
