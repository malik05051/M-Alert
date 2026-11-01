/* M-Alert — constantes et utilitaires partagés (identiques dans M-alert et M-Alert-sender). */
(function () {
  'use strict';

  const PHENOMENA = {
    0: { name: 'Autre', icon: '⚠️' },
    1: { name: 'Vent violent', icon: '🌬️' },
    2: { name: 'Pluie-inondation', icon: '🌧️' },
    3: { name: 'Orages', icon: '⛈️' },
    4: { name: 'Crues', icon: '🌊' },
    5: { name: 'Neige-verglas', icon: '❄️' },
    6: { name: 'Canicule', icon: '🌡️' },
    7: { name: 'Grand froid', icon: '🥶' },
    8: { name: 'Avalanches', icon: '🏔️' },
    9: { name: 'Vagues-submersion', icon: '🌊' },
    10: { name: 'Tornade', icon: '🌪️' }, // M-Alert seulement (pas une vigilance Météo-France)
    11: { name: 'Incendie', icon: '🔥' }, // M-Alert seulement : trois niveaux (avis, avertissement, avertissement majeur)
    12: { name: 'Inondation', icon: '💧' }, // M-Alert seulement (inondation constatée, rupture de digue…)
    14: { name: 'Tempête', icon: '🌀' }, // M-Alert seulement (13 : ancien « Attentat », devenu une catégorie)
    15: { name: 'Fortes pluies-orages', icon: '⛈️' }, // vigilance de Nouvelle-Calédonie
    16: { name: 'Forte houle', icon: '🌊' }, // vigilance de Nouvelle-Calédonie (le long des côtes)
  };

  // Types de pollution (catégorie « Pollution ») et polluants de l'air.
  const POLLUTION_TYPES = {
    air: { name: 'Pollution de l\'air', icon: '🌫️' },
    eau: { name: 'Pollution de l\'eau (eau du robinet)', icon: '🚱' },
    marine: { name: 'Pollution marine (marée noire, littoral)', icon: '🛢️' },
    sols: { name: 'Pollution des sols', icon: '🟤' },
    chimique: { name: 'Pollution chimique (nuage, fumées toxiques)', icon: '☣️' },
  };
  const POLLUTANTS = {
    pm10: 'particules fines PM10', pm25: 'particules fines PM2,5', o3: 'ozone', no2: 'dioxyde d\'azote', so2: 'dioxyde de soufre', multi: 'plusieurs polluants',
  };
  const POLLUTION_ADVICE = {
    eau: 'Ne buvez pas l\'eau du robinet et ne l\'utilisez pas pour préparer les repas ou les biberons : utilisez de l\'eau en bouteille. Suivez les consignes de la mairie et de l\'ARS jusqu\'à la levée de l\'alerte.',
    marine: 'Évitez la baignade, la pêche et le ramassage de coquillages dans la zone concernée. Ne touchez pas aux déchets ou galettes d\'hydrocarbures sur les plages et signalez-les à la mairie. Respectez les interdictions d\'accès.',
    sols: 'Ne consommez pas les fruits et légumes du potager ni les œufs des élevages familiaux de la zone. Lavez-vous les mains après avoir touché la terre et empêchez les jeunes enfants de jouer sur les sols concernés. Suivez les consignes des autorités.',
    chimique: 'Mettez-vous à l\'abri dans un bâtiment en dur, fermez portes et fenêtres, arrêtez ventilation et climatisation. Ne restez pas sous le panache de fumée. N\'allez pas chercher vos enfants à l\'école. Éloignez-vous seulement si les autorités le demandent.',
  };

  // Types d'incendie (phénomène 11) : consignes adaptées au type de feu.
  const FIRE_PHENOMENON = 11;
  const FIRE_TYPES = {
    foret: { name: 'Feu de forêt', icon: '🌲', advice: 'outdoor' },
    vegetation: { name: 'Feu de végétation / broussailles', icon: '🌾', advice: 'outdoor' },
    agricole: { name: 'Feu agricole (cultures, chaumes)', icon: '🚜', advice: 'outdoor' },
    habitation: { name: 'Incendie d\'habitation', icon: '🏠', advice: 'building' },
    urbain: { name: 'Incendie urbain / immeuble', icon: '🏢', advice: 'building' },
    industriel: { name: 'Incendie industriel / entrepôt', icon: '🏭', advice: 'smoke' },
    autre: { name: 'Autre incendie', icon: '🔥', advice: 'outdoor' },
  };
  const FIRE_ADVICE = {
    outdoor: 'Témoin d\'un départ de feu : appelez le 18 ou le 112 (114 par SMS) en localisant le feu, puis éloignez-vous sans tenter de l\'éteindre. Menacé par le feu : abritez-vous dans un bâtiment en dur (la voiture n\'est pas un abri), fermez volets, portes et fenêtres, bouchez les aérations avec des linges mouillés et laissez le portail ouvert pour les secours. Couvrez-vous le nez et la bouche d\'un linge humide. N\'évacuez que sur ordre des pompiers ou des forces de l\'ordre.',
    building: 'Appelez le 18 ou le 112 (114 par SMS). Si le feu est chez vous, sortez immédiatement en fermant les portes derrière vous, sans prendre l\'ascenseur. Si les fumées bloquent l\'escalier, restez chez vous porte fermée, calfeutrée avec des linges mouillés, et signalez-vous à la fenêtre. Dans la fumée, baissez-vous : l\'air frais est près du sol. Éloignez-vous du secteur pour laisser passer les secours.',
    smoke: 'Mettez-vous à l\'abri dans un bâtiment en dur, fermez portes et fenêtres, arrêtez ventilation et climatisation : les fumées peuvent être toxiques. Ne restez pas sous le panache de fumée. N\'allez pas chercher vos enfants à l\'école, ils sont pris en charge. Éloignez-vous du site seulement si les autorités le demandent.',
  };

  // Catégories d'alertes M-Alert. Le phénomène ne concerne que la catégorie « meteo ».
  const CATEGORIES = {
    meteo: { name: 'Météo', icon: '🌦️' },
    seisme: { name: 'Tremblement de terre', icon: '🏚️' },
    tsunami: { name: 'Tsunami', icon: '🌊' },
    pollution: { name: 'Pollution', icon: '🌫️' },
    accident: { name: 'Accident industriel', icon: '🏭' },
    attentat: { name: 'Attentat', icon: '🚨' },
    greve: { name: 'Grève', icon: '📢' },
    blocus: { name: 'Blocus / manifestation', icon: '🚧' },
  };

  // Consignes types inspirées des recommandations officielles (préfectures, ARS, ministère des Affaires étrangères).
  const CATEGORY_ADVICE = {
    seisme: 'Pendant les secousses, abritez-vous sous un meuble solide, loin des fenêtres, et protégez votre tête ; à l\'extérieur, éloignez-vous des bâtiments et des lignes électriques. Ensuite, coupez le gaz et l\'électricité, évacuez sans prendre l\'ascenseur et attendez-vous à des répliques.',
    tsunami: 'Réagissez immédiatement sans attendre la vague : rejoignez à pied un point haut ou l\'intérieur des terres. Ne restez ni sur la plage, ni dans les ports, ni sur les digues. N\'utilisez pas votre voiture et ne revenez pas avant la fin de l\'alerte : plusieurs vagues peuvent se succéder.',
    pollution: 'Réduisez ou reportez les activités physiques et sportives intenses. Les personnes sensibles (enfants, personnes âgées, malades) doivent les limiter, y compris en intérieur, et éviter les axes à forte circulation. Respectez les mesures de restriction de circulation.',
    accident: 'Mettez-vous à l\'abri dans un bâtiment en dur, fermez portes et fenêtres, arrêtez ventilation et climatisation. N\'allez pas chercher vos enfants à l\'école, ils sont pris en charge. Pas de flamme ni de cigarette. Éloignez-vous du site seulement si les autorités le demandent.',
    attentat: 'Si vous êtes témoin d\'une attaque : échappez-vous si vous le pouvez, en aidant les autres et sans vous exposer ; sinon cachez-vous, verrouillez ou barricadez-vous, éteignez la lumière et mettez votre téléphone en silencieux. Alertez le 17 ou le 112 (114 par SMS) dès que vous êtes en sécurité. Évitez la zone, n\'allez pas sur place et ne diffusez pas d\'images ni de rumeurs. Suivez les consignes des forces de l\'ordre.',
    greve: 'Renseignez-vous auprès des transporteurs et des services concernés. Anticipez vos déplacements et prévoyez des solutions de remplacement.',
    blocus: 'Évitez le secteur concerné et prévoyez un itinéraire de délestage. Attendez-vous à des perturbations de circulation et des transports. Suivez les consignes des forces de l\'ordre et des autorités.',
  };

  // Couleurs de vigilance (1 vert, 2 jaune, 3 orange, 4 rouge, 5 majeure en rose).
  const VIGILANCE = {
    0: { name: 'Pas de données', color: '#3a4556' },
    1: { name: 'Vert', color: '#2f9e44' },
    2: { name: 'Jaune', color: '#ffe11a' },
    3: { name: 'Orange', color: '#ff9300' },
    4: { name: 'Rouge', color: '#e0141e' },
    // Niveau majeur, au-delà du rouge : saisie manuelle uniquement (Météo-France s'arrête au rouge).
    5: { name: 'Majeure', color: '#fe05fd' },
  };

  // Niveaux des alertes M-Alert.
  const LEVELS = {
    1: { name: 'Information', color: '#3b82f6', text: '#fff' },
    2: { name: 'Jaune', color: '#ffe11a', text: '#1b1b1b' },
    3: { name: 'Orange', color: '#ff9300', text: '#1b1b1b' },
    4: { name: 'Rouge', color: '#e0141e', text: '#fff' },
    5: { name: 'Majeure', color: '#fe05fd', text: '#fff' },
  };

  // Conseils de comportement inspirés des consignes de vigilance Météo-France.
  const ADVICE = {
    0: 'Restez informés de l\'évolution de la situation et suivez les consignes des autorités.',
    1: 'Limitez vos déplacements. Ne vous promenez pas en forêt. Rangez ou fixez les objets susceptibles d\'être emportés. N\'intervenez pas sur les toitures.',
    2: 'Ne vous engagez en aucun cas, à pied ou en voiture, sur une voie immergée. Éloignez-vous des cours d\'eau. Mettez vos biens à l\'abri de la montée des eaux.',
    3: 'Évitez les activités extérieures. Abritez-vous hors des zones boisées. Évitez d\'utiliser les appareils électriques et le téléphone fixe. Ne vous engagez pas sur les routes inondées.',
    4: 'Ne vous engagez pas sur une route inondée. Éloignez-vous des cours d\'eau. Tenez-vous informés auprès des autorités (Vigicrues).',
    5: 'Limitez vos déplacements et renseignez-vous sur les conditions de circulation. Équipez votre véhicule. Protégez-vous des chutes et protégez les autres en dégageant la neige et le verglas devant chez vous.',
    6: 'Buvez régulièrement de l\'eau. Mouillez-vous le corps. Fermez les volets la journée. Évitez les efforts physiques et l\'alcool. Prenez des nouvelles de vos proches vulnérables.',
    7: 'Évitez les expositions prolongées au froid. Habillez-vous chaudement en plusieurs couches. Ne surchauffez pas, aérez votre logement. Signalez les personnes sans abri au 115.',
    8: 'Renoncez aux sorties hors des pistes balisées. Respectez les consignes des stations et des autorités.',
    9: 'Tenez-vous éloignés des côtes et des estuaires. Ne vous promenez pas en bord de mer. Mettez vos biens à l\'abri des submersions.',
    10: 'Abritez-vous immédiatement dans un bâtiment solide : au sous-sol ou, à défaut, dans une petite pièce sans fenêtre au centre et au niveau le plus bas (salle de bain, couloir, placard). Protégez votre tête et votre cou, éloignez-vous des fenêtres et n\'ouvrez pas les fenêtres. Ne restez ni en voiture, ni sous un pont, ni dans un mobil-home ou un bâtiment à grand toit.',
    11: FIRE_ADVICE.outdoor,
    12: 'Ne vous engagez jamais à pied ou en voiture dans une zone inondée : 30 cm d\'eau suffisent à emporter une voiture. Réfugiez-vous en hauteur, à l\'étage, avec de l\'eau, une lampe, une radio et vos médicaments. N\'allez pas chercher vos enfants à l\'école, ils sont pris en charge. Coupez le gaz et l\'électricité si l\'eau monte et n\'évacuez que sur ordre des autorités.',
    14: 'Restez à l\'abri dans un bâtiment en dur et limitez vos déplacements ; n\'allez ni en bord de mer, ni en forêt. Avant la tempête, rentrez ou fixez les objets qui peuvent s\'envoler et fermez portes, fenêtres et volets. Ne touchez pas aux fils électriques tombés. En cas de coupure d\'électricité, n\'utilisez ni groupe électrogène ni chauffage d\'appoint à combustion à l\'intérieur (monoxyde de carbone). Après la tempête, attendez les consignes avant de déblayer et ne montez pas sur les toits.',
    15: 'Évitez les déplacements, surtout en zone inondable et sur les radiers. Ne traversez jamais un creek ou un radier submergé, à pied ou en voiture. Abritez-vous hors des zones boisées pendant les orages et éloignez-vous des cours d\'eau.',
    16: 'Tenez-vous éloignés du bord de mer et des platiers. Ne sortez pas en mer, en bateau comme en kitesurf ou en planche. Surveillez vos bateaux au mouillage et évitez la pêche à pied.',
  };

  /** « Information », « Alerte rouge », « ALERTE MAJEURE »… */
  // Catégories à niveaux propres (les couleurs restent celles des niveaux 2 à 5).
  const CATEGORY_LEVELS = {
    // Tsunami : trois niveaux, comme au Japon.
    tsunami: {
      2: { label: 'Avis de tsunami', name: 'Avis' },
      4: { label: 'Avertissement de tsunami', name: 'Avertissement' },
      5: { label: 'Avertissement majeur de tsunami', name: 'Avertissement majeur' },
    },
    // Blocus / manifestation : trois niveaux, comme le tsunami.
    blocus: {
      2: { label: 'Avis de blocus / manifestation', name: 'Avis' },
      4: { label: 'Avertissement blocus / manifestation', name: 'Avertissement' },
      5: { label: 'Avertissement majeur blocus / manifestation', name: 'Avertissement majeur' },
    },
    // Incendie (phénomène météo 11) : trois niveaux, comme le tsunami.
    incendie: {
      2: { label: 'Avis d\'incendie', name: 'Avis' },
      4: { label: 'Avertissement d\'incendie', name: 'Avertissement' },
      5: { label: 'Avertissement majeur d\'incendie', name: 'Avertissement majeur' },
    },
    // Attentat : stades du plan Vigipirate (depuis le 22 juin 2026).
    attentat: {
      2: { label: 'Vigipirate – vigilance', name: 'Vigilance' },
      4: { label: 'Vigipirate – vigilance renforcée', name: 'Vigilance renforcée' },
      5: { label: 'Alerte attentat', name: 'Alerte attentat' },
    },
    // Tremblement de terre : quatre niveaux.
    seisme: {
      2: { label: 'Alerte sismique précoce faible', name: 'Faible' },
      3: { label: 'Alerte sismique précoce moyenne', name: 'Moyen' },
      4: { label: 'Alerte sismique précoce élevée', name: 'Élevé' },
      5: { label: 'Alerte sismique précoce majeure', name: 'Majeur' },
    },
  };
  const TSUNAMI_LEVELS = CATEGORY_LEVELS.tsunami;

  // Intensité sismique sur l'échelle japonaise (shindo), couleurs proches de JQuake.
  const SHINDO = {
    0: { color: '#6b7280', text: '#fff' },
    1: { color: '#5e8fc4', text: '#fff' },
    2: { color: '#2563eb', text: '#fff' },
    3: { color: '#16a34a', text: '#fff' },
    4: { color: '#facc15', text: '#1b1b1b' },
    '5-': { color: '#f59e0b', text: '#1b1b1b' },
    '5+': { color: '#ea580c', text: '#fff' },
    '6-': { color: '#dc2626', text: '#fff' },
    '6+': { color: '#991b1b', text: '#fff' },
    7: { color: '#7e22ce', text: '#fff' },
  };
  const SHINDO_ORDER = ['0', '1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'];

  /** « M6.3 · profondeur 10 km · intensité max 6- » pour un tremblement de terre (vide si rien n'est renseigné). */
  /**
   * Intensité estimée (JMA) d'un séisme à une distance épicentrale donnée : vitesse du sol par la
   * loi d'atténuation de Si et Midorikawa (1999), sol moyen, puis I = 2,68 + 1,72 log PGV.
   * Même calcul que le serveur (estimation à l'épicentre) : distance 0.
   */
  function estimateIntensity(mag, depth, distKm = 0) {
    const d = Math.max(0, Number(depth) || 0);
    const x = Math.max(3, Math.hypot(distKm, d)); // distance à la faille ≈ distance au foyer
    const logPgv = 0.58 * mag + 0.0038 * d - Math.log10(x + 0.0028 * 10 ** (0.5 * mag)) - 0.002 * x - 1.29;
    return 2.68 + 1.72 * Math.log10(10 ** logPgv * 1.31);
  }

  function toShindo(i) {
    const steps = [0.5, 1.5, 2.5, 3.5, 4.5, 5.0, 5.5, 6.0, 6.5];
    const k = steps.findIndex((v) => i < v);
    return SHINDO_ORDER[k === -1 ? 9 : k];
  }

  /** Tsunami : « vagues jusqu'à 1,5 m » (« ≈ 1,5 m (estimation) » si calculée), sinon rien. */
  function tsunamiSummary(alert) {
    if (!alert || alert.category !== 'tsunami') return '';
    const rows = (alert.tsunamiTable || []).filter((r) => typeof r.height === 'number');
    const heights = rows.map((r) => r.height);
    if (typeof alert.waveHeight === 'number') heights.push(alert.waveHeight);
    if (!heights.length) return '';
    const max = Math.max(...heights);
    // Hauteur estimée par M-Alert (pas annoncée) : « ≈ ».
    const estimated = rows.some((r) => r.heightEstimated && r.height === max) && alert.waveHeight !== max;
    return `vagues jusqu'à ${estimated ? '≈ ' : ''}${max.toLocaleString('fr-FR')} m${estimated ? ' (estimation)' : ''}`;
  }

  // Origine d'une alerte : envoi (automatique ou validé par M-Alert) et source du séisme.
  // label : mention complète (fenêtre d'alerte) ; short : mention courte (listes).
  const SOURCES = {
    auto: { label: '🤖 Alerte automatique · source : EMSC', short: '🤖 automatique (EMSC)' },
    emsc: { label: '✅ Source : EMSC · alerte validée par M-Alert', short: '✅ EMSC' },
    'stations-auto': { label: '🤖 Alerte automatique · source : stations sismiques (détection M-Alert)', short: '📶 automatique (stations)' },
    stations: { label: '📶 Source : stations sismiques (détection M-Alert) · alerte validée par M-Alert', short: '📶 stations' },
    'stations-auto-emsc': { label: '🤖 Alerte automatique · source : stations sismiques, confirmée par l\'EMSC', short: '📶 automatique (stations + EMSC)' },
    'stations-emsc': { label: '📶 Source : stations sismiques, confirmée par l\'EMSC · alerte validée par M-Alert', short: '📶 stations + EMSC' },
    'simulation-auto': { label: '🤖 Alerte automatique · source : séisme simulé (test des règles)', short: '🧪 automatique (simulation)' },
    simulation: { label: '🧪 Source : séisme simulé (test des règles) · alerte validée par M-Alert', short: '🧪 simulation' },
    renass: { label: '🇫🇷 Source : BCSF-RéNaSS (réseau national de surveillance sismique) · alerte validée par M-Alert', short: '🇫🇷 RéNaSS' },
    usgs: { label: '🌎 Source : USGS · alerte validée par M-Alert', short: '🌎 USGS' },
    calc: { label: '🧮 Tsunami calculé automatiquement (séisme signalé par M-Alert)', short: '🧮 calculé' },
    'wind-auto': { label: '🤖 Alerte automatique · prévision de rafales (Météo-France, ECMWF)', short: '💨 automatique (prévision)' },
    wind: { label: '💨 Prévision de rafales (Météo-France, ECMWF) · alerte validée par M-Alert', short: '💨 prévision' },
    'surge-auto': { label: '🤖 Alerte automatique · prévision de vagues et de niveau de la mer (Météo-France, ECMWF)', short: '🌊 automatique (prévision)' },
    surge: { label: '🌊 Prévision de vagues et de niveau de la mer (Météo-France, ECMWF) · alerte validée par M-Alert', short: '🌊 prévision' },
    'storm-auto': { label: '🤖 Alerte automatique · prévision de tempête : rafales et dépression (Météo-France, ECMWF)', short: '🌀 automatique (prévision)' },
    storm: { label: '🌀 Prévision de tempête : rafales et dépression (Météo-France, ECMWF) · alerte validée par M-Alert', short: '🌀 prévision' },
    'flood-auto': { label: '🤖 Alerte automatique · prévision de pluie et de crues (Météo-France, ECMWF, GloFAS)', short: '🌧️ automatique (prévision)' },
    flood: { label: '🌧️ Prévision de pluie et de crues (Météo-France, ECMWF, GloFAS) · alerte validée par M-Alert', short: '🌧️ prévision' },
    'tornado-auto': { label: '🤖 Alerte automatique · tornade (simulation des règles)', short: '🌪️ automatique' },
    tornado: { label: '🌪️ Tornade · alerte validée par M-Alert', short: '🌪️ tornade' },
  };

  /** Mention de l'origine d'une alerte (source du séisme, envoi automatique ou validé), sinon manuelle. */
  function sourceLabel(alert) {
    const s = alert && SOURCES[alert.source];
    return s ? s.label : '✍️ Alerte manuelle';
  }

  /** Mention courte de l'origine, pour les listes (vide pour une alerte manuelle). */
  function sourceShort(alert) {
    const s = alert && SOURCES[alert.source];
    return s ? s.short : '';
  }

  function quakeSummary(alert) {
    if (!alert || alert.category !== 'seisme') return '';
    const parts = [];
    if (alert.aftershockOf && typeof alert.aftershockOf.mag === 'number') parts.push(`réplique du M${alert.aftershockOf.mag.toFixed(1)}`);
    if (typeof alert.magnitude === 'number') parts.push(`M${alert.magnitude.toFixed(1)}`);
    if (typeof alert.depth === 'number') parts.push(`profondeur ${alert.depth} km`);
    if (alert.shindo) parts.push(`intensité max ${alert.shindo} (shindo)`);
    return parts.join(' · ');
  }

  /** Fin d'une alerte : « jusqu'à 18:30 » (court), « jusqu'au jeu. 08/10 18:30 », ou « jusqu'à levée ». */
  function untilText(alert, { short } = {}) {
    if (alert.noEnd) return 'jusqu\'à levée de l\'alerte';
    return short ? `jusqu'à ${formatTime(alert.expiresAt)}` : `jusqu'au ${formatDateTime(alert.expiresAt)}`;
  }

  /** Clé des niveaux propres d'une alerte : sa catégorie (tsunami, séisme…) ou « incendie ». */
  function levelsKey(alert) {
    if (!alert) return null;
    if ((alert.category || 'meteo') === 'meteo') {
      if (Number(alert.phenomenon) === FIRE_PHENOMENON) return 'incendie';
      return null;
    }
    return alert.category;
  }

  /** Niveaux propres à l'alerte (tsunami, séisme, incendie…), ou null. */
  function specialLevel(alert) {
    const levels = alert && CATEGORY_LEVELS[levelsKey(alert)];
    return (levels && levels[alert.level]) || null;
  }

  function isTsunami(alert) {
    return Boolean(alert) && alert.category === 'tsunami' && Boolean(specialLevel(alert));
  }

  // Tornade : échelle EF (Fujita améliorée) de 0 à 5 ; couleur d'alerte EF0 jaune, EF1 orange,
  // EF2 rouge, EF3 à EF5 majeure.
  const TORNADO_PHENOMENON = 10;
  const EF_LEVEL = [2, 3, 4, 5, 5, 5];
  function isTornado(alert) {
    return Boolean(alert) && (alert.category || 'meteo') === 'meteo' && Number(alert.phenomenon) === TORNADO_PHENOMENON
      && Number.isInteger(alert.ef) && alert.ef >= 0 && alert.ef <= 5;
  }

  /** « EF3 · vent attendu 250 km/h » pour une tornade (vide sinon). */
  function tornadoSummary(alert) {
    if (!isTornado(alert)) return '';
    return `EF${alert.ef}${typeof alert.windKmh === 'number' ? ` · vent attendu ${alert.windKmh} km/h` : ''}`;
  }

  /**
   * Alerte vent ou vagues-submersion automatique : sa version d'origine, gardée quand la prévision
   * la met à jour (« Prévision d'origine, émise dim. 18/10 22:00 : … · pic prévu lun. 19/10 vers 15 h »).
   */
  function forecastOriginText(alert) {
    const o = alert && alert.forecastOrigin;
    if (!o || !o.at) return '';
    const peak = o.peakAt
      ? (() => {
        // Heure du pic (heure de Paris, ou du tableau) montrée dans le fuseau choisi.
        const t = forecastTime(o.peakAt, (alert.forecastTable && alert.forecastTable.tz) || 'Europe/Paris');
        return ` · pic prévu ${new Date(t.ms).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: timeZone() })} vers ${t.h}`;
      })()
      : '';
    return `Prévision d'origine, émise ${formatDateTime(o.at)} : ${o.title}${peak}`;
  }

  /** « Ozone » pour une pollution de l'air dont le polluant est indiqué (vide sinon). */
  function pollutionSummary(alert) {
    if (!alert || alert.category !== 'pollution' || alert.pollutionType !== 'air' || !POLLUTANTS[alert.pollutant]) return '';
    const p = POLLUTANTS[alert.pollutant];
    return p.charAt(0).toUpperCase() + p.slice(1);
  }

  /** « Feu de forêt » pour un incendie dont le type est indiqué (vide sinon). */
  function fireSummary(alert) {
    if (!alert || (alert.category || 'meteo') !== 'meteo' || Number(alert.phenomenon) !== FIRE_PHENOMENON) return '';
    const t = FIRE_TYPES[alert.fireType];
    return t ? `${t.icon} ${t.name}` : '';
  }

  /** Intitulé complet du niveau d'une alerte : « Alerte rouge », « Avertissement de tsunami »… */
  function alertLevelLabel(alert) {
    if (isTornado(alert)) return `Tornade EF${alert.ef}`;
    const special = specialLevel(alert);
    return special ? special.label : levelLabel(alert.level);
  }

  /** Nom court du niveau, pour les étiquettes : « Rouge », « Avertissement », « Faible »… */
  function alertLevelName(alert) {
    if (isTornado(alert)) return `EF${alert.ef}`;
    const special = specialLevel(alert);
    return special ? special.name : LEVELS[alert.level].name;
  }

  function levelLabel(level) {
    if (level === 1) return 'Information';
    if (level === 5) return 'Alerte majeure';
    return `Alerte ${LEVELS[level].name.toLowerCase()}`;
  }

  function categoryOf(alert) {
    return alert && CATEGORIES[alert.category] ? alert.category : 'meteo';
  }

  /** Icône et libellé d'une alerte : le phénomène pour la météo, sinon la catégorie. */
  function alertKind(alert) {
    const cat = categoryOf(alert);
    if (cat === 'pollution' && POLLUTION_TYPES[alert.pollutionType]) return POLLUTION_TYPES[alert.pollutionType];
    if (cat !== 'meteo') return CATEGORIES[cat];
    return PHENOMENA[alert.phenomenon] || PHENOMENA[0];
  }

  /** Consignes : celles saisies, sinon les consignes types (dès le jaune / l'avis ; pas pour une information). */
  function adviceFor(alert) {
    if (alert.instructions) return alert.instructions;
    if (alert.level < 2) return '';
    const cat = categoryOf(alert);
    if (cat === 'pollution' && POLLUTION_ADVICE[alert.pollutionType]) return POLLUTION_ADVICE[alert.pollutionType];
    if (cat !== 'meteo') return CATEGORY_ADVICE[cat] || '';
    if (Number(alert.phenomenon) === FIRE_PHENOMENON && FIRE_TYPES[alert.fireType]) return FIRE_ADVICE[FIRE_TYPES[alert.fireType].advice];
    return ADVICE[alert.phenomenon] || '';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // --- Fuseau horaire choisi par l'utilisateur (Réglages) : toutes les heures affichées le suivent ---

  // Fuseaux proposés en premier (France et outre-mer) ; les autres sont dans la liste complète.
  const TIME_ZONES = [
    ['Europe/Paris', 'Paris (métropole)'], ['Pacific/Noumea', 'Nouméa (Nouvelle-Calédonie)'],
    ['America/Guadeloupe', 'Guadeloupe, Martinique'], ['America/Cayenne', 'Guyane'], ['Indian/Reunion', 'La Réunion'],
    ['Indian/Mayotte', 'Mayotte'], ['Pacific/Tahiti', 'Tahiti (Polynésie française)'], ['America/Miquelon', 'Saint-Pierre-et-Miquelon'],
    ['Pacific/Wallis', 'Wallis-et-Futuna'], ['UTC', 'UTC (temps universel)'],
  ];
  const TZ_KEY = 'malert.timezone';
  const deviceTimeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
  const validTimeZone = (tz) => { try { new Intl.DateTimeFormat('fr-FR', { timeZone: tz }); return true; } catch { return false; } };
  /** Fuseau choisi (IANA), ou '' : celui de l'appareil. */
  function chosenTimeZone() {
    try { const tz = localStorage.getItem(TZ_KEY) || ''; return tz && validTimeZone(tz) ? tz : ''; } catch { return ''; }
  }
  function setTimeZone(tz) {
    try {
      if (tz && validTimeZone(tz)) localStorage.setItem(TZ_KEY, tz);
      else localStorage.removeItem(TZ_KEY);
    } catch { /* stockage indisponible : fuseau de l'appareil */ }
  }
  /** Fuseau effectif des heures affichées. */
  const timeZone = () => chosenTimeZone() || deviceTimeZone();
  /** Nom court du fuseau effectif : « heure de Paris », « heure de Nouméa », « UTC »… */
  function timeZoneLabel(tz = timeZone()) {
    const known = TIME_ZONES.find(([id]) => id === tz);
    if (tz === 'UTC') return 'UTC';
    const city = known ? known[1].replace(/ \(.*\)$/, '') : tz.split('/').pop().replace(/_/g, ' ');
    return `heure de ${city}`;
  }
  /** Tous les fuseaux connus du navigateur (pour la liste complète des réglages). */
  function allTimeZones() {
    try { return Intl.supportedValuesOf('timeZone'); } catch { return TIME_ZONES.map(([id]) => id); }
  }

  /** Parties d'un instant dans le fuseau effectif (ou tz) : { year, month, day, hour, minute }. */
  function zonedParts(ms, tz = timeZone()) {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms));
    return Object.fromEntries(p.filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  }
  /** « AAAA-MM-JJTHH:MM » (heure locale de tz) -> instant (ms). */
  function zonedInstant(local, tz) {
    const guess = new Date(`${local.slice(0, 16)}:00Z`).getTime();
    const offset = (ms) => { const v = zonedParts(ms, tz); return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute) - ms; };
    return guess - offset(guess - offset(guess));
  }
  /** Valeur d'un champ datetime-local, dans le fuseau effectif. */
  function toLocalInput(d) {
    const v = zonedParts(new Date(d).getTime());
    return `${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}`;
  }
  /** Champ datetime-local (fuseau effectif) -> Date. */
  function fromLocalInput(value) {
    return value ? new Date(zonedInstant(value, timeZone())) : new Date(NaN);
  }
  /** Date « AAAA-MM-JJ » d'un instant dans le fuseau effectif. */
  function zonedDate(ms = Date.now()) {
    const v = zonedParts(ms);
    return `${v.year}-${v.month}-${v.day}`;
  }
  /**
   * Heure d'une prévision (« AAAA-MM-JJTHH:MM », heure de Paris, ou de srcTz) dans le fuseau
   * effectif : { ms, date, h: « 14 h » }.
   */
  function forecastTime(local, srcTz = 'Europe/Paris') {
    const ms = zonedInstant(local, srcTz);
    const v = zonedParts(ms);
    return { ms, date: `${v.year}-${v.month}-${v.day}`, h: `${Number(v.hour)} h${v.minute !== '00' ? ` ${v.minute}` : ''}` };
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: timeZone() });
  }

  function formatTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: timeZone() });
  }

  /** Heure courante (horloge), dans le fuseau effectif. */
  function clockText() {
    return new Date().toLocaleTimeString('fr-FR', { timeZone: timeZone() });
  }

  function relativeTime(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'à l\'instant';
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
    return formatDateTime(iso);
  }

  function departmentList() {
    const features = (window.MALERT_DEPARTMENTS && window.MALERT_DEPARTMENTS.features) || [];
    return features
      .map((f) => ({ code: f.properties.code, nom: f.properties.nom }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  const NAMES = {};
  departmentList().forEach((d) => { NAMES[d.code] = d.nom; });

  function departmentName(code) {
    if (code === 'ALL') return 'Toute la France';
    return NAMES[code] ? `${NAMES[code]} (${code})` : code;
  }

  function departmentsLabel(codes, max = 4) {
    if (!codes || !codes.length) return '';
    if (codes.includes('ALL')) return 'Toute la France';
    const names = codes.map(departmentName);
    if (names.length <= max) return names.join(', ');
    return `${names.slice(0, max).join(', ')} et ${names.length - max} autre(s)`;
  }

  function isActive(alert) {
    return alert && !alert.cancelledAt && new Date(alert.expiresAt).getTime() > Date.now();
  }

  // Lecture/écriture localStorage protégées (navigation privée, stockage bloqué…).
  const storage = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (_) { /* ignoré */ }
    },
  };

  function toWsUrl(httpUrl) {
    return httpUrl.replace(/^http/i, 'ws').replace(/\/+$/, '') + '/ws';
  }

  function normalizeServerUrl(url) {
    url = String(url || '').trim().replace(/\/+$/, '');
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url;
  }

  /** Badge d'état de la vigilance : { text, cls, title } ou null si tout va bien. */
  /** Jour (AAAA-MM-JJ, heure de Paris) d'une période de vigilance, ou aujourd'hui + day sans période. */
  function periodDate(p, day = 0) {
    const paris = (ms) => new Date(ms).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
    if (p && p.date) return p.date;
    if (p && p.begin) return paris(new Date(p.begin).getTime() + 3 * 3600000);
    return paris(Date.now() + day * 86400000);
  }

  function vigilanceBadge(v) {
    if (!v) return null;
    if (v.source === 'manual') {
      return {
        text: 'Vigilance manuelle',
        cls: 'badge-manual',
        title: v.reason === 'api-down'
          ? 'L\'API Météo-France est en panne : la vigilance est saisie manuellement par M-Alert.'
          : 'La vigilance est saisie manuellement par M-Alert.',
      };
    }
    if (v.source === 'demo') {
      return { text: 'Vigilance : démo', cls: 'badge-demo', title: 'Aucune clé API Météo-France sur le serveur : données fictives.' };
    }
    if (v.error) {
      return { text: '⚠ Vigilance non à jour', cls: 'badge-demo', title: `${v.error} — affichage des dernières données reçues.` };
    }
    if (v.corrections) {
      return {
        text: 'Vigilance corrigée',
        cls: 'badge-manual',
        title: `Vigilance Météo-France avec ${v.corrections} département(s) corrigé(s) manuellement par M-Alert.`,
      };
    }
    return null;
  }

  window.MAlert = {
    PHENOMENA, CATEGORIES, CATEGORY_ADVICE, VIGILANCE, LEVELS, ADVICE, vigilanceBadge, periodDate,
    categoryOf, alertKind, adviceFor, levelLabel, untilText, TORNADO_PHENOMENON, EF_LEVEL, isTornado, tornadoSummary, SHINDO, SHINDO_ORDER, quakeSummary, tsunamiSummary, sourceLabel, sourceShort, SOURCES, estimateIntensity, toShindo, CATEGORY_LEVELS, TSUNAMI_LEVELS, specialLevel, levelsKey, isTsunami, alertLevelLabel, alertLevelName,
    FIRE_PHENOMENON, FIRE_TYPES, FIRE_ADVICE, fireSummary, POLLUTION_TYPES, POLLUTANTS, pollutionSummary, forecastOriginText,
    escapeHtml, formatDateTime, formatTime, relativeTime, clockText,
    TIME_ZONES, chosenTimeZone, setTimeZone, timeZone, timeZoneLabel, allTimeZones, deviceTimeZone, zonedInstant, toLocalInput, fromLocalInput, zonedDate, forecastTime,
    departmentList, departmentName, departmentsLabel, isActive,
    storage, toWsUrl, normalizeServerUrl,
  };

  // Application de bureau : l'arrière-plan n'étant pas ralenti (pour que les alertes sonnent fenêtre
  // cachée), la page se croit toujours visible. Le processus principal signale donc quand la fenêtre
  // est cachée ou réduite, et les animations sont mises en pause.
  if (window.malertNative && window.malertNative.onVisibility) {
    window.malertNative.onVisibility((visible) => document.documentElement.classList.toggle('app-hidden', !visible));
  }
})();
