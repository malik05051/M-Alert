package fr.malert.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Service de premier plan : reste connecté au serveur M-Alert (WebSocket) et affiche les alertes
 * qui concernent l'utilisateur quand l'application n'est pas à l'écran, avec le son M-Alert de
 * chaque type d'alerte (un canal de notification par son, réglable dans Android).
 */
public class AlertService extends Service {
    static final String ACTION_RELOAD = "fr.malert.app.RELOAD";
    static volatile boolean connected = false;
    static volatile boolean running = false;

    private static final String CH_SERVICE = "service";
    // Sons M-Alert (res/raw) : un canal par son.
    private static final String[][] SOUNDS = {
        { "information", "Information" }, { "eew", "Alerte jaune et orange" }, { "rouge", "Alerte rouge" },
        { "majeur", "Alerte majeure" }, { "tsunami", "Tsunami, crues, inondations" }, { "seisme_eew", "Séisme (EEW)" },
        { "seisme_eew2", "Séisme (EEW 2)" }, { "seisme_leger", "Séisme (EEW léger)" },
        { "alerte_mobile", "Alerte orange, rouge et majeure" },
    };
    private static final int[] WATER = { 2, 4, 9, 12, 16 };

    private final OkHttpClient http = new OkHttpClient.Builder().pingInterval(60, TimeUnit.SECONDS).readTimeout(0, TimeUnit.MILLISECONDS).build();
    private final Handler handler = new Handler(Looper.getMainLooper());
    /** Alertes déjà vues (gardées sur l'appareil : pas de doublon après un redémarrage du service). */
    private final Set<String> seen = new HashSet<>();
    private final java.util.ArrayList<String> seenOrder = new java.util.ArrayList<>();
    /** Écart entre l'horloge du serveur et celle du téléphone (ms), d'après le « hello ». */
    private long serverOffsetMs = 0;
    private WebSocket ws;
    private JSONObject settings = new JSONObject();
    private int retry = 0;
    private boolean stopping = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        running = true;
        Notification n = new NotificationCompat.Builder(this, CH_SERVICE)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("M-Alert")
            .setContentText("Réception des alertes en arrière-plan")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setContentIntent(openApp(0))
            .build();
        int type = Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0;
        ServiceCompat.startForeground(this, 1, n, type);
        loadSettings();
        connect();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopping = true;
        running = false;
        connected = false;
        if (ws != null) ws.close(1000, "arrêt");
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void loadSettings() {
        SharedPreferences p = getSharedPreferences(MAlertPlugin.PREFS, Context.MODE_PRIVATE);
        try {
            settings = new JSONObject(p.getString("settings", "{}"));
            JSONArray kept = new JSONArray(p.getString("seen", "[]"));
            seen.clear();
            seenOrder.clear();
            for (int i = 0; i < kept.length(); i++) { seenOrder.add(kept.getString(i)); seen.add(kept.getString(i)); }
        } catch (Exception e) {
            settings = new JSONObject();
        }
    }

    private void connect() {
        if (ws != null) ws.close(1000, "nouvelle connexion");
        String server = settings.optString("serverUrl", "https://m-alert-sender.onrender.com").replaceAll("/+$", "");
        // Canal allégé : seulement les alertes et notifications qui sonnent, un ping par minute
        // (venant du téléphone) : moins de réveils de la radio, moins de batterie.
        String url = server.replaceFirst("^http", "ws") + "/ws?lite=1";
        // Version et empreinte de l'application (le serveur peut refuser une version trop ancienne).
        try {
            url += "&v=" + java.net.URLEncoder.encode(settings.optString("appVersion", ""), "UTF-8")
                + "&b=" + java.net.URLEncoder.encode(settings.optString("appBuild", ""), "UTF-8");
        } catch (Exception ignored) {
            // encodage UTF-8 toujours disponible
        }
        // Dernier signe de vie (heure du serveur) : le serveur renvoie les alertes émises depuis,
        // manquées pendant une coupure ou un arrêt du service (marge d'une minute, sans doublon).
        long alive = prefs().getLong("aliveServerMs", 0);
        if (alive > 0) url += "&since=" + (alive - 60000);
        ws = http.newWebSocket(new Request.Builder().url(url).build(), new WebSocketListener() {
            @Override
            public void onOpen(WebSocket s, Response r) {
                connected = true;
                retry = 0;
            }

            @Override
            public void onMessage(WebSocket s, String text) {
                handle(text);
                markAlive();
            }

            @Override
            public void onClosed(WebSocket s, int code, String reason) {
                reconnect();
            }

            @Override
            public void onFailure(WebSocket s, Throwable t, Response r) {
                reconnect();
            }
        });
    }

    private void reconnect() {
        connected = false;
        if (stopping) return;
        long delay = Math.min(60000, 2000L * (1L << Math.min(5, retry++)));
        handler.postDelayed(this::connect, delay);
    }

    private void handle(String text) {
        try {
            JSONObject msg = new JSONObject(text);
            String type = msg.optString("type");
            if ("hello".equals(type)) {
                if (msg.has("serverMs")) serverOffsetMs = msg.optLong("serverMs") - System.currentTimeMillis();
                // Alertes manquées (émises pendant une coupure ou un arrêt du service) : notifiées.
                JSONArray missed = msg.optJSONArray("missed");
                if (missed != null) for (int i = 0; i < missed.length(); i++) process(missed.getJSONObject(i), false);
                // Alertes déjà en cours : connues, pas renotifiées (sauf nouvelles).
                JSONArray list = msg.optJSONArray("alerts");
                if (list != null) for (int i = 0; i < list.length(); i++) markSeen(list.getJSONObject(i).optString("id"));
                return;
            }
            if ("cancel".equals(type)) {
                // Alerte annulée (fausse alerte) : annoncée si elle me concernait (mêmes règles que l'alerte).
                JSONObject a = msg.getJSONObject("alert");
                if (!a.has("voided") || a.isNull("voided") || a.optBoolean("silent") || MainActivity.visible) return;
                JSONObject b = new JSONObject(a.toString());
                b.remove("cancelledAt");
                if (wanted(b)) notifyCancel(a);
                return;
            }
            if ("vig-ring".equals(type)) {
                // Vigilance Météo-France relancée en « alerte mobile » depuis M-Alert-sender.
                JSONObject g = msg.optJSONObject("group");
                if (g == null || !msg.optBoolean("mobileAlert") || MainActivity.visible) return;
                if (!settings.optBoolean("all") && !concernsMe(g)) return;
                JSONArray phOff = settings.optJSONArray("phenomenaOff");
                if (phOff != null) for (int i = 0; i < phOff.length(); i++) if (g.optInt("phenomenon") == phOff.optInt(i)) return;
                notifyVigMobile(g);
                return;
            }
            if ("notice".equals(type)) {
                // Notification de M-Alert qui déclenche l'alerte mobile : sonne comme une alerte,
                // titre et texte tels quels (« Sécurité Civile » / « Avis de tornade »).
                JSONObject n = msg.getJSONObject("notice");
                if (!n.optBoolean("mobileAlert") || MainActivity.visible || !settings.optBoolean("notices", true)) return;
                if (!settings.optBoolean("all") && !concernsMe(n)) return;
                if (seen.contains("notice-" + n.optString("id"))) return;
                markSeen("notice-" + n.optString("id"));
                notifyMobileNotice(n);
                return;
            }
            if (!"alert".equals(type) && !"ring".equals(type)) return;
            process(msg.getJSONObject("alert"), "ring".equals(type));
        } catch (Exception ignored) {
            // message illisible
        }
    }

    /** Nouvelle alerte (ou relance) : notifiée une seule fois, si elle me concerne. */
    private void process(JSONObject a, boolean ring) throws Exception {
        String id = a.optString("id");
        if (!ring && seen.contains(id)) return;
        markSeen(id);
        if (MainActivity.visible || !wanted(a)) return;
        notifyAlert(a);
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(MAlertPlugin.PREFS, Context.MODE_PRIVATE);
    }

    private void markSeen(String id) {
        if (id.isEmpty() || seen.contains(id)) return;
        seen.add(id);
        seenOrder.add(id);
        if (seenOrder.size() > 300) seen.remove(seenOrder.remove(0));
        prefs().edit().putString("seen", new JSONArray(seenOrder).toString()).apply();
    }

    /** Signe de vie de la connexion (message reçu) : heure gardée, en heure du serveur. */
    private void markAlive() {
        prefs().edit().putLong("aliveServerMs", System.currentTimeMillis() + serverOffsetMs).apply();
    }

    /** Mêmes règles que la page : départements suivis, niveau minimum, catégories et phénomènes. */
    private boolean wanted(JSONObject a) throws Exception {
        if (a.optBoolean("silent") || a.optBoolean("pending") || !a.isNull("cancelledAt") && a.has("cancelledAt")) return false;
        int level = a.optInt("level", 1);
        String cat = a.optString("category", "meteo");
        JSONArray off = settings.optJSONArray("categoriesOff");
        if (off != null) for (int i = 0; i < off.length(); i++) if (cat.equals(off.optString(i))) return false;
        // Séisme : magnitude ou intensité chez moi, si choisies dans les réglages.
        Boolean quake = Quake.wanted(a, settings, settings.optBoolean("all") || concernsMe(a));
        if (quake != null) return quake;
        // Alerte critique (avertissement de tsunami…) : même sous le niveau minimum choisi.
        if (level < settings.optInt("minLevel", 1) && !critical(a)) return false;
        JSONArray phOff = settings.optJSONArray("phenomenaOff");
        if (phOff != null && "meteo".equals(cat)) for (int i = 0; i < phOff.length(); i++) if (a.optInt("phenomenon") == phOff.optInt(i)) return false;
        if (settings.optBoolean("all")) return true;
        return concernsMe(a);
    }

    /** Alerte critique : même règle que M.isCritical (common.js). */
    private static boolean critical(JSONObject a) {
        if (a.has("critical") && !a.isNull("critical")) return a.optBoolean("critical");
        int level = a.optInt("level", 1);
        String cat = a.optString("category", "meteo");
        if ("tsunami".equals(cat) || "missile".equals(cat) || "attentat".equals(cat)) return level >= 4;
        return level >= 5 || a.optBoolean("mobileAlert");
    }

    /** L'alerte concerne mon département ou un département suivi. */
    private boolean concernsMe(JSONObject a) {
        Set<String> mine = new HashSet<>();
        if (!settings.isNull("department") && settings.has("department")) mine.add(settings.optString("department"));
        JSONArray extra = settings.optJSONArray("extra");
        if (extra != null) for (int i = 0; i < extra.length(); i++) mine.add(extra.optString(i));
        JSONArray deps = a.optJSONArray("departments");
        if (deps == null) return false;
        for (int i = 0; i < deps.length(); i++) {
            String d = deps.optString(i);
            if ("ALL".equals(d) || mine.contains(d)) return true;
        }
        return false;
    }

    /** Son M-Alert d'une alerte (comme sound.js). */
    private String soundOf(JSONObject a) {
        String cat = a.optString("category", "meteo");
        int level = a.optInt("level", 1);
        // Son choisi dans M-Alert-sender (« seisme-eew2 » -> canal « alert_seisme_eew2 »).
        String chosen = a.optString("sound", "").replace('-', '_');
        for (String[] s : SOUNDS) if (s[0].equals(chosen)) return chosen;
        // Alerte mobile demandée dans M-Alert-sender : son d'alerte mobile, quel que soit le niveau.
        if (a.optBoolean("mobileAlert")) return "alerte_mobile";
        if ("seisme".equals(cat)) {
            String s = a.optString("quakeSound", "eew");
            return "eew2".equals(s) ? "seisme_eew2" : "leger".equals(s) ? "seisme_leger" : "seisme_eew";
        }
        if (level >= 3) return "alerte_mobile"; // son d'alerte mobile : orange, rouge et majeure
        if ("missile".equals(cat)) return "rouge"; // missile : son de la vigilance rouge
        if (level >= 5) return "majeur";
        boolean water = "tsunami".equals(cat);
        if ("meteo".equals(cat)) for (int w : WATER) if (a.optInt("phenomenon") == w) water = true;
        if (water) return "tsunami";
        if (level == 4) return "rouge";
        if (level >= 2) return "eew";
        return "information";
    }

    private void notifyAlert(JSONObject a) {
        String sound = soundOf(a);
        int level = a.optInt("level", 1);
        String title = (a.optBoolean("test") ? "[TEST] " : "") + a.optString("levelName", "Alerte") + " — " + a.optString("title");
        String text = a.optString("description");
        // Séisme : en deux langues, comme une alerte d'urgence japonaise.
        if ("seisme".equals(a.optString("category"))) {
            String[] q = Quake.notification(a, settings);
            title = (a.optBoolean("test") ? "[TEST] " : "") + q[0];
            text = q[1];
        }
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, "alert_" + sound)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(level >= 4 || a.optBoolean("mobileAlert") ? NotificationCompat.PRIORITY_MAX : NotificationCompat.PRIORITY_HIGH)
            .setCategory(level >= 4 ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(openApp(a.optString("id").hashCode()));
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.notify(a.optString("id").hashCode(), b.build());
    }

    private void notifyVigMobile(JSONObject g) {
        String[] lv = { "", "verte", "jaune", "orange", "rouge", "majeure" };
        int level = Math.max(0, Math.min(5, g.optInt("level", 2)));
        JSONObject names = settings.optJSONObject("kindNames");
        JSONObject fr = names != null ? names.optJSONObject("fr") : null;
        if (fr == null && names != null && names.keys().hasNext()) fr = names.optJSONObject(names.keys().next());
        String ph = fr != null ? fr.optString("p" + g.optInt("phenomenon"), "") : "";
        String title = "Rappel · Vigilance " + lv[level] + (ph.isEmpty() ? "" : " — " + ph);
        JSONArray deps = g.optJSONArray("departments");
        StringBuilder text = new StringBuilder("Météo-France");
        if (deps != null && deps.length() > 0) {
            text.append(" · ");
            for (int i = 0; i < Math.min(8, deps.length()); i++) text.append(i > 0 ? ", " : "").append(deps.optString(i));
            if (deps.length() > 8) text.append("…");
        }
        String id = "vig-" + g.optString("key");
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, "alert_alerte_mobile")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(openApp(id.hashCode()));
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.notify(id.hashCode(), b.build());
    }

    private void notifyMobileNotice(JSONObject n) {
        String title = (n.optBoolean("test") ? "[TEST] " : "") + n.optString("title");
        String text = n.optString("body");
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, "alert_alerte_mobile")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(openApp(("notice-" + n.optString("id")).hashCode()));
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.notify(("notice-" + n.optString("id")).hashCode(), b.build());
    }

    private void notifyCancel(JSONObject a) {
        String[] c = Quake.cancelNotification(a, settings);
        String title = (a.optBoolean("test") ? "[TEST] " : "") + "❌ " + c[0];
        // Alerte annulée : son d'alerte mobile.
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, "alert_alerte_mobile")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(c[1])
            .setStyle(new NotificationCompat.BigTextStyle().bigText(c[1]))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(openApp(("void-" + a.optString("id")).hashCode()));
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.notify(("void-" + a.optString("id")).hashCode(), b.build());
    }

    private PendingIntent openApp(int code) {
        Intent i = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel svc = new NotificationChannel(CH_SERVICE, "Connexion au serveur", NotificationManager.IMPORTANCE_MIN);
        svc.setShowBadge(false);
        nm.createNotificationChannel(svc);
        AudioAttributes attrs = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        for (String[] s : SOUNDS) {
            NotificationChannel ch = new NotificationChannel("alert_" + s[0], s[1], NotificationManager.IMPORTANCE_HIGH);
            int res = getResources().getIdentifier(s[0], "raw", getPackageName());
            if (res != 0) ch.setSound(Uri.parse("android.resource://" + getPackageName() + "/" + res), attrs);
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[] { 0, 800, 200, 800, 200, 800 });
            ch.setBypassDnd(s[0].startsWith("seisme") || "majeur".equals(s[0]) || "tsunami".equals(s[0]) || "alerte_mobile".equals(s[0]));
            nm.createNotificationChannel(ch);
        }
    }
}
