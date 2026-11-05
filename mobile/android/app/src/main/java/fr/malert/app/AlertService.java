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
    };
    private static final int[] WATER = { 2, 4, 9, 12, 16 };

    private final OkHttpClient http = new OkHttpClient.Builder().pingInterval(25, TimeUnit.SECONDS).readTimeout(0, TimeUnit.MILLISECONDS).build();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Set<String> seen = new HashSet<>();
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
        } catch (Exception e) {
            settings = new JSONObject();
        }
    }

    private void connect() {
        if (ws != null) ws.close(1000, "nouvelle connexion");
        String server = settings.optString("serverUrl", "https://m-alert-sender.onrender.com").replaceAll("/+$", "");
        String url = server.replaceFirst("^http", "ws") + "/ws";
        ws = http.newWebSocket(new Request.Builder().url(url).build(), new WebSocketListener() {
            @Override
            public void onOpen(WebSocket s, Response r) {
                connected = true;
                retry = 0;
            }

            @Override
            public void onMessage(WebSocket s, String text) {
                handle(text);
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
                // Alertes déjà en cours : connues, pas renotifiées (sauf nouvelles).
                JSONArray list = msg.optJSONArray("alerts");
                if (list != null) for (int i = 0; i < list.length(); i++) seen.add(list.getJSONObject(i).optString("id"));
                return;
            }
            if (!"alert".equals(type) && !"ring".equals(type)) return;
            JSONObject a = msg.getJSONObject("alert");
            String id = a.optString("id");
            if ("alert".equals(type) && seen.contains(id)) return;
            seen.add(id);
            if (MainActivity.visible || !wanted(a)) return;
            notifyAlert(a);
        } catch (Exception ignored) {
            // message illisible
        }
    }

    /** Mêmes règles que la page : départements suivis, niveau minimum, catégories et phénomènes. */
    private boolean wanted(JSONObject a) throws Exception {
        if (a.optBoolean("silent") || a.optBoolean("pending") || !a.isNull("cancelledAt") && a.has("cancelledAt")) return false;
        int level = a.optInt("level", 1);
        if (level < settings.optInt("minLevel", 1)) return false;
        String cat = a.optString("category", "meteo");
        JSONArray off = settings.optJSONArray("categoriesOff");
        if (off != null) for (int i = 0; i < off.length(); i++) if (cat.equals(off.optString(i))) return false;
        JSONArray phOff = settings.optJSONArray("phenomenaOff");
        if (phOff != null && "meteo".equals(cat)) for (int i = 0; i < phOff.length(); i++) if (a.optInt("phenomenon") == phOff.optInt(i)) return false;
        if (settings.optBoolean("all")) return true;
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
        if ("seisme".equals(cat)) {
            String s = a.optString("quakeSound", "eew");
            return "eew2".equals(s) ? "seisme_eew2" : "leger".equals(s) ? "seisme_leger" : "seisme_eew";
        }
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
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, "alert_" + sound)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(a.optString("description"))
            .setStyle(new NotificationCompat.BigTextStyle().bigText(a.optString("description")))
            .setPriority(level >= 4 ? NotificationCompat.PRIORITY_MAX : NotificationCompat.PRIORITY_HIGH)
            .setCategory(level >= 4 ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(openApp(a.optString("id").hashCode()));
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.notify(a.optString("id").hashCode(), b.build());
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
            ch.setBypassDnd(s[0].startsWith("seisme") || "majeur".equals(s[0]) || "tsunami".equals(s[0]));
            nm.createNotificationChannel(ch);
        }
    }
}
