## M-Alert 3.0.1

- **Alertes missile** : nouvelle catégorie 🚀 Missile, avec trois niveaux comme le tsunami : **Avis** (jaune), **Avertissement** (rouge) et **Avertissement majeur** (rose).
  - **Son** : celui de la vigilance rouge, pour tous les niveaux. Même chose dans l'application Android et pour Soundux dans M-Alert-sender.
  - **Consignes** : abritez-vous immédiatement dans un bâtiment solide ou en sous-sol, loin des fenêtres.
  - **Envoi** : depuis M-Alert-sender. Il n'existe pas de flux public des alertes FR-Alert à automatiser.
  - **Incrustation OBS, comme la NHK (J-Alert)** :
    - d'abord un écran plein « Informations de protection civile » : barre de la couleur du niveau, message « Missile lancé. Missile lancé. … Abritez-vous… », zones concernées et heure de réception. Il réapparaît à chaque mise à jour ;
    - puis, sur l'image, le bloc « M-Alert · Informations de protection civile » en bas, avec le message, les zones M-Alert concernées et une carte des zones en jaune ;
    - en haut à droite, l'encart « Alerte » avec le titre, et la consigne « Intérieur » / « Extérieur » en alternance.

    Pas d'écran réduit pour un missile. La durée de l'écran plein se règle, et un bouton du script affiche ou masque l'alerte missile.
- **Incrustation OBS** :
  - Séisme et tsunami : l'écran réduit reste tant que l'alerte est en cours. Le bandeau du bas part après sa durée, puis le panneau « Alerte sismique précoce » à gauche prend le relais.
  - Panneau de gauche :
    - lisible, avec un département par ligne ;
    - les départements défilent en pages quand ils ne tiennent pas ;
    - il n'apparaît pas en même temps que le bandeau du bas ;
    - il ne cache plus le tableau du tsunami.
  - Séisme mis à jour : le bandeau ne revient plus quand la magnitude ou les intensités changent, et le texte du haut l'annonce (« La magnitude a changé », « Les intensités ont changé »…).
  - Tsunami et vagues-submersion : le tableau et la mini-carte sont placés contre les bords quand l'écran n'est pas réduit, et ne sont plus décalés.
  - Les réglages du script OBS sont rangés en groupes : les cases utilisent toute la largeur et les explications s'affichent au survol.
