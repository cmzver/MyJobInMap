package com.fieldworker.data.repository

import android.content.Context
import com.fieldworker.data.api.AuthApi
import com.fieldworker.data.dto.UpdateCheckDto
import com.fieldworker.data.dto.UpdateInfoDto
import io.mockk.*
import io.mockk.impl.annotations.MockK
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.BeforeClass
import org.junit.Test
import retrofit2.Response
import java.io.File

/**
 * Unit тесты для UpdateRepository.
 * Проверяют проверку обновлений и загрузку APK.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class UpdateRepositoryTest {

    companion object {
        @JvmStatic
        @BeforeClass
        fun setupClass() {
            mockkStatic(android.util.Log::class)
            every { android.util.Log.d(any(), any()) } returns 0
            every { android.util.Log.e(any(), any()) } returns 0
            every { android.util.Log.e(any(), any(), any()) } returns 0
            every { android.util.Log.w(any(), any<String>()) } returns 0
        }
    }

    private val testDispatcher = StandardTestDispatcher()

    @MockK
    private lateinit var authApi: AuthApi

    @MockK
    private lateinit var context: Context

    private lateinit var repository: UpdateRepository
    private lateinit var cacheDir: File

    @Before
    fun setup() {
        MockKAnnotations.init(this, relaxed = true)
        Dispatchers.setMain(testDispatcher)
        cacheDir = File(System.getProperty("java.io.tmpdir"), "test_cache_${System.nanoTime()}")
        cacheDir.mkdirs()
        every { context.cacheDir } returns cacheDir
        repository = UpdateRepository(authApi, context)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        cacheDir.deleteRecursively()
    }

    // ==================== checkForUpdate ====================

    @Test
    fun `checkForUpdate returns success when update available`() = runTest {
        val updateInfo = UpdateInfoDto(
            versionName = "2.0",
            versionCode = 2,
            releaseNotes = "Bug fixes",
            isMandatory = false,
            fileSize = 1024L,
            downloadUrl = "/api/updates/download",
            createdAt = "2026-01-01"
        )
        val checkDto = UpdateCheckDto(
            updateAvailable = true,
            currentVersion = "1.0",
            update = updateInfo
        )
        coEvery { authApi.checkUpdate(1, "1.0") } returns Response.success(checkDto)

        val result = repository.checkForUpdate(1, "1.0")

        assertTrue(result.isSuccess)
        val check = result.getOrNull()!!
        assertTrue(check.updateAvailable)
        assertEquals("2.0", check.update?.versionName)
        assertEquals(2, check.update?.versionCode)
    }

    @Test
    fun `checkForUpdate returns success when no update available`() = runTest {
        val checkDto = UpdateCheckDto(
            updateAvailable = false,
            currentVersion = "2.0",
            update = null
        )
        coEvery { authApi.checkUpdate(2, "2.0") } returns Response.success(checkDto)

        val result = repository.checkForUpdate(2, "2.0")

        assertTrue(result.isSuccess)
        assertFalse(result.getOrNull()!!.updateAvailable)
        assertNull(result.getOrNull()!!.update)
    }

    @Test
    fun `checkForUpdate returns failure on server error`() = runTest {
        coEvery { authApi.checkUpdate(any(), any()) } returns Response.error(
            500,
            "Internal Server Error".toResponseBody("text/plain".toMediaType())
        )

        val result = repository.checkForUpdate(1, "1.0")

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()!!.message!!.contains("500"))
    }

    @Test
    fun `checkForUpdate returns failure on network error`() = runTest {
        coEvery { authApi.checkUpdate(any(), any()) } throws java.io.IOException("No connection")

        val result = repository.checkForUpdate(1, "1.0")

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is java.io.IOException)
    }

    @Test
    fun `checkForUpdate with mandatory update`() = runTest {
        val updateInfo = UpdateInfoDto(
            versionName = "3.0",
            versionCode = 3,
            releaseNotes = "Critical security fix",
            isMandatory = true,
            fileSize = 2048L,
            downloadUrl = "/api/updates/download",
            createdAt = "2026-03-01"
        )
        val checkDto = UpdateCheckDto(
            updateAvailable = true,
            currentVersion = "2.0",
            update = updateInfo
        )
        coEvery { authApi.checkUpdate(2, "2.0") } returns Response.success(checkDto)

        val result = repository.checkForUpdate(2, "2.0")

        assertTrue(result.isSuccess)
        assertTrue(result.getOrNull()!!.update!!.isMandatory)
    }

    // ==================== downloadUpdate ====================

    @Test
    fun `downloadUpdate saves APK and reports progress`() = runTest {
        val apkContent = ByteArray(1024) { it.toByte() }
        val body = apkContent.toResponseBody("application/vnd.android.package-archive".toMediaType())
        coEvery { authApi.downloadUpdate() } returns Response.success(body)

        val progressValues = mutableListOf<Int>()
        val result = repository.downloadUpdate { progress ->
            progressValues.add(progress)
        }

        assertTrue(result.isSuccess)
        val file = result.getOrNull()!!
        assertTrue(file.exists())
        assertEquals(1024L, file.length())
        // Last progress should be 100
        assertTrue(progressValues.isNotEmpty())
        assertEquals(100, progressValues.last())
    }

    @Test
    fun `downloadUpdate returns failure on server error`() = runTest {
        coEvery { authApi.downloadUpdate() } returns Response.error(
            404,
            "Not Found".toResponseBody("text/plain".toMediaType())
        )

        val result = repository.downloadUpdate()

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()!!.message!!.contains("404"))
    }

    @Test
    fun `downloadUpdate returns failure on network error`() = runTest {
        coEvery { authApi.downloadUpdate() } throws java.io.IOException("Connection lost")

        val result = repository.downloadUpdate()

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is java.io.IOException)
    }

    @Test
    fun `downloadUpdate cleans old APKs before saving`() = runTest {
        // Create old APK file
        val updatesDir = File(cacheDir, "updates")
        updatesDir.mkdirs()
        val oldApk = File(updatesDir, "old_update.apk")
        oldApk.writeText("old content")

        val apkContent = ByteArray(512) { it.toByte() }
        val body = apkContent.toResponseBody("application/vnd.android.package-archive".toMediaType())
        coEvery { authApi.downloadUpdate() } returns Response.success(body)

        val result = repository.downloadUpdate()

        assertTrue(result.isSuccess)
        // Old APK should be deleted
        assertFalse(oldApk.exists())
        // New APK should exist
        val newApk = File(updatesDir, "update.apk")
        assertTrue(newApk.exists())
        assertEquals(512L, newApk.length())
    }
}
