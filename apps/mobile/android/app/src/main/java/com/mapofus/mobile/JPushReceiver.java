package com.mapofus.mobile;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import cn.jpush.android.api.JPushInterface;
import cn.jpush.android.api.NotificationMessage;
import cn.jpush.android.service.JPushMessageReceiver;

public class JPushReceiver extends JPushMessageReceiver {
    private static final String TAG = "OurMemoriesJPush";

    @Override
    public void onRegister(Context context, String registrationId) {
        Log.d(TAG, "JPush registrationId: " + registrationId);
    }

    @Override
    public void onNotifyMessageOpened(Context context, NotificationMessage message) {
        Intent intent = new Intent(context, MainActivity.class);
        Bundle bundle = new Bundle();
        bundle.putString(JPushInterface.EXTRA_NOTIFICATION_TITLE, message.notificationTitle);
        bundle.putString(JPushInterface.EXTRA_ALERT, message.notificationContent);
        intent.putExtras(bundle);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        context.startActivity(intent);
    }
}
