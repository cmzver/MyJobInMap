package com.fieldworker.ui.components

import androidx.compose.ui.geometry.Offset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SignatureStateTest {

    @Test
    fun `strokes keep time from the first touch`() {
        val state = SignatureState()

        state.begin(Offset(10.4f, 20.6f), uptimeMillis = 1_000)
        state.extend(Offset(30f, 40f), uptimeMillis = 1_016)
        state.end()
        state.begin(Offset(50f, 60f), uptimeMillis = 1_500)
        state.end()

        assertFalse(state.isEmpty)
        assertEquals("[[[10,21,0],[30,40,16]],[[50,60,500]]]", state.strokesJson())
    }

    @Test
    fun `clear starts a new signature`() {
        val state = SignatureState()
        state.begin(Offset(1f, 1f), uptimeMillis = 100)
        state.end()

        state.clear()
        state.begin(Offset(2f, 2f), uptimeMillis = 900)
        state.end()

        assertEquals("[[[2,2,0]]]", state.strokesJson())
        state.clear()
        assertTrue(state.isEmpty)
    }
}
