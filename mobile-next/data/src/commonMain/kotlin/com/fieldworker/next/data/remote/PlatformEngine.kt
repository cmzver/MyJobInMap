package com.fieldworker.next.data.remote

import io.ktor.client.engine.HttpClientEngine

expect fun createPlatformEngine(): HttpClientEngine
