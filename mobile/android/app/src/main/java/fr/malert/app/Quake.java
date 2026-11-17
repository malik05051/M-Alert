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

    // Textes : [titre urgent, titre, alerte précoce, secousses fortes, secousses]
    // Même disposition dans chaque langue : « Alerte sismique précoce : <message> (M-Alert) ».
    private static String[] texts(String lang) {
        switch (lang) {
            case "en": return new String[] { "Emergency Alert", "Earthquake Alert", "Earthquake Early Warning",
                "Strong shaking is expected. Stay calm and protect yourself.", "Shaking is expected. Stay calm and protect yourself." };
            case "de": return new String[] { "Notfallwarnung", "Erdbebenwarnung", "Erdbebenfrühwarnung",
                "Starke Erschütterungen werden erwartet. Bleiben Sie ruhig und schützen Sie sich.",
                "Erschütterungen werden erwartet. Bleiben Sie ruhig und schützen Sie sich." };
            case "es": return new String[] { "Alerta de emergencia", "Alerta sísmica", "Alerta sísmica temprana",
                "Se esperan sacudidas fuertes. Mantenga la calma y protéjase.", "Se esperan sacudidas. Mantenga la calma y protéjase." };
            default: return new String[] { "Alerte d'urgence", "Alerte sismique", "Alerte sismique précoce",
                "Des secousses fortes sont attendues. Restez calme et protégez-vous.",
                "Des secousses sont attendues. Restez calme et protégez-vous." };
        }
    }

    /**
     * { titre, texte } de la notification d'un séisme, langue principale en haut, seconde en dessous :
     *   Alerte sismique précoce : Des secousses fortes sont attendues. Restez calme et protégez-vous. (M-Alert)
     *   Earthquake Early Warning : Strong shaking is expected. Stay calm and protect yourself. (M-Alert)
     */
    static String[] notification(JSONObject a, JSONObject settings) {
        JSONArray langs = settings.optJSONArray("notifLangs");
        if (langs == null || langs.length() == 0) langs = new JSONArray().put("fr").put("en");
        String local = localIntensity(a, settings);
        boolean strong = a.optInt("level", 1) >= 4 || (local != null && rank(local) >= 5);
        StringBuilder title = new StringBuilder();
        StringBuilder body = new StringBuilder();
        for (int i = 0; i < langs.length(); i++) {
            String[] t = texts(langs.optString(i));
            if (i > 0) { title.append(" · "); body.append('\n'); }
            title.append(strong ? t[0] : t[1]);
            body.append(t[2]).append(" : ").append(strong ? t[3] : t[4]).append(" (M-Alert)");
        }
        return new String[] { title.toString(), body.toString() };
    }
}
