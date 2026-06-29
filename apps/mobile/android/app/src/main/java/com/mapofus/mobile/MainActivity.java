package com.mapofus.mobile;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(JPushPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
