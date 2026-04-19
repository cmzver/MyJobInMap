package com.fieldworker.next

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.fieldworker.next.data.remote.store.SharedPrefsPortalSessionStore
import com.fieldworker.next.push.FirebasePushTokenProvider

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val sessionStore = SharedPrefsPortalSessionStore(applicationContext)
        val pushTokenProvider = FirebasePushTokenProvider()
        setContent {
            App(sessionStore, pushTokenProvider)
        }
    }
}
