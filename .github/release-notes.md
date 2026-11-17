## M-Alert 3.1.0

- **📡 Marégraphes de l'UNESCO** : pendant une alerte tsunami ou vagues-submersion, le niveau de la mer mesuré chaque minute dans le port le plus proche de chaque département concerné.
  - **Tsunami** : la vague mesurée (« Vague mesurée 30 cm à 14 h 32, Nice »), ou « Pas de vague mesurée ».
  - **Vagues-submersion** : la dernière pleine mer mesurée, par rapport aux plus hautes mers du mois.
  - Affichées dans le tableau de l'alerte, dans l'incrustation OBS (« mesuré ») et dans M-Alert-sender. Ce sont des mesures seulement : elles ne changent pas les alertes.
- **Heures d'arrivée du tsunami améliorées** : dès qu'un marégraphe voit arriver la vague, son temps de trajet réel corrige les heures estimées des autres côtes, et l'arrivée mesurée remplace l'heure prévue.
- **Hauteurs en centimètres** : sous 1 m, une vague ou un niveau de la mer s'affiche en centimètres (« 5 cm » au lieu de « 0,1 m ») ; le tableau tsunami du sender accepte les centimètres.
- **Incrustation OBS pilotée depuis M-Alert-sender** (onglet 📡) : carte plein écran, mini-carte et tableau des mesures du tsunami et des vagues-submersion, alerte missile et son écran plein (Auto, Afficher ou Masquer jusqu'à la prochaine alerte), et mesures des marégraphes affichées ou non.
- **🌊 Bouées de houle du Cerema (Candhis)** : pendant une alerte vagues-submersion, la hauteur des vagues mesurée au large (« Vagues mesurées 2,4 m (max 4,1 m) à 14 h, bouée … ») dans l'application, l'incrustation OBS et M-Alert-sender (avec une clé d'accès Candhis sur le serveur).

### Application mobile
- **iOS refait** : plus de zoom accidentel au toucher, interface sous l'encoche et la Dynamic Island corrigée.
- **Notifications iOS** : **urgentes** dès l'orange (elles traversent les modes de concentration), **critiques** en rouge et majeure (elles sonnent même en mode silencieux, avec l'autorisation d'Apple).
- **iOS : alertes application fermée**, comme l'application Clip d'AltStore : M-Alert reste actif en arrière-plan grâce à la localisation (choisir « Toujours ») et à un son silencieux. Une notification prévient si iOS l'arrête quand même.
- **Son d'alerte mobile** pour les alertes orange, rouges et majeures (iOS et Android).
- **Séismes en deux langues** dans les notifications, comme les alertes d'urgence japonaises : français en haut, anglais en dessous ; allemand ou espagnol au choix (« Alerte sismique précoce : Des secousses sont attendues. Intensité attendue : 4. Restez calme et protégez-vous. (M-Alert) »).
- **Alertes annulées** annoncées dans les mêmes langues (« L'alerte de tremblement de terre émise à 14 h 32 a été annulée. (M-Alert) »), aussi application fermée.
- **Alerte séisme selon la magnitude ou l'intensité attendue chez vous** (réglage « M'alerter d'un séisme selon »).
- **Mises à jour** : l'application cherche les nouvelles versions et propose de télécharger l'APK (Android) ou l'IPA (iOS).

### Toutes les versions
- **Langues** : français, anglais, allemand et espagnol (Réglages > Application > Langue).
- **Interrupteurs** façon iOS dans les réglages.
