package com.fieldworker.data.preferences

import org.junit.Assert.assertEquals
import org.junit.Test

class ServerUrlTest {

    @Test
    fun `https keeps the standard port`() {
        assertEquals("https://example.org", ServerUrl.build("https://example.org/", 8001))
    }

    @Test
    fun `http gets the port unless it is already there`() {
        assertEquals("http://10.0.2.2:8001", ServerUrl.build("http://10.0.2.2", 8001))
        assertEquals("http://10.0.2.2:9000", ServerUrl.build("http://10.0.2.2:9000", 8001))
    }

    @Test
    fun `address without scheme is treated as http`() {
        assertEquals("http://192.168.1.5:8001", ServerUrl.build("  192.168.1.5 ", 8001))
        assertEquals("http://192.168.1.5:9000", ServerUrl.build("192.168.1.5:9000", 8001))
    }

    @Test
    fun `colon in the path is not a port`() {
        assertEquals("http://host:8001/api:v1", ServerUrl.build("http://host/api:v1", 8001))
    }

    @Test
    fun `blank input stays blank`() {
        assertEquals("", ServerUrl.build("   ", 8001))
    }
}
