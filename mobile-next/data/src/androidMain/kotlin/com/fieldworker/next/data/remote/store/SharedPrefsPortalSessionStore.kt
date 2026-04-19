package com.fieldworker.next.data.remote.store

import android.content.Context
import android.content.SharedPreferences

class SharedPrefsPortalSessionStore(context: Context) : PortalSessionStore {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("portal_session", Context.MODE_PRIVATE)

    override suspend fun read(): StoredPortalSession? {
        val accessToken = prefs.getString(KEY_ACCESS_TOKEN, null) ?: return null
        return StoredPortalSession(
            environmentId = prefs.getString(KEY_ENVIRONMENT_ID, "") ?: "",
            accessToken = accessToken,
            refreshToken = prefs.getString(KEY_REFRESH_TOKEN, "") ?: "",
            tokenType = prefs.getString(KEY_TOKEN_TYPE, "bearer") ?: "bearer",
            userId = prefs.getLong(KEY_USER_ID, 0L),
            username = prefs.getString(KEY_USERNAME, "") ?: "",
        )
    }

    override suspend fun write(session: StoredPortalSession) {
        prefs.edit()
            .putString(KEY_ENVIRONMENT_ID, session.environmentId)
            .putString(KEY_ACCESS_TOKEN, session.accessToken)
            .putString(KEY_REFRESH_TOKEN, session.refreshToken)
            .putString(KEY_TOKEN_TYPE, session.tokenType)
            .putLong(KEY_USER_ID, session.userId)
            .putString(KEY_USERNAME, session.username)
            .apply()
    }

    override suspend fun clear() {
        prefs.edit().clear().apply()
    }

    private companion object {
        const val KEY_ENVIRONMENT_ID = "environment_id"
        const val KEY_ACCESS_TOKEN = "access_token"
        const val KEY_REFRESH_TOKEN = "refresh_token"
        const val KEY_TOKEN_TYPE = "token_type"
        const val KEY_USER_ID = "user_id"
        const val KEY_USERNAME = "username"
    }
}
