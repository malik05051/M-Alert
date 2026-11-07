## M-Alert 3.0.1

- **Vigilances Météo-France et alertes M-Alert réunies** : dans « Alertes en cours », une vigilance Météo-France est intégrée à l'alerte M-Alert du même phénomène qui couvre ses départements, au lieu d'avoir sa propre ligne. L'alerte affiche alors « 🇫🇷 Météo-France : » avec la couleur et les départements de la vigilance, aussi dans sa bannière. Vont ensemble : vent violent et tempête ; pluie-inondation, crues et inondation ; vagues-submersion et forte houle. Les départements sans alerte M-Alert gardent leur ligne Météo-France.
- **Pluie-inondation** : quand l'alerte vient d'une crue de rivière avec très peu de pluie prévue, son titre n'annonce plus « jusqu'à 2 mm de pluie » mais la crue. Les vigilances crues de Météo-France ne font plus d'alerte « Vigilance crues » à part : elles sont dans l'alerte pluie-inondation.
- **Alertes missile** : nouvelle catégorie 🚀 Missile, avec trois niveaux comme le tsunami : **Avis** (jaune), **Avertissement** (rouge) et **Avertissement majeur** (rose).
  - **Son** : celui de la vigilance rouge, pour tous les niveaux. Même chose dans l'application Android et pour Soundux dans M-Alert-sender.
  - **Consignes** : abritez-vous immédiatement dans un bâtiment solide ou en sous-sol, loin des fenêtres.
  - **Envoi** : depuis M-Alert-sender. Il n'existe pas de flux public des alertes FR-Alert à automatiser.
  - **Incrustation OBS, comme la NHK (J-Alert)** :
    - d'abord un écran plein « Informations de protection civile » : barre de la couleur du niveau, message « Missile lancé. Missile lancé. … Abritez-vous… », zones concernées et heure de réception. Il réapparaît à chaque mise à jour ;
    - puis, sur l'image, le bloc « M-Alert · Informations de protection civile » en bas, avec le message, les zones M-Alert concernées et une carte des zones ;
    - en haut à droite, l'encart « Alerte » avec le titre, et la consigne « Intérieur » / « Extérieur » en alternance ;
    - la couleur du niveau sur la barre (avec son nom), les bandeaux, l'encart « Alerte » et les zones concernées ;
    - sur la carte, les départements visés clignotent comme à la NHK ;
    - plusieurs alertes missile de niveaux différents sont montrées ensemble : chaque département dans la couleur de son niveau le plus haut, zones rangées par niveau, légende sous la carte ;
    - le message est la description de l'alerte écrite dans M-Alert-sender, qui propose un message type.

    Pas d'écran réduit pour un missile. La durée de l'écran plein se règle. Des boutons du script affichent ou masquent l'alerte missile, et son écran plein seul.
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
  - L'alerte ne s'affiche plus en double avec l'écran réduit, même si un réglage du script change, si OBS s'ouvre sur la scène réduite ou si l'incrustation est dans un groupe.
