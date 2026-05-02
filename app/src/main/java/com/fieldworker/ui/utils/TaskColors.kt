package com.fieldworker.ui.utils

import androidx.compose.ui.graphics.Color
import com.fieldworker.domain.model.Priority

fun priorityColor(priority: Priority): Color = when (priority) {
    Priority.EMERGENCY -> Color(0xFFFF3B30)
    Priority.URGENT    -> Color(0xFFFF9500)
    Priority.CURRENT   -> Color(0xFF0A84FF)
    Priority.PLANNED   -> Color(0xFF34C759)
}

fun priorityBackground(priority: Priority): Color = when (priority) {
    Priority.EMERGENCY -> Color(0xFFFFEBEE)
    Priority.URGENT    -> Color(0xFFFFF3E0)
    Priority.CURRENT   -> Color(0xFFE3F2FD)
    Priority.PLANNED   -> Color(0xFFE8F5E9)
}
