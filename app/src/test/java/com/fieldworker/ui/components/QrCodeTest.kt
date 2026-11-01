package com.fieldworker.ui.components

import com.google.zxing.BinaryBitmap
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import org.junit.Assert.assertEquals
import org.junit.Test

class QrCodeTest {

    @Test
    fun `link survives encode and scan`() {
        val url = "https://balalayka.duckdns.org/portal/a/aUoA2CTBjnadKm_p_gEgzGUvte0UMPGIbYqWTFn6NN4"
        val modules = qrModules(url)

        // Рисуем как на экране: 4 px на модуль и поле в 4 модуля
        val scale = 4
        val quiet = 4 * scale
        val side = modules.size * scale + 2 * quiet
        val pixels = IntArray(side * side) { 0xFFFFFFFF.toInt() }
        modules.forEachIndexed { y, row ->
            row.forEachIndexed { x, dark ->
                if (dark) {
                    for (dy in 0 until scale) for (dx in 0 until scale) {
                        pixels[(quiet + y * scale + dy) * side + quiet + x * scale + dx] = 0xFF000000.toInt()
                    }
                }
            }
        }
        val bitmap = BinaryBitmap(HybridBinarizer(RGBLuminanceSource(side, side, pixels)))

        assertEquals(url, QRCodeReader().decode(bitmap).text)
    }
}
