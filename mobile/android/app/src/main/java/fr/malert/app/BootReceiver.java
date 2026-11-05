package fr.malert.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;

/** Après un redémarrage du téléphone : le service de réception repart (s'il était activé). */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        if (!ctx.getSharedPreferences(MAlertPlugin.PREFS, Context.MODE_PRIVATE).getBoolean("background", false)) return;
        ContextCompat.startForegroundService(ctx, new Intent(ctx, AlertService.class));
    }
}
