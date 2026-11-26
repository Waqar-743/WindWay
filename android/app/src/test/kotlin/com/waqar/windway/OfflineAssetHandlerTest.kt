package com.waqar.windway

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class OfflineAssetHandlerTest {
    @Test
    fun resolvesRootAndValidAssetPaths() {
        assertEquals("index.html", OfflineAssetPaths.sanitizeRelativePath(""))
        assertEquals("index.html", OfflineAssetPaths.sanitizeRelativePath("/"))
        assertEquals("assets/app.js", OfflineAssetPaths.sanitizeRelativePath("assets/app.js"))
        assertEquals("models/mclaren-mcl38/f1_2024_mclaren_mcl38.glb", OfflineAssetPaths.sanitizeRelativePath("/models/mclaren-mcl38/f1_2024_mclaren_mcl38.glb"))
    }

    @Test
    fun rejectsTraversalAndUnsafeCharacters() {
        val bad = listOf(
            "../secret",
            "assets/../../etc/passwd",
            "%2e%2e/secret",
            "a%2fb",
            "a\\b",
            "a\u0000b",
            "assets/",
            "./index.html",
        )
        for (path in bad) {
            assertNull("Expected rejection for $path", OfflineAssetPaths.sanitizeRelativePath(path))
        }
    }

    @Test
    fun mapsExactMimeTypesForGameAssets() {
        assertEquals("text/html", OfflineAssetPaths.mimeTypeFor("index.html"))
        assertEquals("text/javascript", OfflineAssetPaths.mimeTypeFor("assets/game.js"))
        assertEquals("application/wasm", OfflineAssetPaths.mimeTypeFor("assets/rapier.wasm"))
        assertEquals("model/gltf-binary", OfflineAssetPaths.mimeTypeFor("models/car.glb"))
        assertEquals("image/svg+xml", OfflineAssetPaths.mimeTypeFor("branding/windway-crest.svg"))
        assertEquals("font/ttf", OfflineAssetPaths.mimeTypeFor("fonts/outfit-500.ttf"))
        assertEquals("utf-8", OfflineAssetPaths.charsetFor("text/html"))
        assertNull(OfflineAssetPaths.charsetFor("application/wasm"))
    }
}
