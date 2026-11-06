# M-Alert

Cette application diffuse des informations que j'envoie via mon module M-Alert, en fonction du département.

Pour recevoir les alertes que j'envoie (dont la source vient des centres météorologiques français comme Météo-France), il faut configurer votre département dans les réglages ou à la première ouverture de l'application.

![Alerte tempête rouge reçue dans M-Alert, avec son tableau par département](docs/alerte.png)

<img src="docs/mobile.png" alt="Alerte pluie-inondation sur téléphone" width="260">

## Fonctionnalités

- **Carte interactive** des départements, colorés selon la **vigilance Météo-France** (vert, jaune, orange, rouge, et rose pour le niveau **majeur** fixé par M-Alert), pour aujourd'hui et demain, et **après-demain** d'après les prévisions de vent violent et de vagues-submersion de M-Alert (Météo-France ne publie pas de vigilance au-delà de demain). Survolez un département pour voir les phénomènes (orages, vent, crues…).
- **Alertes en bannière** en haut de l'écran, dans le style de JQuake / GlobalQuake : cadre clignotant à la couleur du niveau, titre, départements concernés, description (un clic l'affiche en entier, avec les consignes) ; la carte reste visible et utilisable dessous. Les notifications de M-Alert et les annulations s'affichent de la même façon.
- **Son d'alerte** selon le niveau (information ; jaune et orange ; rouge ; majeure), avec un son dédié aux crues, inondations, tsunamis et vagues-submersion. Pour l'orange et le rouge, le son peut être répété jusqu'à « J'ai compris » ; le son majeur se répète toujours jusqu'à « J'ai compris ». Dans les réglages, chaque type d'alerte peut avoir **son propre son et son propre volume**, avec un bouton ▶ pour l'écouter.
- **Notification système** avec la description de l'alerte.
- **Fuseau horaire au choix** (réglages) : automatique (celui de l'appareil), Paris, Nouméa, outre-mer, UTC ou tout autre fuseau ; toutes les heures affichées le suivent (horloge, alertes, tableaux des prévisions, arrivée des tsunamis).
- **Tremblement de terre** : quatre niveaux, **Faible**, **Moyen**, **Élevé** et **Majeur**, avec la magnitude, la profondeur, l'intensité maximale (échelle japonaise **shindo**, de 0 à 7) et une **croix ✕ sur l'épicentre**, avec son propre son d'alerte (EEW, EEW 2 ou EEW léger, choisi par M-Alert). Pendant un séisme, les **ondes P et S** s'étendent sur la carte (cercles bleu et rouge) et le bandeau affiche le **compte à rebours** de leur arrivée dans votre département, avec un bip chaque seconde pendant les 10 dernières secondes avant l'onde S (« Couper le son » coupe l'alarme mais garde ce bip ; « Couper aussi le son du compte à rebours » le coupe), et l'**intensité attendue dans votre département** à côté de l'intensité maximale. Les **répliques** d'un séisme sont signalées comme telles. Pour un tsunami, la **hauteur des vagues** s'affiche quand elle est connue (estimation à vitesses moyennes : 6,5 km/s pour P, 3,75 km/s pour S). Les séismes de France métropolitaine peuvent être signalés automatiquement à partir des données de l'EMSC (Centre sismologique euro-méditerranéen), tout comme un risque de tsunami après un fort séisme en mer. Ils peuvent aussi être **détectés en quelques secondes par les stations sismiques** d'Epos-France (expérimental, comme GlobalQuake : mention « 📶 Détection par les stations ») ; leurs valeurs (magnitude, position) sont prioritaires et l'EMSC vient les confirmer. L'alerte s'affiche en **bandeau compact en haut** de l'écran pour laisser voir l'épicentre et les départements concernés.
- **Tsunami** : trois niveaux seulement, **Avis de tsunami** (jaune), **Avertissement de tsunami** (rouge) et **Avertissement majeur de tsunami** (rose), affichés comme dans JQuake par un trait **clignotant** (2 s allumé, 0,75 s éteint) de la couleur du niveau le long des côtes touchées, et un **tableau d'arrivée** comme au Japon : pour chaque côte, son niveau, l'heure d'arrivée prévue (« Déjà arrivé », « Arrivée imminente », heure exacte ou estimée « ≈ ») et la hauteur des vagues : annoncée par M-Alert, ou estimée d'après la magnitude et la distance (« ≈ », formule d'Abe ; la vague peut être plus haute dans les ports et les baies). Une alerte tsunami automatique n'est diffusée qu'après 3 minutes d'attente, le temps que M-Alert la vérifie. Les alertes **vagues-submersion** sont affichées de la même façon, sur les côtes, qui clignotent aussi.
- **Départements en alerte** remplis de la couleur du niveau, avec la même luminosité et les mêmes frontières noires que la vigilance. Un département **ajouté** à une alerte en cours clignote quelques secondes (comme les alertes précoces japonaises). Pendant un séisme, la magnitude suit les révisions, à la hausse comme à la baisse.
- Les alertes envoyées pendant que l'application était fermée s'affichent au démarrage (seulement celles-là : une alerte déjà reçue ne revient pas). Si votre département est **ajouté à une alerte existante** ou si son niveau monte, vous êtes alerté, en direct ou à l'ouverture.
- **Notifications de M-Alert** : messages d'information (sans alerte) affichés en **bandeau en haut de l'écran** (comme un séisme, avec le son « information »), en notification système et dans la section « 🔔 Notifications » pendant 24 h ; l'application de bureau revient au premier plan. Reçues aussi à l'ouverture si l'application était fermée ; une alerte passe toujours devant. Désactivables dans les réglages.
- Chaque alerte indique son **origine** : ✍️ manuelle, 🤖 automatique (EMSC) ou ✅ proposée par l'EMSC et validée par M-Alert.
- Certaines alertes peuvent être **silencieuses** : affichées sur la carte et dans la liste, sans son ni notification.
- Prévenu aussi quand la vigilance de vos départements passe en jaune, orange ou rouge (désactivable).
- **Fonctionne en arrière-plan** : fermer la fenêtre laisse M-Alert actif dans la zone de notification ; il reste connecté, sonne et réaffiche la fenêtre dès qu'une alerte arrive. Reconnexion immédiate après une mise en veille.
- Une alerte peut être **relancée** par M-Alert : le son, la fenêtre et la notification (« RAPPEL ») sont rejoués, en direct ou à l'ouverture si l'application était fermée.
- Une alerte **modifiée** depuis M-Alert-sender est mise à jour en direct ; elle sonne de nouveau si son niveau monte ou si votre département vient d'être ajouté.
- La vigilance peut être **corrigée ou saisie à la main** depuis M-Alert-sender, que l'API Météo-France fonctionne ou soit en panne : badges « Vigilance corrigée » / « Vigilance manuelle » et mention « ✎ corrigé par M-Alert » sur les départements concernés.
- **Catégories d'alertes** : 🌦️ Météo, 🏚️ Tremblement de terre, 🌊 Tsunami, 🌫️ Pollution (air avec le polluant, eau du robinet, marine / littoral, sols, chimique), 🏭 Accident industriel, 🚨 Attentat, 📢 Grève, 🚧 Blocus / manifestation, chacune avec ses consignes. La catégorie 🚨 **Attentat** suit les trois stades du plan Vigipirate en vigueur depuis le 22 juin 2026 (Vigilance, Vigilance renforcée, Alerte attentat). Chaque catégorie peut être désactivée dans les réglages.
- **Intensités sur la carte** : pendant une alerte séisme, chaque département affiche son intensité estimée (pastille shindo, comme les cartes japonaises), ou celle corrigée par M-Alert ; masquable dans les réglages.
- **Alerte annulée** : quand M-Alert annule une alerte (fausse alerte, quel que soit le phénomène), un bandeau « ❌ Alerte annulée » en donne la raison, avec le son EEW (eew.mp3) pour un séisme annulé.
- **Vent violent automatique** : M-Alert peut diffuser des alertes vent violent calculées d'après les prévisions de rafales de Météo-France et du CEPMMT (jusqu'à 10 jours), avec la mention « 💨 Prévision de rafales », avec leur prévision d'origine (heure d'émission, titre et pic prévus au départ, « 🕓 Prévision d'origine ») même après les mises à jour, et des alertes **vagues-submersion** estimées d'après les prévisions de vagues, de marée et de vent (mention « 🌊 Prévision de vagues et de niveau de la mer ») ; elles se mettent à jour avec la prévision et se lèvent quand le phénomène n'est plus prévu.
- **Tornade** : niveau sur l'échelle **EF0 à EF5** (EF0 jaune, EF1 orange, EF2 rouge, EF3 à EF5 majeure) et vent attendu.
- **Incendie** 🔥 : trois niveaux (Avis, Avertissement, Avertissement majeur) et type de feu (feu de forêt, de végétation, agricole, d'habitation, urbain, industriel…), avec des consignes adaptées au type. **Inondation** 💧 : phénomène à part (son des crues et tsunamis).
- **Tempête** 🌀 : phénomène météo à part (en plus du vent violent de Météo-France), avec ses consignes. **Alertes précoces de tempête** : M-Alert prévoit les tempêtes jusqu'à 10 jours à l'avance (rafales très fortes dans une dépression), avec un tableau par département : rafales, vent moyen, pression et heures prévues.
- **Alertes précoces d'inondation** 🌧️ : M-Alert prévoit les pluies-inondations jusqu'à 10 jours à l'avance, d'après la pluie prévue (cumuls sur 24 et 72 heures) et les débits des rivières (système européen GloFAS, Copernicus), avec un tableau par département. Aujourd'hui et demain, elles suivent la vigilance pluie-inondation et crues de Météo-France, sauf si M-Alert prévoit plus grave.
- **Nouvelle-Calédonie** : choisissez « Nouvelle-Calédonie (988) » comme département pour recevoir les alertes **séisme** et **tsunami** (îles Loyauté, fosse du Vanuatu…), à l'heure de Nouméa ; l'archipel est dessiné en encart sur la carte, avec l'épicentre, les ondes et les intensités. Les séismes viennent de l'EMSC et des stations sismiques de l'IRD Nouméa (réseau ND), détectés par M-Alert en quelques dizaines de secondes. Météo : la vigilance de Météo-France Nouvelle-Calédonie (vent violent, fortes pluies-orages, forte houle) et les alertes M-Alert de vent violent, tempête, pluie-inondation et vagues-submersion, aux jours et heures de Nouméa.
- **Consignes types** pour tous les phénomènes et catégories, affichées dès le niveau jaune (Avis) quand M-Alert n'en a pas écrit.
- **Blocus / manifestation** : trois niveaux, **Avis** (jaune), **Avertissement** (rouge) et **Avertissement majeur** (rose).
- **Missile** : trois niveaux, **Avis** (jaune), **Avertissement** (rouge) et **Avertissement majeur** (rose), tous avec le son de la vigilance rouge ; consignes de mise à l'abri. Envoi depuis M-Alert-sender (pas de flux public d'alertes FR-Alert à automatiser).
- **Vigilances Météo-France dans « Alertes en cours »** : à côté des alertes M-Alert, une ligne par phénomène et par couleur de vigilance du jour (jaune, orange, rouge) avec ses départements et sa plage horaire ; un clic l'affiche en bannière (départements, horaires, consignes) et la montre sur la carte. Option « Afficher les vigilances Météo-France dans « Alertes en cours » » dans les réglages.
- **Filtre par phénomène** : liste « Alertes en cours » filtrable par catégorie ou par phénomène météo (alertes M-Alert et vigilances Météo-France).
- **Réglages** : département principal, autres départements suivis, catégories d'alertes et phénomènes météo reçus, alertes de toute la France, niveau minimum, son et volume (général et par type d'alerte, avec écoute), notifications, notifications de M-Alert, notifications push, fond de carte détaillé, lancement au démarrage, adresse du serveur.

## Utilisation

### Application de bureau (Windows et Linux)

| Système | Fichier |
| --- | --- |
| Windows 10/11 | `M-Alert-Setup-x.y.z.exe` (installateur) ou `M-Alert-Portable-x.y.z.exe` (sans installation) |
| Linux | `M-Alert-x.y.z.AppImage` (toutes distributions) ou `M-Alert-x.y.z-amd64.deb` (Debian, Ubuntu, Mint…) |

Ces fichiers sont construits automatiquement par GitHub à chaque modification : onglet **Actions** > **Applications de bureau** > dernier passage > *Artifacts*. En poussant un tag `v1.0.0`, ils sont joints à une *Release*.

Pour la lancer depuis le code source :

```bash
npm install
npm start            # lancer l'application
npm run dist:win     # installateur Windows (dans dist/)
npm run dist:linux   # AppImage + .deb (dans dist/)
```

**Mises à jour** : l'installateur Windows et l'AppImage se mettent à jour tout seuls. M-Alert vérifie les nouvelles versions au démarrage puis toutes les 6 heures, les télécharge en arrière-plan et les installe au prochain redémarrage (un bandeau propose « Redémarrer et installer »). La version portable et le `.deb` préviennent simplement qu'une nouvelle version est disponible. Sous Arch, c'est `pacman -Syu`. Réglages > Application > *Mises à jour* : vérification manuelle et désactivation.

**Arrière-plan** : quand on ferme la fenêtre, M-Alert continue de tourner dans la zone de notification (icône près de l'horloge) et reste à l'écoute des alertes. Clic droit sur l'icône : *Ouvrir*, *Réglages*, *Tester une alerte*, *Quitter*. Relancer M-Alert rouvre aussi la fenêtre. Dans les réglages :

- **Continuer en arrière-plan quand la fenêtre est fermée** (activé par défaut) ;
- **Lancer M-Alert au démarrage de l'ordinateur** : démarre caché dans la zone de notification (registre Windows, ou fichier `~/.config/autostart/fr.malert.app.desktop` sous Linux).

Sous Linux, l'icône de la zone de notification nécessite la prise en charge d'AppIndicator (présente par défaut sur Ubuntu, KDE, Cinnamon, XFCE ; sur GNOME « pur », installez l'extension *AppIndicator and KStatusNotifierItem Support*). Pour l'AppImage : `chmod +x M-Alert-*.AppImage` puis double-clic.

### Application mobile (Android et iOS)

| Système | Fichier (dans la *Release*) |
| --- | --- |
| Android 7 ou plus | `M-Alert-x.y.z.apk` |
| iPhone / iPad (iOS 15 ou plus) | `M-Alert-x.y.z-non-signe.ipa` |

**Android** : téléchargez l'APK sur le téléphone, ouvrez-le et autorisez l'installation depuis cette source (Chrome ou Fichiers). L'application est la même que la version web, avec en plus un **service de réception en arrière-plan** : une notification permanente « M-Alert — Réception des alertes en arrière-plan » reste affichée et les alertes arrivent même application fermée, avec leur son (EEW, rouge, majeur, tsunami…), même en mode silencieux pour les séismes, tsunamis et alertes majeures (canal « alarme »). Le service redémarre tout seul après un redémarrage du téléphone. Réglages ⚙ > **Recevoir les alertes en arrière-plan, application fermée** pour l'arrêter ; chaque son a son canal dans les réglages Android des notifications de M-Alert. Autorisez les notifications au premier lancement et, si le téléphone coupe les applications en arrière-plan (Xiaomi, Huawei, Samsung…), retirez M-Alert de l'optimisation de la batterie. Les mises à jour s'installent par-dessus l'ancienne version (même signature).

**iOS** : sans compte développeur Apple payant, l'`.ipa` n'est pas signé. Installez-le avec [AltStore](https://altstore.io) ou [Sideloadly](https://sideloadly.io) (signature avec votre identifiant Apple, à renouveler tous les 7 jours). L'application iOS reçoit les alertes quand elle est ouverte ; pour être prévenu application fermée sur iPhone, utilisez plutôt la version web ajoutée à l'écran d'accueil avec les notifications push (ci-dessous).

Google Play n'est pas utilisé : la publication y demande un compte développeur payant.

Pour construire depuis le code source (dossier `mobile/`, [Capacitor](https://capacitorjs.com)) :

```bash
cd mobile
npm ci
node copy-web.js            # copie web/ dans www/
npx cap sync android        # ou ios (sur un Mac avec Xcode 26)
cd android && ./gradlew assembleRelease -PappVersion=3.0.0
```

L'APK est signé avec la clé publique `mobile/android/app/m-alert-public.jks` (mot de passe `m-alert`), ou avec votre propre clé via les variables `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`.

### Incrustation OBS (alertes façon NHK)

M-Alert peut s'afficher en direct dans OBS Studio comme les alertes de la NHK : **bandeau d'alerte** (carte des départements à gauche, titre de la couleur du niveau, consigne en jaune et lieux concernés), **carte des tsunamis et des vagues-submersion** en plein écran, sur fond opaque, aux côtes qui clignotent (avertissement majeur, avertissement, avis), avec le bandeau du séisme réduit en haut à gauche et cadre **« Information(s) M-Alert »** (alerte annulée, notifications envoyées depuis M-Alert-sender). Pour un séisme, le bandeau rouge « Alerte de tremblement de terre » s'affiche en haut pendant 3 secondes. Pour une alerte annulée, le cadre d'annulation prend la place du bandeau en bas, et le texte du haut indique « Alerte de … annulée ».

**Avec le script (le plus simple)** : téléchargez [`obs/m-alert.lua`](obs/m-alert.lua), puis dans OBS > *Outils* > *Scripts* > **+** > `m-alert.lua`. Réglez les options (catégories, départements, niveau minimum, durée, position, son…) puis **Ajouter / mettre à jour l'incrustation** : une source navigateur « M-Alert » (1920 × 1080, fond transparent) est créée dans la scène en cours. **Aperçu (séisme)** montre un exemple. Si une scène ou une autre source s'appelle déjà « M-Alert », la source s'appelle « M-Alert (incrustation) ». Elle reste transparente tant qu'aucune alerte n'est en cours.

**Écran réduit (comme la NHK, activé par défaut)** : 10 secondes après l'arrivée d'une alerte (réglable, « Écran réduit après »), OBS passe sur la scène **« M-Alert (alerte) »**, créée par le script. L'image de la scène en cours se réduit à 80 % (animation) sur un fond bleu. En haut, le texte défile en pages, en boucle et sans rien couper : **« Informations M-Alert »** (4 secondes), puis toutes les informations de l'alerte, puis « Restez informés sur M-Alert (et Météo-France) ». Une alerte mise à jour refait le texte et reprend le cycle au début. Les informations affichées :
- séisme : heure, magnitude, profondeur et intensités par département ;
- tsunami : hauteurs et heures d'arrivée ;
- vent et tempête : rafales ;
- pluie-inondation : pluie en 24 h et crues ;
- vagues-submersion : hauteur des vagues.

Le bandeau reste en bas, puis OBS revient à la scène d'avant. On peut aussi le déclencher à la main : bouton **« Écran réduit : activer / désactiver »** du script, ou raccourci clavier (*Paramètres* > *Raccourcis clavier* > « M-Alert : écran réduit »). La source d'incrustation a pour cela l'accès « avancé » à OBS (réglé par le script).

**À la main, aussi** :
- **texte en haut seul** : bande bleue avec « Informations M-Alert » puis les informations, sans réduire l'image. C'est la source « M-Alert (texte) », cachée au départ.
- **bandeau de l'alerte en cours** : affiché sans durée limite, ou masqué jusqu'à la prochaine alerte. La commande est envoyée à la source d'incrustation.
- **carte du tsunami ou des vagues-submersion** : affichée ou masquée de la même façon (bouton « Carte tsunami / vagues-submersion : afficher / masquer »).
- **mini-carte**, **tableau des mesures** et **panneau « Alerte sismique précoce » à gauche** (comme la NHK, colonnes verticales : titre rouge, lieu du séisme en jaune, départements) : affichés ou masqués de la même façon. Le panneau s'affiche tout seul quand l'écran est réduit pendant un séisme (`eewPanel=0` pour ne jamais l'afficher tout seul). Pendant la carte plein écran du tsunami, aucun bandeau n'est affiché.

Utilise les boutons « Texte en haut : afficher / masquer » et « Bandeau de l'alerte : afficher / masquer » du script, ou leurs raccourcis clavier. Le fond est la source « M-Alert (fond) ». Avec une source ajoutée à la main : paramètre `reduce=Nom de la scène` (et une source `layer=fond` dans cette scène).

Il faut la source **Navigateur** d'OBS (obs-browser), présente dans OBS pour Windows, macOS et en Flatpak. Sous **Arch Linux**, le paquet `obs-studio` ne l'a pas : installez `obs-studio-browser` (AUR) ou OBS en Flatpak (`flatpak install flathub com.obsproject.Studio`). Le script le signale dans sa description si elle manque.

**À la main** : ajoutez une *Source navigateur* de 1920 × 1080 avec l'adresse

```
https://malik05051.github.io/M-Alert/obs/?server=https://m-alert-sender.onrender.com&sound=1
```

et cochez *Contrôler l'audio via OBS* pour le son. Paramètres de l'adresse (tous facultatifs, séparés par `&`) :

| Paramètre | Effet |
| --- | --- |
| `types=seisme,tsunami,meteo` | catégories montrées (par défaut : toutes) |
| `deps=13,83,988` | départements suivis (par défaut : tous) |
| `min=3` | niveau minimum (1 information … 5 majeur) |
| `hold=90` | secondes d'affichage du bandeau (`0` : tant que l'alerte dure) |
| `sound=1` | joue le son de l'alerte |
| `tests=0` | ignore les alertes de test |
| `pos=top`, `width=66` | bandeau en haut ; largeur en % de l'écran |
| `tsunami=0` | pas de carte plein écran des tsunamis |
| `infos=0` | pas de cadre « Information(s) M-Alert » |
| `reduce=M-Alert (alerte)` | écran réduit : passe sur cette scène pendant l'alerte (accès « avancé » de la source) |
| `stay=quake` | séisme et tsunami : écran réduit gardé tant que l'alerte est en cours (le bandeau du bas part après `hold`, le panneau de gauche, le texte du haut et le tableau restent) ; `0` : non ; `all` : toutes les alertes |
| `mapSeconds=20` | tsunami et vagues-submersion : secondes de carte plein écran, puis l'image avec la mini-carte en bas à droite et le tableau des mesures (arrivée et hauteur ; pic et vagues) en bas à gauche, en pages |
| `addedSeconds=10` | secondes de clignotement des départements ajoutés par une mise à jour (noms en jaune, annoncés en haut) |
| `cancelHold=30` | secondes d'affichage d'une alerte annulée |
| `reduceAfter=10` | secondes avant l'écran réduit (`0` : tout de suite) |
| `layer=fond` | fond de l'écran réduit (bleu et texte d'informations) |
| `layer=texte` | texte en haut seul (bande bleue) |
| `demo=seisme` (`ajout`, `tsunami`, `submersion`, `vent`, `inondation`, `annulation`, `info`) | aperçu sans serveur |

### Version web (téléphone, navigateur)

👉 **https://malik05051.github.io/M-Alert/**


Le dossier `web/` est un site statique. Le workflow **Version web (GitHub Pages)** le publie automatiquement à chaque modification sur `main` (à activer une fois : *Settings > Pages > Source : GitHub Actions*).

Sur téléphone, l'application ne tourne pas en continu en arrière-plan : ce sont les **notifications push** qui préviennent quand elle est fermée. Ouvrez la page puis « Ajouter à l'écran d'accueil ». Cochez **Recevoir les alertes même quand l'application est fermée (push)** dans les réglages pour être notifié application fermée. Sur iPhone, les notifications push nécessitent iOS 16.4 ou plus et que M-Alert soit ajouté à l'écran d'accueil.

Pour tester en local : `npm run web` puis ouvrez http://localhost:5173.

## Configuration

Les alertes passent par le serveur M-Alert (dossier `server/` du dépôt **M-Alert-sender**). Indiquez son adresse dans `web/config.js` pour que les utilisateurs n'aient rien à saisir :

```js
window.MALERT_CONFIG = {
  serverUrl: 'https://mon-serveur-malert.onrender.com',
};
```

L'adresse reste modifiable dans les réglages de l'application.

## Sons d'alerte

Les sons sont dans `web/sounds/` :

| Fichier | Joué pour |
| --- | --- |
| `information.mp3` | Information |
| `eew.mp3` | Jaune et orange |
| `seisme-eew.mp3`, `seisme-eew2.mp3`, `seisme-leger.mp3` | **Tremblements de terre** (tous niveaux), son choisi par M-Alert |
| `countdown.mp3` | Bip du compte à rebours avant l'onde S |
| `rouge.mp3` | Rouge, et toutes les alertes **missile** |
| `majeur.mp3` | Alertes **majeures** (rose), même tsunami ou crues, sauf tremblement de terre |
| `tsunami.mp3` | **Crues**, **pluie-inondation**, **tsunami** et **vagues-submersion** (sauf en majeure) |

Chaque utilisateur peut choisir un autre de ces sons et un volume pour chaque type d'alerte dans ⚙ Réglages > **Sons des alertes** (bouton ▶ pour écouter). Dans **Réglages avancés du son** :

- **Durée maximale du son répété** (alertes qui sonnent jusqu'à ce qu'on les arrête) ;
- **Montée progressive du volume** (le son part bas et monte en 6 secondes) ;
- **Vibrer** (téléphone) : court pour une information, long et répété pour une alerte rouge ou majeure ;
- **Son pour les informations et les notifications de M-Alert** ;
- **Heures calmes** (de … à …) : pas de son ni de vibration, sauf pour les alertes choisies (par exemple rouges et majeures, séismes et tsunamis). Pour changer un son pour tout le monde, remplacez le fichier en gardant son nom (sans fichier, une sirène synthétique est jouée). Réglages > **Tester une alerte** permet de vérifier le son, l'affichage et les notifications.

## Structure

```
main.js, preload.js     Application de bureau (Electron)
background.js           Arrière-plan : zone de notification, lancement au démarrage
updater.js              Mises à jour (electron-updater, Releases GitHub)
mobile/                 Application Android et iOS (Capacitor) : service d'arrière-plan Android
obs/m-alert.lua         Script OBS (source navigateur de l'incrustation)
web/                    Interface (aussi utilisable comme site web)
  index.html, config.js
  js/app.js             Logique : connexion temps réel, alertes, réglages
  js/map.js             Carte des départements (Leaflet)
  js/sound.js           Son d'alerte
  js/banner.js          Bandeaux façon NHK, carte des tsunamis, cadre « Information(s) M-Alert »
  obs/                  Page d'incrustation OBS
  sw.js                 Service worker (notifications push)
  data/departements.js  Contours des départements
  data/cotes.js         Trait de côte par département (alertes tsunami), généré par tools/build-coasts.js
  sounds/               Vos sons d'alerte
```

## Crédits

- Vigilance : © Météo-France (API « Données Publiques Vigilance »).
- Contours des départements : IGN Admin Express via [france-geojson](https://github.com/gregoiredavid/france-geojson) (Licence Ouverte). Frontières terrestres retirées du trait de côte avec [Natural Earth](https://www.naturalearthdata.com) (domaine public).
- Carte : [Leaflet](https://leafletjs.com) (BSD-2). Fond de carte détaillé : © Esri, HERE, Garmin, © OpenStreetMap (ArcGIS World Dark Gray Canvas).
