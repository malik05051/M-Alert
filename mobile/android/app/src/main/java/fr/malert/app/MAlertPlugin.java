package fr.malert.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

/**
 * Pont entre la page M-Alert et Android : réglages de réception (serveur, départements, niveau…)
 * transmis au service qui reçoit les alertes en arrière-plan.
 */
@CapacitorPlugin(
    name = "MAlertNative",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class MAlertPlugin extends Plugin {
    static final String PREFS = "malert";

    /** Réglages (JSON des réglages de la page) ; background : service en arrière-plan. */
    @PluginMethod
    public void configure(PluginCall call) {
        Context ctx = getContext();
        SharedPreferences.Editor ed = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        ed.putString("settings", call.getString("settings", "{}"));
        boolean background = Boolean.TRUE.equals(call.getBoolean("background", true));
        ed.putBoolean("background", background);
        ed.apply();
        Intent i = new Intent(ctx, AlertService.class);
        if (background) {
            if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != com.getcapacitor.PermissionState.GRANTED) {
                requestPermissionForAlias("notifications", call, "permissionDone");
            }
            ContextCompat.startForegroundService(ctx, i.setAction(AlertService.ACTION_RELOAD));
        } else {
            ctx.stopService(i);
        }
        JSObject ret = new JSObject();
        ret.put("background", background);
        call.resolve(ret);
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void permissionDone(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("connected", AlertService.connected);
        ret.put("running", AlertService.running);
        call.resolve(ret);
    }
}
