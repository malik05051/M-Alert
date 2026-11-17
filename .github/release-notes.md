## M-Alert 3.1.0

- **📡 Marégraphes de l'UNESCO** : pendant une alerte tsunami ou vagues-submersion, le niveau de la mer mesuré chaque minute dans le port le plus proche de chaque département concerné.
  - **Tsunami** : la vague mesurée (« Vague mesurée 30 cm à 14 h 32, Nice »), ou « Pas de vague mesurée ».
  - **Vagues-submersion** : la dernière pleine mer mesurée, par rapport aux plus hautes mers du mois.
  - Affichées dans le tableau de l'alerte, dans l'incrustation OBS (« mesuré ») et dans M-Alert-sender. Ce sont des mesures seulement : elles ne changent pas les alertes.
- **Heures d'arrivée du tsunami améliorées** : dès qu'un marégraphe voit arriver la vague, son temps de trajet réel corrige les heures estimées des autres côtes, et l'arrivée mesurée remplace l'heure prévue.
- **Hauteurs en centimètres** : sous 1 m, une vague ou un niveau de la mer s'affiche en centimètres (« 5 cm » au lieu de « 0,1 m ») ; le tableau tsunami du sender accepte les centimètres.
- **Incrustation OBS pilotée depuis M-Alert-sender** (onglet 📡) : carte plein écran, mini-carte et tableau des mesures du tsunami et des vagues-submersion, alerte missile et son écran plein (Auto, Afficher ou Masquer jusqu'à la prochaine alerte), et mesures des marégraphes affichées ou non.
