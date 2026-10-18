Alertes météo en temps réel par département, avec la carte de vigilance Météo-France.

## Nouveautés de la 2.3.0
- **Alertes vent violent automatiques**, d'après les prévisions de rafales sur 10 jours : modèles de Météo-France (AROME, ARPEGE) jusqu'à J+4, puis modèle européen du CEPMMT (ECMWF) jusqu'à J+9, en un point à l'intérieur de chaque département et un point sur la côte des départements littoraux, actualisées toutes les heures. Les alertes portent la mention « 💨 Prévision de rafales », se mettent à jour avec la prévision (départements, rafales, fin) et se lèvent quand le vent n'est plus prévu.
- **M-Alert-sender** : nouvel onglet **💨 Vent violent** avec le tableau des rafales maximales prévues par département et par jour, les alertes proposées (Diffuser, Modifier avant d'envoyer, Ignorer) et les règles : seuils de rafales par niveau (dans les terres et sur la côte), envoi à valider ou automatique pour les jours proches, nombre de jours.

## Nouveautés de la 2.2.0
- **Nouvelle catégorie 🚨 Attentat** (à part de la météo), avec les trois stades du nouveau plan Vigipirate (en vigueur depuis le 22 juin 2026) : Vigilance (jaune), Vigilance renforcée (rouge) et Alerte attentat (rose), et les consignes officielles « s'échapper, se cacher, alerter » (17 ou 112).
- **Nouveau phénomène météo 🌀 Tempête**, avec ses consignes (rester à l'abri, fixer les objets, ne pas toucher aux fils électriques tombés, pas de groupe électrogène à l'intérieur).
- **Plusieurs types de pollution** dans la catégorie 🌫️ Pollution : pollution de l'air (avec le polluant : particules PM10 ou PM2,5, ozone, dioxyde d'azote, dioxyde de soufre, plusieurs polluants), de l'eau (eau du robinet), marine / du littoral, des sols et pollution chimique, chacune avec ses consignes ; le type et le polluant s'affichent dans l'alerte.
- **M-Alert-sender : relances planifiées** : « 🕒 Planifier une relance » sur une alerte en cours la relance à l'heure choisie, une seule fois ou à intervalles réguliers (toutes les 15 min, 30 min, heures, 2 h, 6 h, tous les jours, ou toutes les N minutes) jusqu'à la fin de l'alerte ; chaque relance rejoue le son, la fenêtre d'alerte et la notification (push compris). La prochaine relance s'affiche sur l'alerte, avec « ✕ Annuler ».

## Nouveautés de la 2.1.1
- **Intensités sur la carte pendant un séisme**, comme les cartes japonaises : chaque département affiche l'intensité estimée (échelle shindo, 1 à 7) tant que l'alerte séisme est en cours. M-Alert peut corriger l'intensité d'un département si le calcul se trompe. Option « intensité estimée sur la carte » dans les réglages pour les masquer.
- **Annulation d'une alerte séisme ou tsunami** (fausse alerte) : M-Alert affiche un bandeau « ❌ Alerte annulée » avec la raison, joue le son EEW (eew.mp3) pour un séisme annulé, et envoie une notification ; le tsunami calculé à partir d'un séisme annulé est annulé aussi.
- **Source des alertes séisme manuelles** : une alerte séisme saisie par M-Alert peut indiquer sa source (EMSC, stations sismiques M-Alert, BCSF-RéNaSS, USGS…), affichée sous le titre.
- **M-Alert-sender** : les séismes récents s'affichent par pages de 10, avec « Précédents » et « Plus anciens » ; un clic sur une croix de la carte ouvre la bonne page.

## Nouveautés de la 2.1.0
- **Hauteur des vagues estimée** pour les tsunamis calculés automatiquement, affichée « ≈ » avec la hauteur possible dans les ports et les baies (« ≈1,5 m, ports 2,5 m »). Le calcul tient compte du type de faille (une faille qui coulisse horizontalement soulève peu la mer) : mécanisme publié par l'USGS dès qu'il est connu (l'alerte est alors recalculée), sinon mécanisme habituel de la zone ; de la taille de la rupture, de la profondeur de la mer et de l'arrivée sur les côtes, et seules les côtes de la même mer sont concernées. Le niveau de chaque côte en découle comme au Japon : Avis jusqu'à 1 m, Avertissement jusqu'à 3 m, Avertissement majeur au-delà. Une hauteur annoncée par M-Alert s'affiche sans « ≈ ».
- **M-Alert-sender** : plusieurs alertes en cours peuvent être sélectionnées et levées d'un coup.

## Nouveautés de la 2.0.3
- **Petits séismes détectés par les stations** : la magnitude est maintenant la magnitude locale (comme les réseaux sismiques), calculée sur le déplacement du sol ; l'ancienne formule, faite pour les forts séismes, estimait M0 un séisme M2,3 et le faisait ignorer. Vérifié sur le séisme de M2,3 des Pyrénées du 14 octobre : il aurait été signalé 7 secondes après le début des secousses (M2,4), environ 4 minutes avant l'EMSC.
- **Séismes en bordure du réseau** (Pyrénées, Alpes, côtes) : ils ne sont plus rejetés comme « hors du réseau ».
- **Moins de fausses détections** : au moins deux stations doivent montrer un signal franc.

## Nouveautés de la 2.0.2
- **Détection par stations bien plus fiable** : le détecteur ne se laisse plus noyer par le bruit de fond des stations (trafic, vent, activité humaine), qui lui faisait rejeter les vrais séismes avec les fausses alarmes. Sur un banc d'essai qui reproduit le bruit observé, les séismes de magnitude 3 sont détectés 38 fois sur 40 en une vingtaine de secondes (2 sur 40 auparavant), ceux de magnitude 2,5 plus d'une fois sur deux (jamais auparavant), avec 7 fois moins de calcul.
- **M-Alert-sender** : les réglages de la VM (magnitude minimale signalée, seuil de déclenchement, nombre minimum de stations) se modifient dans le panneau 📶 ; la VM les applique en moins d'une minute et le sender confirme quand ils sont en vigueur.

## Nouveautés de la 2.0.1
- **M-Alert-sender** : les stations sismiques s'affichent sur la carte même quand la détection tourne sur la VM (détecteur distant) : elles passent au rouge quand elles se déclenchent, avec quelques secondes de décalage (5 s au plus pendant un séisme).
- **M-Alert-sender** : chaque séisme de l'onglet 📡 indique sa source : 📶 Stations, 📶 Stations + EMSC, 🌐 EMSC (avec l'agence), 🧪 Simulation ou ✍️ Saisi.

## Nouveautés de la 2.0.0
- **Nouveaux phénomènes** : 🔥 **Incendie**, avec trois niveaux seulement (Avis, Avertissement, Avertissement majeur) et le **type de feu** (feu de forêt, de végétation / broussailles, agricole, d'habitation, urbain / immeuble, industriel / entrepôt), et 💧 **Inondation**.
- **Consignes types pour tous les phénomènes** (tornade, incendie selon le type de feu, inondation…), affichées dès le niveau jaune (Avis) quand l'alerte n'a pas de consignes écrites.
- **Plus de ralentissement pendant un séisme** : les ondes P et S sont dessinées sur un seul calque réutilisé à chaque révision du séisme (avant, chaque révision ajoutait un calque qui n'était jamais retiré et l'application, puis le PC, ralentissaient), elles s'arrêtent une fois sorties de la carte et ne sont plus dessinées quand la fenêtre est cachée. Les notifications à l'écran sont limitées à 4.
- **Tsunami mieux calculé** : niveau de chaque côte dégressif avec la distance à l'épicentre (selon la magnitude) et heure d'arrivée plus réaliste (ralentissement près des côtes, « Arrivée imminente » pour les côtes les plus proches).
- **Origine des alertes séisme et tsunami** toujours indiquée : source (EMSC, stations sismiques détectées par M-Alert, stations confirmées ensuite par l'EMSC, ou séisme simulé lors d'un test des règles) et envoi (automatique ou validé par M-Alert). Une simulation n'est plus présentée comme une alerte EMSC.
- **M-Alert-sender** : une alerte tsunami envoyée automatiquement ne reste plus « À valider » après une coupure de connexion avec le serveur (la liste est rechargée à la reconnexion, et vérifiée quand l'heure d'envoi est dépassée).
- **Séismes (M-Alert-sender)** : les petits séismes en mer loin des côtes (détroit de Gibraltar…) ne s'affichent plus dans 📡 ; un séisme hors de France n'est gardé que s'il peut être ressenti en France ou provoquer un tsunami.
- **Détection par stations** : fausses alarmes réduites (stations trop bruyantes ignorées, seuil relevé pour les accéléromètres) ; la détection tourne d'abord sur la VM de M-Alert, 24 h/24.

## Nouveautés de la 1.9.2
- **Clignotement des départements ajoutés** corrigé : tous les départements ajoutés clignotent en même temps (plus de décalage entre eux) et reprennent leur couleur habituelle (vigilance) en phase éteinte, puis restent fixes à la couleur de l'alerte.

## Nouveautés de la 1.9.1
- **Départements ajoutés qui clignotent** : quand un département est ajouté à une alerte en cours (séisme qui se précise, alerte étendue…), il clignote quelques secondes sur la carte, comme dans les alertes précoces japonaises.
- **Magnitude révisée** : pendant une alerte séisme automatique, la magnitude suit les révisions, à la hausse comme à la baisse (même sous le seuil « Faible »).
- **Tsunami calculé** : un séisme en mer signalé par M-Alert peut déclencher une alerte tsunami calculée automatiquement (mention « 🧮 Tsunami calculé automatiquement »).

## Nouveautés de la 1.9.0
- **Détection des séismes par les stations** (expérimental), comme GlobalQuake : M-Alert peut signaler un séisme français en une vingtaine de secondes, directement à partir des stations sismiques d'Epos-France, sans attendre l'EMSC (plusieurs minutes). Avec le compte à rebours des ondes P et S, vous pouvez être prévenu quelques secondes avant l'onde S si vous êtes assez loin de l'épicentre. Magnitude et position sont des estimations provisoires, remplacées par celles de l'EMSC dès sa publication.
- Ces alertes portent la mention « 📶 Détection par les stations ».

## Nouveautés de la 1.8.2
- **Côtes clignotantes** comme dans JQuake : pour un tsunami ou des vagues-submersion, le trait des côtes touchées clignote (2 s allumé, 0,75 s éteint), avec un liseré sombre pour mieux ressortir sur la carte. Pas de clignotement si le système demande de réduire les animations.

## Nouveautés de la 1.8.1
- **Tsunami** : une alerte tsunami corrigée par M-Alert (niveau, arrivée ou hauteur des vagues sur une côte) n'est plus écrasée par les mises à jour automatiques du séisme.
- **Séisme et tsunami séparés** : un fort séisme en mer a désormais sa propre alerte séisme, envoyée tout de suite aux départements où il est ressenti, en plus de l'éventuelle alerte tsunami. L'attente de 3 minutes ne concerne que les alertes tsunami automatiques, jamais les séismes.
- Une alerte tsunami automatique en attente peut être diffusée **sans attendre les 3 minutes** quand M-Alert la confirme.

## Nouveautés de la 1.8.0
- **Tableau des tsunamis** dans le style japonais : pour chaque côte, son niveau (Avertissement majeur, Avertissement, Avis), l'heure d'arrivée prévue (« Déjà arrivé », « Arrivée imminente », heure exacte ou estimée « ≈ ») et la hauteur des vagues quand elle est connue. Votre département est marqué d'un 📍 et chaque côte est tracée sur la carte à la couleur de son niveau.
- **Origine de l'alerte** : chaque alerte indique si elle est manuelle (✍️), automatique (🤖, d'après l'EMSC) ou proposée par l'EMSC et validée par M-Alert (✅).
- Une alerte tsunami automatique n'est diffusée qu'après **3 minutes d'attente**, pour que M-Alert puisse la vérifier, la modifier ou l'annuler.
- **Sons des alertes réglables** (⚙ Réglages) : pour chaque type d'alerte (information, jaune et orange, rouge, majeure, crues et tsunamis, tremblement de terre, bip du compte à rebours), choisissez le son et son volume, avec un bouton ▶ pour l'écouter.

## Nouveautés de la 1.7.2
- **Intensité chez vous** : pour un séisme, l'intensité attendue dans votre département (estimée) s'affiche à côté de l'intensité maximale.
- **Répliques** : une réplique d'un séisme récent a sa propre alerte, avec la mention du séisme principal.
- **Tsunami** : hauteur des vagues attendue en mètres, quand elle est connue.
- « Couper le son » coupe l'alarme mais garde le bip du compte à rebours ; le bouton devient alors « Couper aussi le son du compte à rebours ».

## Nouveautés de la 1.7.1
- **Ondes P et S** : pendant un séisme, les ondes P (bleu) et S (rouge) s'étendent sur la carte depuis l'épicentre.
- **Compte à rebours** de l'arrivée des ondes P et S dans votre département, avec un bip chaque seconde pendant les 10 dernières secondes avant l'onde S.
- Le bandeau des séismes n'affiche plus de barre de défilement inutile.

## Nouveautés de la 1.7.0
- **Séismes en temps réel** : les séismes de France métropolitaine détectés par l'EMSC (Centre sismologique euro-méditerranéen) peuvent déclencher automatiquement une alerte séisme, avec épicentre, magnitude, profondeur et intensité maximale estimée (échelle shindo), mise à jour si le séisme est corrigé.
- **Tsunami** : un fort séisme en mer près des côtes françaises peut déclencher une alerte tsunami sur le littoral concerné.

## Nouveautés de la 1.6.4
- Les notifications de M-Alert peuvent être envoyées sans choisir de département : elles s'adressent alors à toute la France.

## Nouveautés de la 1.6.3
- **Rappel d'alerte** : M-Alert peut relancer une alerte en cours. Le son, la fenêtre d'alerte et la notification (« RAPPEL ») sont rejoués pour les personnes concernées, en direct ou à l'ouverture si l'application était fermée.
- **Tremblements de terre** : trois sons d'alerte possibles (EEW, EEW 2, EEW léger), choisis par M-Alert pour chaque séisme.

## Nouveautés de la 1.6.2
- **Notifications de M-Alert** : leur notification système reste affichée jusqu'au clic, comme celles des alertes orange et rouge. Sous KDE Plasma notamment, elle pouvait ne pas apparaître.

## Nouveautés de la 1.6.1
- **Notifications push** : les notifications de M-Alert arrivent désormais aussi sur les téléphones et navigateurs où M-Alert est fermé, même si la version web n'a pas encore été rouverte depuis la mise à jour.
- La version web vérifie ses mises à jour au démarrage puis toutes les heures.
- Les notifications s'affichent en **bandeau en haut de l'écran**, comme les séismes, avec le son « information » ; sur ordinateur, la fenêtre de M-Alert revient au premier plan. Une alerte reste prioritaire sur une notification.

## Nouveautés de la 1.6.0
- **Notifications de M-Alert** 🔔 : des messages d'information (sans alerte) s'affichent dans l'application et en notification, et restent consultables 24 h dans la nouvelle section « Notifications ». Reçus aussi à l'ouverture si M-Alert était fermé. Désactivables dans ⚙ Réglages.
- **Alertes silencieuses** : certaines alertes peuvent être affichées sur la carte et dans la liste sans son, fenêtre d'alerte ni notification.

## Nouveautés de la 1.5.2
- Nouveau phénomène 🌪️ **Tornade** : niveau sur l'échelle **EF0 à EF5** (EF0 jaune, EF1 orange, EF2 rouge, EF3 à EF5 majeure) et **vent attendu** quand il est connu.

## Nouveautés de la 1.5.1
- Alertes **sans date de fin** : elles restent en vigueur jusqu'à leur levée par M-Alert (« jusqu'à levée de l'alerte »).

## Nouveautés de la 1.5.0
- **Filtre par phénomène** : dans ⚙ Réglages, choisissez les phénomènes météo pour lesquels vous voulez être alerté (orages, canicule…) ; la liste « Alertes en cours » se filtre aussi par catégorie ou par phénomène.
- **Blocus / manifestation** : trois niveaux, **Avis** (jaune), **Avertissement** (rouge) et **Avertissement majeur** (rose).
- Les alertes peuvent désormais être **planifiées** à l'avance par M-Alert.
- **Nouveau logo** : le M blanc sur triangle rouge.

## Nouveautés de la 1.4.4
- Les alertes **vagues-submersion** sont tracées sur les côtes touchées, comme les tsunamis.

## Nouveautés de la 1.4.3
- À l'ouverture, M-Alert affiche les alertes émises pendant qu'il était fermé, et seulement celles-là.
- Si votre département est **ajouté à une alerte existante** (ou si son niveau monte), l'alerte sonne, en direct ou à l'ouverture si M-Alert était fermé, même avec « Recevoir les alertes de toute la France » coché.
- Version web : les vrais sons d'alerte sont joués sous Firefox et Safari (au lieu d'une sirène générique).

## Nouveautés de la 1.4.2
- Tremblements de terre : la **profondeur** du séisme est affichée quand elle est connue.

## Nouveautés de la 1.4.1
- **Son** : « Couper le son » et « J'ai compris » arrêtent désormais toujours le son, même s'il a démarré en retard.
- Si le navigateur a bloqué le son d'une alerte, elle sonne au premier clic sur la page.

## Nouveautés de la 1.4.0
- **Tremblements de terre** : quatre niveaux (Faible, Moyen, Élevé, Majeur), magnitude, intensité maximale en **shindo** et **croix ✕ sur l'épicentre**.
- L'alerte séisme s'affiche en **bandeau compact en haut** de l'écran : la carte reste visible avec l'épicentre et les départements concernés.

## Nouveautés de la 1.3.0
- **Alertes tsunami** sur trois niveaux : **Avis de tsunami** (jaune), **Avertissement de tsunami** (rouge) et **Avertissement majeur de tsunami** (rose).
- Sur la carte, les côtes touchées par un tsunami sont tracées de la couleur du niveau, comme dans JQuake.

## Nouveautés de la 1.2.7
- Les alertes **tremblement de terre** jouent toujours le son EEW, quel que soit leur niveau.
- Le son des alertes **majeures** se répète jusqu'à « J'ai compris », sans limite de durée.

## Nouveautés de la 1.2.6
- Toutes les alertes **majeures** jouent le son majeur, même pour un tsunami ou des crues.
- **Mon département** : les cases Aujourd'hui et Demain tiennent compte des alertes M-Alert, en plus de la vigilance Météo-France.
- Arch Linux : l'entrée « Rechercher des mises à jour » disparaît du menu de l'icône (pacman s'en charge).

## Nouveautés de la 1.2.5
- Nouvelle catégorie 🏭 **Accident industriel** (à la place d'Accident), avec les consignes officielles de mise à l'abri.
- Nouveau son pour les **crues**, la **pluie-inondation**, les **tsunamis** et les **vagues-submersion**.

## Nouveautés de la 1.2.4
- Fond de carte détaillé : seule la France est affichée, les autres pays sont masqués.

## Nouveautés de la 1.2.3
- Fond de carte détaillé réparé : il affichait « API KEY REQUIRED » (le fournisseur CARTO exige désormais une clé). Il utilise maintenant le fond sombre d'Esri, avec les noms de villes.

## Nouveautés de la 1.2.2
- Carte plus sobre : les départements en alerte ne clignotent plus, ont la même luminosité que la vigilance et les mêmes frontières noires.

## Nouveautés de la 1.2.1
- Contour des départements en alerte plus fin.
- La carte ne se dézoome plus au-delà de la France entière.

## Nouveautés de la 1.2.0
- **Beaucoup plus léger** : la carte ne fait plus ramer l'ordinateur, et les animations se mettent en pause quand M-Alert est caché dans la zone de notification.
- **Sons d'alerte** : un son pour les informations, un pour le jaune et l'orange, un pour le rouge, et un pour la majeure, les tsunamis et les vagues-submersion.
- **Alertes modifiées** : une alerte corrigée est mise à jour en direct ; elle sonne de nouveau si le niveau monte ou si votre département est ajouté.
- **Clignotement** réservé aux départements en alerte rouge ou majeure, désactivable dans ⚙ Réglages.

## Installation

### Windows 10 / 11
- **`M-Alert-Setup-….exe`** : installateur (recommandé). **Se met à jour automatiquement** : les nouvelles versions sont téléchargées en arrière-plan et installées au redémarrage de M-Alert.
- **`M-Alert-Portable-….exe`** : version sans installation (prévient seulement quand une nouvelle version sort).

L'application n'est pas signée numériquement : au premier lancement, Windows SmartScreen peut afficher « Windows a protégé votre ordinateur ». Cliquez sur **Informations complémentaires** puis **Exécuter quand même**.

### Arch Linux
M-Alert est dans le dépôt pacman [malik05](https://github.com/malik05051/malik05-repo) (ajout du dépôt décrit dans son README), puis :

```console
# pacman -Syu m-alert
```

### Téléphone et navigateur
Version web : **https://malik05051.github.io/M-alert/** — sur téléphone, « Ajouter à l'écran d'accueil » puis activez les notifications push dans les réglages pour être prévenu application fermée.

### Autres distributions Linux
- **`M-Alert-….AppImage`** : toutes distributions, se met à jour automatiquement. `chmod +x M-Alert-*.AppImage` puis lancez-le.
- **`M-Alert-…-amd64.deb`** : Debian, Ubuntu, Linux Mint… `sudo apt install ./M-Alert-*-amd64.deb`

## Premier lancement
Choisissez votre département : vous entendrez une alerte sonore et recevrez une notification dès qu'une alerte le concerne. Fermer la fenêtre laisse M-Alert actif en arrière-plan (icône près de l'horloge) ; réglez le lancement au démarrage dans ⚙ Réglages.

`SHA256SUMS.txt` contient les sommes de contrôle des fichiers. Les fichiers `latest*.yml` et `.blockmap` servent aux mises à jour automatiques.
