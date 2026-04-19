package com.fieldworker.next.data.remote.model

import kotlinx.serialization.Serializable

@Serializable
data class PortalPageDto<T>(
    val items: List<T>,
    val total: Int,
    val page: Int,
    val size: Int,
    val pages: Int,
)
