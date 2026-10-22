Alertes météo en temps réel par département, avec la carte de vigilance Météo-France.

## Nouveautés de la 2.5.0
- **Tableau des alertes vent violent et vagues-submersion**, comme celui d'un tsunami : les départements sont regroupés par niveau, chacun avec le début, la fin et le pic prévus, les rafales et le vent moyen (ou la hauteur des vagues, le niveau de la mer et la surcote). Votre département est signalé par 📍.
- **Après-demain** sur la carte : Météo-France ne publie la vigilance que pour aujourd'hui et demain ; M-Alert affiche pour après-demain sa propre prévision du vent violent et des vagues-submersion (mention « prévision M-Alert »).
- **M-Alert-sender : plusieurs alertes à la fois** : cochez des alertes en cours pour les relancer, planifier leur relance, les lever ou les annuler (fausse alerte) en une fois ; cochez des alertes planifiées pour les envoyer maintenant ou annuler leur envoi.
- **M-Alert-sender : démarrage automatique corrigé** (paquet Arch) : au démarrage de la session, Electron s'ouvrait seul, sans le sender. Ouvrez une fois le sender après la mise à jour pour corriger le lancement automatique.
- Une alerte vent ou vagues-submersion automatique levée ou annulée (fausse alerte) n'est plus renvoyée aussitôt à un niveau plus bas pour les mêmes départements.
