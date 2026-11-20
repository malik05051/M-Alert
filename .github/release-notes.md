## M-Alert 3.2.0

- **Son choisi par alerte** : M-Alert-sender peut imposer le son d'une alerte (Alerte mobile, séisme EEW, EEW 2, EEW léger, EEW, rouge, majeur, tsunami, information) ; il est joué par l'application, sur Android aussi application fermée (sur iOS application fermée, seule l'alerte mobile a son propre son).
- **Batterie (iOS et Android)** : la réception en arrière-plan ne reçoit plus que les alertes et notifications qui sonnent, et ne réveille le téléphone qu'une fois par minute au lieu d'environ quatre ; la notification « M-Alert ne reçoit plus les alertes » apparaît après 5 minutes sans réveil.
- **Méthode PLUM** : les alertes séisme nées des secousses mesurées par les stations (méthode de l'agence météorologique japonaise) portent la mention « 📈 PLUM ».
- **Incrustation OBS : alerte montrée depuis M-Alert-sender** (« 🎥 Afficher dans OBS ») : une alerte en cours est rejouée comme à son arrivée (bandeau, carte des côtes, panneau du séisme, écran du missile).
- **Incrustation OBS : intensités toujours à jour** : la carte des intensités est redessinée dès que le séisme est corrigé (magnitude, profondeur, épicentre, intensités), même choisi dans M-Alert-sender et terminé.
- **Incrustation OBS : magnitude** « M5.7 » d'un seul texte jaune à côté de l'heure, affichable ou masquable depuis M-Alert-sender ou le script OBS.
- Script OBS mis à jour (version de la page 3.2.0) : remplacez `m-alert.lua` dans OBS.
