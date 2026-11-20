## M-Alert 3.2.0

- **Son choisi par alerte** : M-Alert-sender peut imposer le son d'une alerte (Alerte mobile, séisme EEW, EEW 2, EEW léger, EEW, rouge, majeur, tsunami, information) ; il est joué par l'application, sur Android aussi application fermée (sur iOS application fermée, seule l'alerte mobile a son propre son).
- **Vigilance Météo-France en alerte mobile** : une vigilance relancée avec « 📢 Alerte mobile » depuis M-Alert-sender sonne sur les téléphones avec le son Alerte mobile, en notification urgente, aussi application fermée.
- **🌐 Alertes traduites automatiquement** en anglais, allemand et espagnol (titre, description, consignes) quand l'application est dans l'une de ces langues ; « Voir l'original » dans la bannière, réglage pour désactiver la traduction.
- **📷 Webcams de la zone** : bouton dans la bannière des alertes, images récentes des caméras proches (côte pour un tsunami ou des vagues-submersion, rivières et villes pour une crue, épicentre d'un séisme), un clic ouvre la journée en accéléré ou le direct (Windy).
- **💧 Hauteurs d'eau mesurées** pendant les alertes crues, pluie-inondation et inondation : stations où l'eau monte le plus (Hub'Eau, réseau Vigicrues), dans la bannière et le tableau des prévisions.
- **Réglages gardés à la réinstallation** : sur iPhone, copiés dans le trousseau et rétablis tout seuls si l'application réinstallée (Feather, AltStore, Sideloadly) est signée par le même compte ; partout, « 📤 Exporter » et « 📥 Importer » les réglages (code à garder) dans ⚙ Réglages.
- **Mise à jour par-dessus sur iPhone** : numéro de build différent à chaque construction (même version remplacée), pour que Feather et iOS la voient comme une mise à jour.
- **Batterie (iOS et Android)** : la réception en arrière-plan ne reçoit plus que les alertes et notifications qui sonnent, et ne réveille le téléphone qu'une fois par minute au lieu d'environ quatre ; la notification « M-Alert ne reçoit plus les alertes » apparaît après 5 minutes sans réveil.
- **Méthode PLUM** : les alertes séisme nées des secousses mesurées par les stations (méthode de l'agence météorologique japonaise) portent la mention « 📈 PLUM ».
- **Incrustation OBS : alerte montrée depuis M-Alert-sender** (« 🎥 Afficher dans OBS ») : une alerte en cours est rejouée comme à son arrivée (bandeau, carte des côtes, panneau du séisme, écran du missile).
- **Incrustation OBS : intensités toujours à jour** : la carte des intensités est redessinée dès que le séisme est corrigé (magnitude, profondeur, épicentre, intensités), même choisi dans M-Alert-sender et terminé.
- **Incrustation OBS : magnitude** « M5.7 » d'un seul texte jaune à côté de l'heure, affichable ou masquable depuis M-Alert-sender ou le script OBS.
- Script OBS mis à jour (version de la page 3.2.0) : remplacez `m-alert.lua` dans OBS.
