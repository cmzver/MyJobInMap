package com.fieldworker.next.push

import android.os.Build
import com.fieldworker.next.data.push.PushTokenProvider
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await

class FirebasePushTokenProvider : PushTokenProvider {

    override suspend fun getToken(): String? {
        return try {
            FirebaseMessaging.getInstance().token.await()
        } catch (_: Exception) {
            // Firebase not initialized or unavailable
            null
        }
    }

    override fun getDeviceName(): String {
        return "${Build.MANUFACTURER} ${Build.MODEL}"
    }
}
