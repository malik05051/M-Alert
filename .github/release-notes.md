Alertes météo en temps réel par département, avec la carte de vigilance Météo-France.

## Nouveautés de la 2.5.1
- **Plus de faux séismes dus aux ondes d'un fort séisme lointain** : le 23 octobre, les ondes d'un séisme de magnitude 5,6 au nord de la Sicile ont été prises par un système automatique pour un séisme de magnitude 3,5 en Corse, qui n'a jamais eu lieu. Un séisme situé là où passaient au même moment les ondes d'un séisme bien plus fort est maintenant « douteux » : il n'est plus envoyé automatiquement, et ses alertes automatiques déjà envoyées sont annulées (« Fausse alerte : ce séisme n'a pas eu lieu »).
- **M-Alert-sender** : un séisme douteux affiche « Douteux, non diffusé : sans doute les ondes du séisme de magnitude … », avec « Diffuser quand même ».
- **Vagues-submersion** : la vigilance du littoral de Météo-France est bien reprise (côtes sur la carte, info-bulles, « Alertes en cours ») ; lever une autre vigilance dans le sender ne colore plus le département avec celle des vagues-submersion.
