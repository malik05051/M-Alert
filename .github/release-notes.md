## M-Alert 3.0.0

- **Application Android** (`M-Alert-3.0.0.apk`) : la même application que la version web, avec un service qui reçoit les alertes en arrière-plan, application fermée. Une notification permanente reste affichée, chaque son (EEW, rouge, majeur, tsunami…) a son canal, et les séismes, tsunamis et alertes majeures sonnent comme une alarme. Le service redémarre tout seul après un redémarrage du téléphone. Réglage « Recevoir les alertes en arrière-plan, application fermée ». Les mises à jour s'installent par-dessus l'ancienne version.
- **Application iOS** (`M-Alert-3.0.0-non-signe.ipa`, iOS 15 ou plus) : non signée, à installer avec AltStore ou Sideloadly. Elle reçoit les alertes quand elle est ouverte ; pour être prévenu application fermée sur iPhone, utilisez la version web ajoutée à l'écran d'accueil (notifications push).
- **Incrustation OBS façon NHK** : source navigateur `https://malik05051.github.io/M-Alert/obs/` ou script `m-alert.lua` (OBS > Outils > Scripts), qui crée la source et règle les options. Elle affiche :
  - **bandeau d'alerte** : carte des départements touchés, épicentre, titre de la couleur du niveau (« Alerte sismique précoce (M-Alert) », « Vent violent (M-Alert) », « Inondation (M-Alert) »…), consigne en jaune et lieux concernés. Il existe un modèle par type d'alerte : séisme, tsunami, vent, tempête, pluie-inondation, crues, inondation, vagues-submersion, orages, neige, canicule, pollution…
  - **carte des tsunamis** en plein écran, aux côtes qui clignotent (avertissement majeur, avertissement, avis), Nouvelle-Calédonie comprise ;
  - **cadre « Information(s) M-Alert »** : alerte annulée (« L'alerte précédente a été annulée. Aucun danger n'est attendu. ») et notifications envoyées depuis M-Alert-sender.

  Les options sont : catégories, départements, niveau minimum, durée d'affichage, position, largeur, son, alertes de test et aperçus.
- **Réglages avancés du son** : durée maximale du son répété, montée progressive du volume, vibration (téléphone), son des informations et notifications, heures calmes avec les alertes qui sonnent quand même.
- **M-Alert-sender** :
  - **image de l'alerte** (bandeau façon NHK) : aperçu en direct et téléchargement PNG, y compris pour les alertes en cours, planifiées et de l'historique. Une alerte annulée donne le cadre « Information(s) M-Alert ».
  - **cadre « Information(s) M-Alert » des notifications** : aperçu et téléchargement depuis l'onglet 🔔.
  - **tableau des prévisions dans une alerte manuelle** (vent violent, tempête, inondation, vagues-submersion) : une ligne par département, modifiable ; le niveau, le titre et la description suivent le tableau.
  - **autres alertes automatiques** :
    - vigilances Météo-France orange et rouge des orages, crues, neige-verglas, canicule, grand froid et avalanches (Nouvelle-Calédonie : fortes pluies-orages, forte houle) ;
    - épisodes de pollution de l'air (ozone, dioxyde d'azote, PM10) prévus par Copernicus, comparés aux seuils réglementaires.

    Chaque type peut être désactivé, à valider ou automatique. Les alertes suivent la vigilance ou la prévision et sont levées quand elle disparaît.
  - **Soundux** (application de bureau) : chaque nouvelle alerte peut lancer `soundux play "{fichier}"` avec le son de son type : EEW.mp3, EEW (2).mp3, EEW (Léger).mp3, Rouge.mp3 ou Majeur.mp3.
- La version web est désormais à l'adresse https://malik05051.github.io/M-Alert/.
