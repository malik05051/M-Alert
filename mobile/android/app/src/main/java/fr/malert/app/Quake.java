package fr.malert.app;

import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Tremblements de terre dans le service Android (comme la page) :
 * - intensité (shindo) attendue dans mes départements, pour le réglage « M'alerter d'un séisme selon » ;
 * - notification en deux langues, comme une alerte d'urgence japonaise (web/js/i18n.js).
 */
final class Quake {
    private Quake() {}

    static final String[] SHINDO = { "0", "1", "2", "3", "4", "5-", "5+", "6-", "6+", "7" };

    static int rank(String s) {
        for (int i = 0; i < SHINDO.length; i++) if (SHINDO[i].equals(s)) return i;
        return -1;
    }

    /** Intensité JMA estimée (Si et Midorikawa 1999), comme common.js. */
    static double estimate(double mag, double depth, double km) {
        double d = Math.max(0, depth);
        double x = Math.max(3, Math.hypot(km, d));
        double logPgv = 0.58 * mag + 0.0038 * d - Math.log10(x + 0.0028 * Math.pow(10, 0.5 * mag)) - 0.002 * x - 1.29;
        return 2.68 + 1.72 * Math.log10(Math.pow(10, logPgv) * 1.31);
    }

    static String toShindo(double i) {
        double[] steps = { 0.5, 1.5, 2.5, 3.5, 4.5, 5.0, 5.5, 6.0, 6.5 };
        for (int k = 0; k < steps.length; k++) if (i < steps[k]) return SHINDO[k];
        return SHINDO[9];
    }

    /** Distance (km) entre un point et un département (contours simplifiés), 0 à l'intérieur ; -1 si inconnu. */
    static double deptKm(JSONArray rings, double lat, double lon) {
        if (rings == null) return -1;
        double kx = Math.cos(Math.toRadians(lat)) * 111.32;
        boolean inside = false;
        double best = Double.MAX_VALUE;
        for (int r = 0; r < rings.length(); r++) {
            JSONArray ring = rings.optJSONArray(r);
            if (ring == null) continue;
            boolean in = false;
            int n = ring.length();
            for (int i = 0, j = n - 1; i < n; j = i++) {
                JSONArray pi = ring.optJSONArray(i), pj = ring.optJSONArray(j);
                double xi = pi.optDouble(0), yi = pi.optDouble(1), xj = pj.optDouble(0), yj = pj.optDouble(1);
                if ((yi > lat) != (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) in = !in;
                double ax = (xj - lon) * kx, ay = (yj - lat) * 110.57, bx = (xi - lon) * kx, by = (yi - lat) * 110.57;
                double dx = bx - ax, dy = by - ay;
                double t = dx != 0 || dy != 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
                best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
            }
            if (in) inside = !inside;
        }
        return inside ? 0 : best == Double.MAX_VALUE ? -1 : best;
    }

    /** Intensité la plus forte attendue dans mes départements, ou null. */
    static String localIntensity(JSONObject a, JSONObject settings) {
        JSONObject areas = settings.optJSONObject("quakeAreas");
        if (areas == null) return null;
        JSONObject fixed = a.optJSONObject("intensities");
        JSONObject epi = a.optJSONObject("epicenter");
        String best = null;
        for (java.util.Iterator<String> it = areas.keys(); it.hasNext(); ) {
            String code = it.next();
            String s = fixed != null && fixed.has(code) ? fixed.optString(code) : null;
            if (s == null && epi != null && a.has("magnitude")) {
                double km = deptKm(areas.optJSONArray(code), epi.optDouble("lat"), epi.optDouble("lon"));
                if (km >= 0) {
                    double depth = a.optDouble("depth", 10);
                    s = toShindo(estimate(a.optDouble("magnitude"), Double.isNaN(depth) ? 10 : depth, km));
                }
            }
            if (s != null && (best == null || rank(s) > rank(best))) best = s;
        }
        return best;
    }

    /**
     * Réglage « M'alerter d'un séisme selon » : true/false, ou null pour la règle habituelle (niveau).
     * mine : l'alerte concerne mes départements (ou « toute la France »).
     */
    static Boolean wanted(JSONObject a, JSONObject settings, boolean mine) {
        String mode = settings.optString("quakeMode", "level");
        if (!"seisme".equals(a.optString("category")) || "level".equals(mode) || mode.isEmpty()) return null;
        boolean magOk = a.has("magnitude") && a.optDouble("magnitude") >= settings.optDouble("quakeMag", 4) - 1e-9 && mine;
        String local = localIntensity(a, settings);
        boolean shOk = local != null && rank(local) >= rank(settings.optString("quakeShindo", "3"));
        if ("magnitude".equals(mode)) return magOk;
        if ("intensity".equals(mode)) return shOk;
        return magOk || shOk;
    }

    /** Titre (urgent ou non) d'une notification de séisme. */
    private static String title(String l, boolean strong) {
        switch (l) {
            case "en": return strong ? "Emergency Alert" : "Earthquake Alert";
            case "de": return strong ? "Notfallwarnung" : "Erdbebenwarnung";
            case "es": return strong ? "Alerta de emergencia" : "Alerta sísmica";
            default: return strong ? "Alerte d'urgence" : "Alerte sismique";
        }
    }

    /** Même disposition dans chaque langue (comme web/js/i18n.js). */
    private static String body(String l, String i) {
        boolean has = i != null && !i.isEmpty();
        switch (l) {
            case "en": return "Earthquake Early Warning : Shaking is expected." + (has ? " Expected intensity is " + i + "." : "")
                + " Stay calm and protect yourself. (M-Alert)";
            case "de": return "Erdbebenfrühwarnung : Erschütterungen werden erwartet." + (has ? " Die erwartete Intensität beträgt " + i + "." : "")
                + " Bleiben Sie ruhig und schützen Sie sich. (M-Alert)";
            case "es": return "Alerta sísmica temprana : Se esperan sacudidas." + (has ? " La intensidad esperada es " + i + "." : "")
                + " Mantenga la calma y protéjase. (M-Alert)";
            default: return "Alerte sismique précoce : Des secousses sont attendues." + (has ? " Intensité attendue : " + i + "." : "")
                + " Restez calme et protégez-vous. (M-Alert)";
        }
    }

    static JSONArray langs(JSONObject settings) {
        JSONArray langs = settings.optJSONArray("notifLangs");
        return langs == null || langs.length() == 0 ? new JSONArray().put("fr").put("en") : langs;
    }

    /**
     * { titre, texte } de la notification d'un séisme, langue principale en haut, seconde en dessous :
     *   Alerte sismique précoce : Des secousses sont attendues. Intensité attendue : 4. Restez calme et protégez-vous. (M-Alert)
     * Intensité : celle de mes départements, sinon l'intensité maximale de l'alerte.
     */
    static String[] notification(JSONObject a, JSONObject settings) {
        JSONArray langs = langs(settings);
        String local = localIntensity(a, settings);
        String intensity = local != null && !"0".equals(local) ? local : a.optString("shindo", "");
        boolean strong = a.optInt("level", 1) >= 4 || rank(intensity) >= 5;
        StringBuilder t = new StringBuilder();
        StringBuilder b = new StringBuilder();
        for (int k = 0; k < langs.length(); k++) {
            String l = langs.optString(k);
            if (k > 0) { t.append(" · "); b.append('\n'); }
            t.append(title(l, strong));
            b.append(body(l, intensity));
        }
        return new String[] { t.toString(), b.toString() };
    }

    /**
     * { titre, texte } d'une alerte annulée (toutes les alertes), deux langues :
     *   L'alerte de tremblement de terre émise à 14 h 32 a été annulée. (M-Alert)
     *   The earthquake alert triggered at 14:32 has been canceled. (M-Alert)
     */
    static String[] cancelNotification(JSONObject a, JSONObject settings) {
        JSONArray langs = langs(settings);
        String cat = a.optString("category", "meteo");
        String key = "meteo".equals(cat) ? "p" + a.optInt("phenomenon", 0) : cat;
        String hm = "";
        try {
            java.text.SimpleDateFormat in = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.ROOT);
            in.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
            java.util.Date d = in.parse(a.optString("createdAt").substring(0, 19));
            hm = new java.text.SimpleDateFormat("HH:mm", Locale.ROOT).format(d);
        } catch (Exception ignored) {
            // heure inconnue
        }
        JSONObject names = settings.optJSONObject("kindNames");
        StringBuilder t = new StringBuilder();
        StringBuilder b = new StringBuilder();
        for (int k = 0; k < langs.length(); k++) {
            String l = langs.optString(k);
            JSONObject n = names != null ? names.optJSONObject(l) : null;
            String ph = n != null && n.has(key) ? n.optString(key) : a.optString("title");
            if (k > 0) { t.append(" · "); b.append('\n'); }
            switch (l) {
                case "en":
                    t.append("Alert canceled");
                    b.append("The ").append(ph).append(" alert triggered at ").append(hm).append(" has been canceled. (M-Alert)");
                    break;
                case "de":
                    t.append("Warnung aufgehoben");
                    b.append("Die Warnung „").append(ph).append("“ von ").append(hm).append(" Uhr wurde aufgehoben. (M-Alert)");
                    break;
                case "es":
                    t.append("Alerta cancelada");
                    b.append("La alerta de ").append(ph).append(" emitida a las ").append(hm).append(" ha sido cancelada. (M-Alert)");
                    break;
                default:
                    t.append("Alerte annulée");
                    boolean vowel = !ph.isEmpty() && "aeiouyhàâéèêîïôûü".indexOf(Character.toLowerCase(ph.charAt(0))) >= 0;
                    b.append("L'alerte ").append(vowel ? "d'" : "de ").append(ph).append(" émise à ").append(hm.replace(":", " h "))
                        .append(" a été annulée. (M-Alert)");
            }
        }
        return new String[] { t.toString(), b.toString() };
    }
}
