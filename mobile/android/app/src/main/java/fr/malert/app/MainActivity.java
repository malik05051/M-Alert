package fr.malert.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Application au premier plan : les alertes sont montrées par la page (le service se tait). */
    public static volatile boolean visible = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MAlertPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        visible = true;
    }

    @Override
    public void onPause() {
        visible = false;
        super.onPause();
    }
}
