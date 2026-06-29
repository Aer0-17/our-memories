package com.mapofus.mobile;

import android.app.Application;
import android.content.pm.ApplicationInfo;

import cn.jiguang.api.utils.JCollectionAuth;
import cn.jpush.android.api.JPushInterface;

public class OurMemoriesApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        JCollectionAuth.setAuth(this, true);
        JPushInterface.setDebugMode((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        JPushInterface.init(this);
    }
}
