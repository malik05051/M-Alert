/* M-Alert — langues de l'interface (français, anglais, allemand, espagnol) et textes des notifications.
 *
 * L'interface est écrite en français ; dans une autre langue, les textes affichés sont traduits à la
 * volée (au chargement puis à chaque ajout dans la page) à partir du dictionnaire ci-dessous. Les
 * textes rédigés par M-Alert (titre et description des alertes) restent dans leur langue.
 *
 * Les notifications de tremblement de terre sont écrites dans deux langues, comme les alertes
 * d'urgence japonaises : la langue principale en haut, la seconde en dessous (réglages).
 */
(function () {
  'use strict';

  const LANGS = { fr: 'Français', en: 'English', de: 'Deutsch', es: 'Español' };

  // Texte français : [anglais, allemand, espagnol].
  const DICT = {
    // Barre supérieure, carte, listes
    'Connexion…': ['Connecting…', 'Verbindung…', 'Conectando…'],
    'Connecté': ['Connected', 'Verbunden', 'Conectado'],
    'Déconnecté — nouvelle tentative…': ['Disconnected — retrying…', 'Getrennt — neuer Versuch…', 'Desconectado — reintentando…'],
    'Serveur non configuré': ['Server not configured', 'Server nicht eingerichtet', 'Servidor no configurado'],
    'Adresse du serveur invalide': ['Invalid server address', 'Ungültige Serveradresse', 'Dirección del servidor no válida'],
    "Aujourd'hui": ['Today', 'Heute', 'Hoy'],
    'Demain': ['Tomorrow', 'Morgen', 'Mañana'],
    'Après-demain': ['Day after tomorrow', 'Übermorgen', 'Pasado mañana'],
    'Échéance de la vigilance': ['Warning period', 'Warnzeitraum', 'Periodo de vigilancia'],
    'Prévision M-Alert (vent violent, tempête, vagues-submersion, pluie-inondation) : Météo-France ne publie pas de vigilance au-delà de demain': ['M-Alert forecast (strong wind, storm, coastal flooding, rain-flood): Météo-France does not publish warnings beyond tomorrow', 'M-Alert-Vorhersage (Sturm, Orkan, Sturmflut, Starkregen): Météo-France veröffentlicht keine Warnungen über morgen hinaus', 'Previsión de M-Alert (viento fuerte, temporal, oleaje-inundación, lluvia-inundación): Météo-France no publica avisos más allá de mañana'],
    'Notifications': ['Notifications', 'Benachrichtigungen', 'Notificaciones'],
    'Alertes en cours': ['Current alerts', 'Aktuelle Warnungen', 'Alertas en curso'],
    'Filtrer les alertes': ['Filter alerts', 'Warnungen filtern', 'Filtrar alertas'],
    'Toutes les alertes': ['All alerts', 'Alle Warnungen', 'Todas las alertas'],
    'Aucune alerte en cours ✅': ['No current alerts ✅', 'Keine aktuellen Warnungen ✅', 'Ninguna alerta en curso ✅'],
    'Aucune alerte de ce type en cours.': ['No current alerts of this type.', 'Keine aktuellen Warnungen dieser Art.', 'Ninguna alerta de este tipo en curso.'],
    'Vigilance Météo-France': ['Météo-France warnings', 'Météo-France-Warnungen', 'Vigilancia de Météo-France'],
    'Vigilance : en attente…': ['Warnings: waiting…', 'Warnungen: warten…', 'Vigilancia: esperando…'],
    'Vigilance en attente du serveur…': ['Warnings: waiting for the server…', 'Warnungen: warten auf den Server…', 'Vigilancia: esperando al servidor…'],
    'Après-demain : prévision M-Alert pas encore disponible.': ['Day after tomorrow: M-Alert forecast not yet available.', 'Übermorgen: M-Alert-Vorhersage noch nicht verfügbar.', 'Pasado mañana: previsión de M-Alert aún no disponible.'],
    'Département coloré : alerte M-Alert en cours. Côte colorée : alerte tsunami ou vagues-submersion. ✕ : épicentre d\'un tremblement de terre. Contour pointillé : vos départements.': ['Coloured department: current M-Alert alert. Coloured coast: tsunami or coastal flooding alert. ✕: earthquake epicentre. Dotted outline: your departments.', 'Farbiges Département: aktuelle M-Alert-Warnung. Farbige Küste: Tsunami- oder Sturmflutwarnung. ✕: Epizentrum eines Erdbebens. Gepunkteter Umriss: Ihre Départements.', 'Departamento coloreado: alerta de M-Alert en curso. Costa coloreada: alerta de tsunami u oleaje-inundación. ✕: epicentro de un terremoto. Contorno punteado: sus departamentos.'],
    'Mon département': ['My department', 'Mein Département', 'Mi departamento'],
    'Département sélectionné': ['Selected department', 'Ausgewähltes Département', 'Departamento seleccionado'],
    'Suivre aussi': ['Follow too', 'Auch folgen', 'Seguir también'],
    'Ne plus suivre': ['Unfollow', 'Nicht mehr folgen', 'Dejar de seguir'],
    'Définir comme mon département': ['Set as my department', 'Als mein Département festlegen', 'Definir como mi departamento'],
    'Fermer': ['Close', 'Schließen', 'Cerrar'],
    'Télécharger': ['Download', 'Herunterladen', 'Descargar'],
    'Plus tard': ['Later', 'Später', 'Más tarde'],
    'Redémarrer et installer': ['Restart and install', 'Neu starten und installieren', 'Reiniciar e instalar'],
    // Niveaux, catégories, phénomènes
    'Vert': ['Green', 'Grün', 'Verde'],
    'Jaune': ['Yellow', 'Gelb', 'Amarillo'],
    'Orange': ['Orange', 'Orange', 'Naranja'],
    'Rouge': ['Red', 'Rot', 'Rojo'],
    'Majeure': ['Major', 'Extrem', 'Máxima'],
    'Majeur': ['Major', 'Extrem', 'Máximo'],
    'Information': ['Information', 'Information', 'Información'],
    'Vigilance': ['Watch', 'Vorwarnung', 'Vigilancia'],
    'Vigilance renforcée': ['Heightened watch', 'Erhöhte Vorwarnung', 'Vigilancia reforzada'],
    'Avis': ['Advisory', 'Hinweis', 'Aviso'],
    'Avertissement': ['Warning', 'Warnung', 'Advertencia'],
    'Avertissement majeur': ['Major warning', 'Schwere Warnung', 'Advertencia máxima'],
    'Faible': ['Low', 'Gering', 'Bajo'],
    'Moyen': ['Moderate', 'Mittel', 'Moderado'],
    'Élevé': ['High', 'Hoch', 'Alto'],
    'Niveau jaune': ['Yellow level', 'Stufe Gelb', 'Nivel amarillo'],
    'Niveau orange': ['Orange level', 'Stufe Orange', 'Nivel naranja'],
    'Niveau rouge': ['Red level', 'Stufe Rot', 'Nivel rojo'],
    'Niveau majeur': ['Major level', 'Extreme Stufe', 'Nivel máximo'],
    'Météo': ['Weather', 'Wetter', 'Meteorología'],
    'Tremblement de terre': ['Earthquake', 'Erdbeben', 'Terremoto'],
    'Tsunami': ['Tsunami', 'Tsunami', 'Tsunami'],
    'Missile': ['Missile', 'Rakete', 'Misil'],
    'Incendie': ['Fire', 'Brand', 'Incendio'],
    'Pollution': ['Pollution', 'Verschmutzung', 'Contaminación'],
    'Attentat': ['Terrorist attack', 'Anschlag', 'Atentado'],
    'Alerte attentat': ['Terrorist attack alert', 'Anschlagswarnung', 'Alerta de atentado'],
    'Accident industriel': ['Industrial accident', 'Industrieunfall', 'Accidente industrial'],
    'Grève': ['Strike', 'Streik', 'Huelga'],
    'Blocus / manifestation': ['Blockade / demonstration', 'Blockade / Demonstration', 'Bloqueo / manifestación'],
    'Autre': ['Other', 'Sonstiges', 'Otro'],
    'Vent violent': ['Strong wind', 'Sturm', 'Viento fuerte'],
    'Tempête': ['Storm', 'Orkan', 'Temporal'],
    'Pluie-inondation': ['Rain-flood', 'Starkregen-Überschwemmung', 'Lluvia-inundación'],
    'Inondation': ['Flood', 'Überschwemmung', 'Inundación'],
    'Crues': ['River floods', 'Hochwasser', 'Crecidas'],
    'Orages': ['Thunderstorms', 'Gewitter', 'Tormentas'],
    'Fortes pluies-orages': ['Heavy rain and thunderstorms', 'Starkregen und Gewitter', 'Lluvias fuertes y tormentas'],
    'Neige-verglas': ['Snow-ice', 'Schnee-Glätte', 'Nieve-hielo'],
    'Canicule': ['Heatwave', 'Hitzewelle', 'Ola de calor'],
    'Grand froid': ['Extreme cold', 'Strenge Kälte', 'Frío extremo'],
    'Avalanches': ['Avalanches', 'Lawinen', 'Aludes'],
    'Vagues-submersion': ['Coastal flooding', 'Sturmflut', 'Oleaje-inundación'],
    'Forte houle': ['Heavy swell', 'Starke Dünung', 'Mar de fondo fuerte'],
    'Tornade': ['Tornado', 'Tornado', 'Tornado'],
    'Feu de forêt': ['Forest fire', 'Waldbrand', 'Incendio forestal'],
    'Pas de données': ['No data', 'Keine Daten', 'Sin datos'],
    'Avis de tsunami': ['Tsunami advisory', 'Tsunami-Hinweis', 'Aviso de tsunami'],
    'Avertissement de tsunami': ['Tsunami warning', 'Tsunamiwarnung', 'Advertencia de tsunami'],
    'Avertissement majeur de tsunami': ['Major tsunami warning', 'Schwere Tsunamiwarnung', 'Advertencia máxima de tsunami'],
    'Arrivée imminente': ['Arrival imminent', 'Ankunft unmittelbar', 'Llegada inminente'],
    'Déjà arrivé': ['Already arrived', 'Bereits eingetroffen', 'Ya llegó'],
    'Probablement arrivé': ['Probably arrived', 'Wahrscheinlich eingetroffen', 'Probablemente llegó'],
    'Intensité maximale (échelle shindo)': ['Maximum intensity (shindo scale)', 'Maximale Intensität (Shindo-Skala)', 'Intensidad máxima (escala shindo)'],
    'Intensité attendue dans votre département (estimation)': ['Expected intensity in your department (estimate)', 'Erwartete Intensität in Ihrem Département (Schätzung)', 'Intensidad esperada en su departamento (estimación)'],
    // Bandeau d'alerte
    'Alerte sismique précoce faible': ['Earthquake early warning: low', 'Erdbebenfrühwarnung: gering', 'Alerta sísmica temprana: baja'],
    'Alerte sismique précoce moyenne': ['Earthquake early warning: moderate', 'Erdbebenfrühwarnung: mittel', 'Alerta sísmica temprana: moderada'],
    'Alerte sismique précoce élevée': ['Earthquake early warning: high', 'Erdbebenfrühwarnung: hoch', 'Alerta sísmica temprana: alta'],
    'Alerte sismique précoce majeure': ['Earthquake early warning: major', 'Erdbebenfrühwarnung: extrem', 'Alerta sísmica temprana: máxima'],
    'Avis de missile': ['Missile advisory', 'Raketenhinweis', 'Aviso de misil'],
    'Avertissement de missile': ['Missile warning', 'Raketenwarnung', 'Advertencia de misil'],
    'Avertissement majeur de missile': ['Major missile warning', 'Schwere Raketenwarnung', 'Advertencia máxima de misil'],
    "Avis d'incendie": ['Fire advisory', 'Brandhinweis', 'Aviso de incendio'],
    "Avertissement d'incendie": ['Fire warning', 'Brandwarnung', 'Advertencia de incendio'],
    "Avertissement majeur d'incendie": ['Major fire warning', 'Schwere Brandwarnung', 'Advertencia máxima de incendio'],
    'Vigipirate – vigilance': ['Vigipirate – watch', 'Vigipirate – Vorwarnung', 'Vigipirate – vigilancia'],
    'Vigipirate – vigilance renforcée': ['Vigipirate – heightened watch', 'Vigipirate – erhöhte Vorwarnung', 'Vigipirate – vigilancia reforzada'],
    'Alerte annulée': ['Alert cancelled', 'Warnung aufgehoben', 'Alerta anulada'],
    'chez vous': ['where you are', 'bei Ihnen', 'en su zona'],
    'Profondeur :': ['Depth:', 'Tiefe:', 'Profundidad:'],
    'Onde P : dans': ['P wave: in', 'P-Welle: in', 'Onda P: en'],
    'Onde S : dans': ['S wave: in', 'S-Welle: in', 'Onda S: en'],
    'En attente': ['Waiting', 'Warten', 'En espera'],
    'Arrivée prévue du tsunami': ['Expected tsunami arrival', 'Erwartete Ankunft des Tsunamis', 'Llegada prevista del tsunami'],
    'TEST': ['TEST', 'TEST', 'PRUEBA'],
    'Consignes': ['What to do', 'Verhaltenshinweise', 'Instrucciones'],
    'Couper le son': ['Mute', 'Ton aus', 'Silenciar'],
    'Couper aussi le son du compte à rebours': ['Also mute the countdown', 'Auch den Countdown stummschalten', 'Silenciar también la cuenta atrás'],
    "J'ai compris": ['Got it', 'Verstanden', 'Entendido'],
    'Consultable 24 h dans « Notifications »': ['Available for 24 h in “Notifications”', '24 Std. unter „Benachrichtigungen“ abrufbar', 'Disponible 24 h en «Notificaciones»'],
    '🔇 Touchez l\'écran pour autoriser le son des alertes': ['🔇 Tap the screen to allow alert sounds', '🔇 Tippen Sie auf den Bildschirm, um den Warnton zu erlauben', '🔇 Toque la pantalla para permitir el sonido de las alertas'],
    // Réglages
    'Réglages': ['Settings', 'Einstellungen', 'Ajustes'],
    'Bienvenue sur M-Alert': ['Welcome to M-Alert', 'Willkommen bei M-Alert', 'Bienvenido a M-Alert'],
    'Bienvenue ! Choisissez votre département pour recevoir les alertes météo diffusées par M-Alert. Vous entendrez une alerte sonore et recevrez une notification dès qu\'une alerte concerne votre département.': ['Welcome! Choose your department to receive the weather alerts broadcast by M-Alert. You will hear an alarm and receive a notification as soon as an alert concerns your department.', 'Willkommen! Wählen Sie Ihr Département, um die von M-Alert verbreiteten Wetterwarnungen zu erhalten. Sie hören einen Warnton und erhalten eine Benachrichtigung, sobald eine Warnung Ihr Département betrifft.', '¡Bienvenido! Elija su departamento para recibir las alertas meteorológicas difundidas por M-Alert. Oirá una alarma y recibirá una notificación en cuanto una alerta afecte a su departamento.'],
    'Département': ['Department', 'Département', 'Departamento'],
    'Autres départements suivis': ['Other followed departments', 'Weitere verfolgte Départements', 'Otros departamentos seguidos'],
    'Rechercher un département…': ['Search for a department…', 'Département suchen…', 'Buscar un departamento…'],
    'Recevoir les alertes de toute la France': ['Receive alerts for all of France', 'Warnungen für ganz Frankreich erhalten', 'Recibir las alertas de toda Francia'],
    '— Choisir —': ['— Choose —', '— Auswählen —', '— Elegir —'],
    'Alerte': ['Alert', 'Warnung', 'Alerta'],
    "Catégories d'alertes reçues": ['Alert categories received', 'Empfangene Warnkategorien', 'Categorías de alertas recibidas'],
    'Phénomènes météo reçus': ['Weather phenomena received', 'Empfangene Wetterphänomene', 'Fenómenos meteorológicos recibidos'],
    'Niveau minimum pour sonner et notifier': ['Minimum level to ring and notify', 'Mindeststufe für Ton und Benachrichtigung', 'Nivel mínimo para sonar y notificar'],
    'Toutes (dès « Information »)': ['All (from “Information”)', 'Alle (ab „Information“)', 'Todas (desde «Información»)'],
    'Jaune et plus': ['Yellow and above', 'Gelb und höher', 'Amarillo y superior'],
    'Orange et plus': ['Orange and above', 'Orange und höher', 'Naranja y superior'],
    'Rouge et majeure': ['Red and major', 'Rot und extrem', 'Rojo y máxima'],
    'Majeure uniquement': ['Major only', 'Nur extrem', 'Solo máxima'],
    'Tous les fuseaux': ['All time zones', 'Alle Zeitzonen', 'Todas las zonas horarias'],
    'Fuseau horaire': ['Time zone', 'Zeitzone', 'Zona horaria'],
    'Toutes les heures affichées (alertes, tableaux, horloge) suivent ce fuseau. Les textes rédigés par M-Alert-sender gardent leurs propres heures.': ['All displayed times (alerts, tables, clock) follow this time zone. Texts written in M-Alert-sender keep their own times.', 'Alle angezeigten Uhrzeiten (Warnungen, Tabellen, Uhr) folgen dieser Zeitzone. Von M-Alert-sender verfasste Texte behalten ihre eigenen Uhrzeiten.', 'Todas las horas mostradas (alertas, tablas, reloj) siguen esta zona horaria. Los textos redactados en M-Alert-sender conservan sus propias horas.'],
    "Son d'alerte": ['Alert sound', 'Warnton', 'Sonido de alerta'],
    'Volume': ['Volume', 'Lautstärke', 'Volumen'],
    'Sons des alertes': ['Alert sounds', 'Warntöne', 'Sonidos de las alertas'],
    "Choisissez le son de chaque type d'alerte et son volume (par rapport au volume général) ; ▶ pour l'écouter.": ['Choose the sound of each type of alert and its volume (relative to the main volume); ▶ to listen.', 'Wählen Sie den Ton jeder Warnart und seine Lautstärke (relativ zur Gesamtlautstärke); ▶ zum Anhören.', 'Elija el sonido de cada tipo de alerta y su volumen (respecto al volumen general); ▶ para escucharlo.'],
    'Information et notifications': ['Information and notifications', 'Information und Benachrichtigungen', 'Información y notificaciones'],
    'Jaune et orange': ['Yellow and orange', 'Gelb und Orange', 'Amarillo y naranja'],
    'Crues, inondations, tsunamis': ['Floods, tsunamis', 'Hochwasser, Überschwemmungen, Tsunamis', 'Crecidas, inundaciones, tsunamis'],
    'Bip du compte à rebours (séismes)': ['Countdown beep (earthquakes)', 'Countdown-Piepton (Erdbeben)', 'Pitido de la cuenta atrás (terremotos)'],
    'Par défaut': ['Default', 'Standard', 'Predeterminado'],
    'Choisi par M-Alert': ['Chosen by M-Alert', 'Von M-Alert gewählt', 'Elegido por M-Alert'],
    'Jaune / orange': ['Yellow / orange', 'Gelb / Orange', 'Amarillo / naranja'],
    'Crues et tsunami': ['Floods and tsunami', 'Hochwasser und Tsunami', 'Crecidas y tsunami'],
    'Séisme EEW': ['Earthquake EEW', 'Erdbeben EEW', 'Terremoto EEW'],
    'Séisme EEW 2': ['Earthquake EEW 2', 'Erdbeben EEW 2', 'Terremoto EEW 2'],
    'Séisme EEW léger': ['Earthquake EEW (light)', 'Erdbeben EEW (leicht)', 'Terremoto EEW (leve)'],
    'Bip du compte à rebours': ['Countdown beep', 'Countdown-Piepton', 'Pitido de la cuenta atrás'],
    'Orange, rouge et majeure (application mobile)': ['Orange, red and major (mobile app)', 'Orange, Rot und extrem (mobile App)', 'Naranja, rojo y máxima (aplicación móvil)'],
    'Alerte mobile': ['Mobile alert', 'Mobile Warnung', 'Alerta móvil'],
    "Répéter le son jusqu'à « J'ai compris » (orange et rouge)": ['Repeat the sound until “Got it” (orange and red)', 'Ton wiederholen bis „Verstanden“ (Orange und Rot)', 'Repetir el sonido hasta «Entendido» (naranja y rojo)'],
    'Réglages avancés du son': ['Advanced sound settings', 'Erweiterte Toneinstellungen', 'Ajustes avanzados del sonido'],
    'Durée maximale du son répété': ['Maximum duration of the repeated sound', 'Maximale Dauer des wiederholten Tons', 'Duración máxima del sonido repetido'],
    '30 secondes': ['30 seconds', '30 Sekunden', '30 segundos'],
    '1 minute': ['1 minute', '1 Minute', '1 minuto'],
    '2 minutes': ['2 minutes', '2 Minuten', '2 minutos'],
    '5 minutes': ['5 minutes', '5 Minuten', '5 minutos'],
    "Jusqu'à « J'ai compris »": ['Until “Got it”', 'Bis „Verstanden“', 'Hasta «Entendido»'],
    'Montée progressive du volume (le son part bas et monte en 6 secondes)': ['Gradual volume increase (the sound starts low and rises over 6 seconds)', 'Allmählich lauter (der Ton beginnt leise und steigt in 6 Sekunden an)', 'Aumento progresivo del volumen (empieza bajo y sube en 6 segundos)'],
    'Vibrer (téléphone) : court pour une information, long et répété pour une alerte rouge ou majeure': ['Vibrate (phone): short for information, long and repeated for a red or major alert', 'Vibrieren (Telefon): kurz bei einer Information, lang und wiederholt bei einer roten oder extremen Warnung', 'Vibrar (teléfono): corto para una información, largo y repetido para una alerta roja o máxima'],
    'Son pour les informations et les notifications de M-Alert': ['Sound for M-Alert information and notifications', 'Ton für Informationen und Benachrichtigungen von M-Alert', 'Sonido para las informaciones y notificaciones de M-Alert'],
    'Heures calmes : pas de son ni de vibration, sauf pour les alertes fortes': ['Quiet hours: no sound or vibration, except for strong alerts', 'Ruhezeiten: kein Ton und keine Vibration, außer bei starken Warnungen', 'Horas de silencio: sin sonido ni vibración, salvo alertas fuertes'],
    'De': ['From', 'Von', 'De'],
    'À': ['To', 'Bis', 'A'],
    'Pendant les heures calmes, sonner quand même': ['During quiet hours, ring anyway for', 'In den Ruhezeiten trotzdem läuten bei', 'Durante las horas de silencio, sonar igualmente con'],
    'Alertes rouges et majeures, séismes et tsunamis': ['Red and major alerts, earthquakes and tsunamis', 'Roten und extremen Warnungen, Erdbeben und Tsunamis', 'Alertas rojas y máximas, terremotos y tsunamis'],
    'Alertes majeures, séismes et tsunamis': ['Major alerts, earthquakes and tsunamis', 'Extremen Warnungen, Erdbeben und Tsunamis', 'Alertas máximas, terremotos y tsunamis'],
    'Séismes et tsunamis seulement': ['Earthquakes and tsunamis only', 'Nur Erdbeben und Tsunamis', 'Solo terremotos y tsunamis'],
    'Jamais': ['Never', 'Nie', 'Nunca'],
    'Me prévenir quand la vigilance de mes départements passe en jaune, orange ou rouge': ['Tell me when the warning level of my departments turns yellow, orange or red', 'Mich benachrichtigen, wenn die Warnstufe meiner Départements auf Gelb, Orange oder Rot steigt', 'Avisarme cuando la vigilancia de mis departamentos pase a amarillo, naranja o rojo'],
    'Afficher la fenêtre au premier plan lors d\'une alerte': ['Bring the window to the front during an alert', 'Fenster bei einer Warnung in den Vordergrund holen', 'Mostrar la ventana en primer plano durante una alerta'],
    'Recevoir les alertes en arrière-plan, application fermée (notification permanente « M-Alert » ; chaque son a son canal dans les réglages Android des notifications)': ['Receive alerts in the background with the app closed (permanent “M-Alert” notification; each sound has its own channel in Android notification settings)', 'Warnungen im Hintergrund bei geschlossener App empfangen (dauerhafte Benachrichtigung „M-Alert“; jeder Ton hat seinen Kanal in den Android-Benachrichtigungseinstellungen)', 'Recibir alertas en segundo plano con la aplicación cerrada (notificación permanente «M-Alert»; cada sonido tiene su canal en los ajustes de notificaciones de Android)'],
    'Recevoir les alertes en arrière-plan, application fermée (comme Clip : M-Alert reste actif grâce à la localisation, à autoriser « Toujours », et à un son silencieux ; un peu plus de batterie)': ['Receive alerts in the background with the app closed (like Clip: M-Alert stays active using location, set to “Always”, and a silent sound; uses a little more battery)', 'Warnungen im Hintergrund bei geschlossener App empfangen (wie Clip: M-Alert bleibt über den Standort, auf „Immer“ gestellt, und einen stillen Ton aktiv; etwas mehr Akkuverbrauch)', 'Recibir alertas en segundo plano con la aplicación cerrada (como Clip: M-Alert sigue activa gracias a la ubicación, en «Siempre», y a un sonido silencioso; algo más de batería)'],
    '✅ Localisation : Toujours': ['✅ Location: Always', '✅ Standort: Immer', '✅ Ubicación: Siempre'],
    "⚠️ Localisation : « Lorsque l'app est active » ; choisissez « Toujours » (Réglages iOS > M-Alert > Position) pour ne pas être arrêté": ['⚠️ Location: “While Using the App”; choose “Always” (iOS Settings > M-Alert > Location) so it is not stopped', '⚠️ Standort: „Beim Verwenden der App“; wählen Sie „Immer“ (iOS-Einstellungen > M-Alert > Standort), damit sie nicht beendet wird', '⚠️ Ubicación: «Cuando se use la app»; elija «Siempre» (Ajustes de iOS > M-Alert > Ubicación) para que no se detenga'],
    "⛔ Localisation refusée : la réception s'arrête quand l'application est quittée (Réglages iOS > M-Alert > Position > Toujours)": ['⛔ Location denied: reception stops when you leave the app (iOS Settings > M-Alert > Location > Always)', '⛔ Standort verweigert: Der Empfang endet beim Verlassen der App (iOS-Einstellungen > M-Alert > Standort > Immer)', '⛔ Ubicación denegada: la recepción se detiene al salir de la app (Ajustes de iOS > M-Alert > Ubicación > Siempre)'],
    '✅ Connecté en arrière-plan': ['✅ Connected in the background', '✅ Im Hintergrund verbunden', '✅ Conectado en segundo plano'],
    '⏳ Connexion en arrière-plan…': ['⏳ Connecting in the background…', '⏳ Verbindung im Hintergrund…', '⏳ Conectando en segundo plano…'],
    'Autoriser les notifications': ['Allow notifications', 'Benachrichtigungen erlauben', 'Permitir notificaciones'],
    'Notifications non autorisées': ['Notifications not allowed', 'Benachrichtigungen nicht erlaubt', 'Notificaciones no permitidas'],
    '✅ Notifications autorisées': ['✅ Notifications allowed', '✅ Benachrichtigungen erlaubt', '✅ Notificaciones permitidas'],
    'Notifications non prises en charge sur cet appareil.': ['Notifications are not supported on this device.', 'Benachrichtigungen werden auf diesem Gerät nicht unterstützt.', 'Las notificaciones no son compatibles con este dispositivo.'],
    '✅ Notifications push actives sur cet appareil.': ['✅ Push notifications active on this device.', '✅ Push-Benachrichtigungen auf diesem Gerät aktiv.', '✅ Notificaciones push activas en este dispositivo.'],
    "Recevoir les notifications de M-Alert (messages d'information, sans alerte)": ['Receive M-Alert notifications (information messages, without alert)', 'Benachrichtigungen von M-Alert empfangen (Informationsmeldungen ohne Warnung)', 'Recibir las notificaciones de M-Alert (mensajes informativos, sin alerta)'],
    "Recevoir les alertes même quand l'application est fermée (push)": ['Receive alerts even when the app is closed (push)', 'Warnungen auch bei geschlossener App empfangen (Push)', 'Recibir alertas incluso con la aplicación cerrada (push)'],
    'Application': ['App', 'App', 'Aplicación'],
    'Fond de carte détaillé (villes, routes)': ['Detailed base map (towns, roads)', 'Detaillierte Grundkarte (Städte, Straßen)', 'Mapa base detallado (ciudades, carreteras)'],
    'Afficher les vigilances Météo-France (jaune, orange, rouge) dans « Alertes en cours »': ['Show Météo-France warnings (yellow, orange, red) in “Current alerts”', 'Météo-France-Warnungen (Gelb, Orange, Rot) unter „Aktuelle Warnungen“ anzeigen', 'Mostrar las vigilancias de Météo-France (amarillo, naranja, rojo) en «Alertas en curso»'],
    'Afficher sur la carte l\'intensité estimée dans chaque département pendant un séisme (échelle japonaise shindo)': ['Show the estimated intensity in each department on the map during an earthquake (Japanese shindo scale)', 'Während eines Erdbebens die geschätzte Intensität je Département auf der Karte anzeigen (japanische Shindo-Skala)', 'Mostrar en el mapa la intensidad estimada en cada departamento durante un terremoto (escala japonesa shindo)'],
    'Continuer en arrière-plan quand la fenêtre est fermée (icône dans la zone de notification)': ['Keep running in the background when the window is closed (icon in the notification area)', 'Im Hintergrund weiterlaufen, wenn das Fenster geschlossen ist (Symbol im Infobereich)', 'Seguir en segundo plano al cerrar la ventana (icono en el área de notificación)'],
    "Lancer M-Alert au démarrage de l'ordinateur (en arrière-plan)": ['Start M-Alert when the computer starts (in the background)', 'M-Alert beim Systemstart starten (im Hintergrund)', 'Iniciar M-Alert al encender el ordenador (en segundo plano)'],
    'Mises à jour': ['Updates', 'Aktualisierungen', 'Actualizaciones'],
    'Rechercher maintenant': ['Check now', 'Jetzt suchen', 'Buscar ahora'],
    'Rechercher et installer les mises à jour automatiquement': ['Check for and install updates automatically', 'Aktualisierungen automatisch suchen und installieren', 'Buscar e instalar actualizaciones automáticamente'],
    "Recherche d'une nouvelle version…": ['Checking for a new version…', 'Suche nach einer neuen Version…', 'Buscando una nueva versión…'],
    'M-Alert est à jour.': ['M-Alert is up to date.', 'M-Alert ist aktuell.', 'M-Alert está actualizado.'],
    'Adresse du serveur M-Alert': ['M-Alert server address', 'Adresse des M-Alert-Servers', 'Dirección del servidor de M-Alert'],
    'Tester une alerte': ['Test an alert', 'Warnung testen', 'Probar una alerta'],
    'Enregistrer': ['Save', 'Speichern', 'Guardar'],
    // Langues, notifications et séismes (réglages ajoutés)
    'Langue': ['Language', 'Sprache', 'Idioma'],
    "Langue de l'application": ['App language', 'Sprache der App', 'Idioma de la aplicación'],
    "Langue de l'appareil": ['Device language', 'Gerätesprache', 'Idioma del dispositivo'],
    'Les textes des alertes rédigés par M-Alert restent en français.': ['Alert texts written by M-Alert stay in French.', 'Die von M-Alert verfassten Warntexte bleiben auf Französisch.', 'Los textos de las alertas redactados por M-Alert permanecen en francés.'],
    'Langues des notifications de séisme': ['Earthquake notification languages', 'Sprachen der Erdbebenbenachrichtigungen', 'Idiomas de las notificaciones de terremoto'],
    'Comme les alertes d\'urgence japonaises : la première langue en haut, la seconde en dessous.': ['Like Japanese emergency alerts: the first language on top, the second below.', 'Wie japanische Notfallwarnungen: die erste Sprache oben, die zweite darunter.', 'Como las alertas de emergencia japonesas: el primer idioma arriba, el segundo debajo.'],
    'Première langue': ['First language', 'Erste Sprache', 'Primer idioma'],
    'Seconde langue': ['Second language', 'Zweite Sprache', 'Segundo idioma'],
    '⛔ Notifications bloquées (Réglages iOS > M-Alert > Notifications)': ['⛔ Notifications blocked (iOS Settings > M-Alert > Notifications)', '⛔ Mitteilungen blockiert (iOS-Einstellungen > M-Alert > Mitteilungen)', '⛔ Notificaciones bloqueadas (Ajustes de iOS > M-Alert > Notificaciones)'],
    '⛔ Notifications bloquées (autorisez-les dans les paramètres du navigateur)': ['⛔ Notifications blocked (allow them in the browser settings)', '⛔ Benachrichtigungen blockiert (in den Browsereinstellungen erlauben)', '⛔ Notificaciones bloqueadas (permítalas en los ajustes del navegador)'],
    '✅ urgentes': ['✅ time sensitive', '✅ dringlich', '✅ urgentes'],
    '⚠️ urgentes désactivées': ['⚠️ time sensitive off', '⚠️ dringlich deaktiviert', '⚠️ urgentes desactivadas'],
    '✅ critiques': ['✅ critical', '✅ kritisch', '✅ críticas'],
    "⚠️ critiques non autorisées (autorisation d'Apple)": ['⚠️ critical not allowed (Apple permission)', '⚠️ kritisch nicht erlaubt (Genehmigung von Apple)', '⚠️ críticas no permitidas (permiso de Apple)'],
    'Ouvrir les réglages': ['Open Settings', 'Einstellungen öffnen', 'Abrir Ajustes'],
    'Aucune': ['None', 'Keine', 'Ninguno'],
    'Séismes chez moi': ['Earthquakes where I live', 'Erdbeben bei mir', 'Terremotos en mi zona'],
    "M'alerter d'un séisme selon": ['Alert me of an earthquake based on', 'Bei einem Erdbeben warnen nach', 'Avisarme de un terremoto según'],
    "Le niveau de l'alerte (réglage ci-dessus)": ['The alert level (setting above)', 'Der Warnstufe (Einstellung oben)', 'El nivel de la alerta (ajuste de arriba)'],
    'La magnitude': ['The magnitude', 'Der Magnitude', 'La magnitud'],
    "L'intensité attendue chez moi": ['The expected intensity where I live', 'Der erwarteten Intensität bei mir', 'La intensidad esperada en mi zona'],
    "La magnitude ou l'intensité chez moi": ['The magnitude or the intensity where I live', 'Der Magnitude oder der Intensität bei mir', 'La magnitud o la intensidad en mi zona'],
    'Magnitude minimale': ['Minimum magnitude', 'Mindestmagnitude', 'Magnitud mínima'],
    'Intensité minimale chez moi (shindo)': ['Minimum intensity where I live (shindo)', 'Mindestintensität bei mir (Shindo)', 'Intensidad mínima en mi zona (shindo)'],
    'Intensité : estimée dans vos départements à partir de la magnitude, de la profondeur et de la distance (ou corrigée par M-Alert). Magnitude : séismes qui concernent vos départements.': ['Intensity: estimated in your departments from the magnitude, depth and distance (or corrected by M-Alert). Magnitude: earthquakes affecting your departments.', 'Intensität: in Ihren Départements aus Magnitude, Tiefe und Entfernung geschätzt (oder von M-Alert korrigiert). Magnitude: Erdbeben, die Ihre Départements betreffen.', 'Intensidad: estimada en sus departamentos a partir de la magnitud, la profundidad y la distancia (o corregida por M-Alert). Magnitud: terremotos que afectan a sus departamentos.'],
    'Notifications urgentes (iOS : « Urgentes », traversent les modes de concentration)': ['Urgent notifications (iOS: “Time Sensitive”, break through Focus modes)', 'Dringende Mitteilungen (iOS: „Dringlich“, durchbrechen den Fokus)', 'Notificaciones urgentes (iOS: «Urgentes», atraviesan los modos de concentración)'],
    'Alertes critiques (iOS : sonnent même en mode silencieux ; autorisation spéciale d\'Apple)': ['Critical alerts (iOS: ring even in silent mode; special Apple permission)', 'Kritische Hinweise (iOS: klingeln auch im Stumm-Modus; Sondergenehmigung von Apple)', 'Alertas críticas (iOS: suenan incluso en modo silencio; permiso especial de Apple)'],
  };

  const IDX = { en: 0, de: 1, es: 2 };

  function chosenLang() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem('malert.settings') || '{}') || {}; } catch (_) { s = {}; }
    if (s.lang && LANGS[s.lang]) return s.lang;
    return deviceLang();
  }
  function deviceLang() {
    const l = String((navigator.languages && navigator.languages[0]) || navigator.language || 'fr').slice(0, 2).toLowerCase();
    return LANGS[l] ? l : 'fr';
  }

  const lang = chosenLang();
  document.documentElement.lang = lang;

  /** Traduction d'un texte français (inchangé s'il n'est pas dans le dictionnaire). */
  function t(fr, l = lang) {
    if (l === 'fr' || !(l in IDX)) return fr;
    const e = DICT[fr];
    return e ? e[IDX[l]] : fr;
  }

  // Textes composés (début ou fin variables).
  const PATTERNS = [
    [/^Nouvelle alerte (.+?) : (.+)$/, { en: 'New $1 alert: $2', de: 'Neue Warnung $1: $2', es: 'Nueva alerta $1: $2' }],
    [/^\+(\d+) autre\(s\) alerte\(s\)$/, { en: '+$1 more alert(s)', de: '+$1 weitere Warnung(en)', es: '+$1 alerta(s) más' }],
    [/^modifiée (.+)$/, { en: 'updated $1', de: 'geändert $1', es: 'modificada $1' }],
    [/^il y a (\d+) min$/, { en: '$1 min ago', de: 'vor $1 Min.', es: 'hace $1 min' }],
    [/^il y a (\d+) h$/, { en: '$1 h ago', de: 'vor $1 Std.', es: 'hace $1 h' }],
    [/^version (\S+)$/, { en: 'version $1', de: 'Version $1', es: 'versión $1' }],
    [/^La version (\S+) est disponible : téléchargez le fichier \.apk et installez-le par-dessus \(vos réglages sont conservés\)\.$/, { en: 'Version $1 is available: download the .apk file and install it over the current app (your settings are kept).', de: 'Version $1 ist verfügbar: Laden Sie die .apk-Datei herunter und installieren Sie sie über die aktuelle App (Ihre Einstellungen bleiben erhalten).', es: 'La versión $1 está disponible: descargue el archivo .apk e instálelo encima (se conservan sus ajustes).' }],
    [/^La version (\S+) est disponible : téléchargez le fichier \.ipa et réinstallez-le avec AltStore ou Sideloadly\.$/, { en: 'Version $1 is available: download the .ipa file and reinstall it with AltStore or Sideloadly.', de: 'Version $1 ist verfügbar: Laden Sie die .ipa-Datei herunter und installieren Sie sie mit AltStore oder Sideloadly neu.', es: 'La versión $1 está disponible: descargue el archivo .ipa y reinstálelo con AltStore o Sideloadly.' }],
    [/^🔔 Une nouvelle version de M-Alert \((\S+)\) est disponible\.$/, { en: '🔔 A new version of M-Alert ($1) is available.', de: '🔔 Eine neue Version von M-Alert ($1) ist verfügbar.', es: '🔔 Hay una nueva versión de M-Alert ($1) disponible.' }],
    [/^Impossible de vérifier les mises à jour : (.+)$/, { en: 'Unable to check for updates: $1', de: 'Aktualisierungen konnten nicht geprüft werden: $1', es: 'No se pueden buscar actualizaciones: $1' }],
    [/^Automatique : celui de l'appareil \((.+)\)$/, { en: 'Automatic: device time zone ($1)', de: 'Automatisch: Zeitzone des Geräts ($1)', es: 'Automática: la del dispositivo ($1)' }],
    [/^Valable jusqu'au (.+)$/, { en: 'Valid until $1', de: 'Gültig bis $1', es: 'Válida hasta el $1' }],
    [/^Épicentre : (.+)$/, { en: 'Epicentre: $1', de: 'Epizentrum: $1', es: 'Epicentro: $1' }],
    [/^Tremblement de terre · (M[\d.]+) · profondeur ([\d.]+) km · (.+)$/, { en: 'Earthquake · $1 · depth $2 km · $3', de: 'Erdbeben · $1 · Tiefe $2 km · $3', es: 'Terremoto · $1 · profundidad $2 km · $3' }],
    [/^(.*)✍️ Alerte manuelle$/, { en: '$1✍️ Manual alert', de: '$1✍️ Manuelle Warnung', es: '$1✍️ Alerta manual' }],
    [/^(\d+) km de (.+)$/, { en: '$1 km from $2', de: '$1 km von $2', es: 'a $1 km de $2' }],
    [/^Aujourd'hui · (.+)$/, { en: 'Today · $1', de: 'Heute · $1', es: 'Hoy · $1' }],
    [/^Demain · (.+)$/, { en: 'Tomorrow · $1', de: 'Morgen · $1', es: 'Mañana · $1' }],
    [/^(.+) : Séisme$/, { en: '$1: Earthquake', de: '$1: Erdbeben', es: '$1: Terremoto' }],
    [/^à l'instant · jusqu'à (.+)$/, { en: 'just now · until $1', de: 'gerade eben · bis $1', es: 'ahora mismo · hasta $1' }],
    [/^à l'instant$/, { en: 'just now', de: 'gerade eben', es: 'ahora mismo' }],
  ];

  // Partie traduisible d'un texte : sans les espaces, emojis ou symboles du début et de la fin.
  const SPLIT = /^([\s ]*(?:[^\p{L}\p{N}«“'(]+?[\s ]+)?)(.*?)([\s ]*)$/su;

  function translateText(text) {
    const m = SPLIT.exec(text);
    if (!m || !m[2]) return null;
    const core = m[2];
    let out = DICT[core] ? DICT[core][IDX[lang]] : null;
    // Texte commençant par un emoji qui fait partie de la clé (ex. « 🔇 Touchez l'écran… »).
    const whole = text.trim();
    if (out === null && DICT[whole]) return text.replace(whole, DICT[whole][IDX[lang]]);
    if (out === null) {
      for (const [re, tr] of PATTERNS) {
        if (re.test(core)) {
          // Morceaux variables eux-mêmes traduits s'ils sont dans le dictionnaire.
          out = core.replace(re, (...g) => tr[lang].replace(/\$(\d)/g, (_, k) => {
            const v = g[Number(k)] || '';
            return DICT[v] ? DICT[v][IDX[lang]] : v;
          }));
          break;
        }
      }
    }
    if (out === null || out === core) return null;
    return m[1] + out + m[3];
  }

  const ATTRS = ['title', 'placeholder', 'aria-label', 'label'];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE']);

  function translateNode(node) {
    if (node.nodeType === 3) {
      const p = node.parentNode;
      if (!p || SKIP.has(p.nodeName) || (p.closest && p.closest('[data-no-i18n]'))) return;
      const out = translateText(node.nodeValue);
      if (out !== null) node.nodeValue = out;
      return;
    }
    if (node.nodeType !== 1 || SKIP.has(node.nodeName) || node.hasAttribute('data-no-i18n')) return;
    for (const a of ATTRS) {
      const v = node.getAttribute(a);
      if (v) { const out = translateText(v); if (out !== null) node.setAttribute(a, out); }
    }
    for (let c = node.firstChild; c; c = c.nextSibling) translateNode(c);
  }

  function start() {
    if (lang === 'fr') return;
    translateNode(document.body);
    document.title = translateText(document.title) || document.title;
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') translateNode(m.target);
        else if (m.type === 'attributes') translateNode(m.target);
        else m.addedNodes.forEach(translateNode);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  // ---------- Notifications de tremblement de terre (deux langues) ----------

  // Même disposition dans chaque langue :
  //   Alerte sismique précoce : Des secousses sont attendues. Intensité attendue : 4. Restez calme et protégez-vous. (M-Alert)
  const QUAKE = {
    fr: {
      urgent: "Alerte d'urgence", title: 'Alerte sismique', cancelTitle: 'Alerte annulée',
      body: (i) => `Alerte sismique précoce : Des secousses sont attendues.${i ? ` Intensité attendue : ${i}.` : ''} Restez calme et protégez-vous. (M-Alert)`,
      cancel: (ph, at) => `L'alerte ${/^[aeiouyhàâéèêîïôûü]/i.test(ph) ? "d'" : 'de '}${ph} émise à ${at} a été annulée. (M-Alert)`,
    },
    en: {
      urgent: 'Emergency Alert', title: 'Earthquake Alert', cancelTitle: 'Alert canceled',
      body: (i) => `Earthquake Early Warning : Shaking is expected.${i ? ` Expected intensity is ${i}.` : ''} Stay calm and protect yourself. (M-Alert)`,
      cancel: (ph, at) => `The ${ph} alert triggered at ${at} has been canceled. (M-Alert)`,
    },
    de: {
      urgent: 'Notfallwarnung', title: 'Erdbebenwarnung', cancelTitle: 'Warnung aufgehoben',
      body: (i) => `Erdbebenfrühwarnung : Erschütterungen werden erwartet.${i ? ` Die erwartete Intensität beträgt ${i}.` : ''} Bleiben Sie ruhig und schützen Sie sich. (M-Alert)`,
      cancel: (ph, at) => `Die Warnung „${ph}“ von ${at} Uhr wurde aufgehoben. (M-Alert)`,
    },
    es: {
      urgent: 'Alerta de emergencia', title: 'Alerta sísmica', cancelTitle: 'Alerta cancelada',
      body: (i) => `Alerta sísmica temprana : Se esperan sacudidas.${i ? ` La intensidad esperada es ${i}.` : ''} Mantenga la calma y protéjase. (M-Alert)`,
      cancel: (ph, at) => `La alerta de ${ph} emitida a las ${at} ha sido cancelada. (M-Alert)`,
    },
  };

  /** Nom du phénomène dans une langue (en minuscules, sauf en allemand). */
  function kindName(fr, l) {
    const n = t(fr, l);
    return l === 'de' ? n : n.charAt(0).toLowerCase() + n.slice(1);
  }

  /** Heure d'émission d'une alerte (fuseau choisi) : « 14 h 32 » en français, « 14:32 » sinon. */
  function alertTime(iso, l) {
    const M = window.MAlert;
    const hm = M && M.formatTime ? M.formatTime(iso) : new Date(iso).toTimeString().slice(0, 5);
    return l === 'fr' ? hm.replace(/^0(\d)/, '$1').replace(':', ' h ') : hm; // « 9 h 01 »
  }

  /** Langues des notifications : [principale, seconde ou null]. */
  function notifLangs(settings) {
    const s = settings || {};
    const a = QUAKE[s.notifLang1] ? s.notifLang1 : (lang in QUAKE ? lang : 'fr');
    let b = s.notifLang2;
    if (!b || b === 'auto') b = a === 'en' ? 'fr' : 'en'; // par défaut : français et anglais
    return [a, QUAKE[b] && b !== a ? b : null];
  }

  /**
   * Notification d'un tremblement de terre, comme une alerte d'urgence japonaise : { title, body },
   * langue principale en haut, seconde en dessous. Intensité attendue : celle de mes départements
   * (info.local), sinon l'intensité maximale de l'alerte.
   */
  function quakeNotification(alert, info, settings) {
    const langs = notifLangs(settings).filter(Boolean);
    const shindoRank = (s) => ['0', '1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'].indexOf(String(s));
    const intensity = info.local && info.local !== '0' ? info.local : alert.shindo || '';
    const strong = alert.level >= 4 || shindoRank(intensity) >= 5; // 5- et plus
    // parts : une notification par langue (iOS coupe le texte d'une bannière après 4 lignes).
    const parts = langs.map((l) => ({ title: strong ? QUAKE[l].urgent : QUAKE[l].title, body: QUAKE[l].body(intensity) }));
    return { title: parts.map((p) => p.title).join(' · '), body: parts.map((p) => p.body).join('\n'), parts };
  }

  /**
   * Notification d'une alerte annulée (toutes les alertes) : { title, body }, deux langues.
   *   L'alerte de tremblement de terre émise à 14 h 32 a été annulée. (M-Alert)
   *   The earthquake alert triggered at 14:32 has been canceled. (M-Alert)
   * kindFr : nom du phénomène en français (M.alertKind(alert).name).
   */
  function cancelNotification(alert, kindFr, settings) {
    const langs = notifLangs(settings).filter(Boolean);
    const parts = langs.map((l) => ({ title: QUAKE[l].cancelTitle, body: QUAKE[l].cancel(kindName(kindFr, l), alertTime(alert.createdAt, l)) }));
    return { title: parts.map((p) => p.title).join(' · '), body: parts.map((p) => p.body).join('\n'), parts };
  }

  /** Noms des phénomènes et catégories dans les langues des notifications (service Android, iOS). */
  function kindNames(settings) {
    const M = window.MAlert;
    const out = {};
    if (!M) return out;
    for (const l of notifLangs(settings).filter(Boolean)) {
      const names = {};
      for (const [id, c] of Object.entries(M.CATEGORIES || {})) names[id] = kindName(c.name, l);
      for (const [id, p] of Object.entries(M.PHENOMENA || {})) names[`p${id}`] = kindName(p.name, l);
      out[l] = names;
    }
    return out;
  }

  window.MAlertI18n = { lang, LANGS, t, deviceLang, notifLangs, quakeNotification, cancelNotification, kindNames, QUAKE, translateText };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
