package com.waqar.windway

import android.content.res.AssetManager
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.IOException
import java.util.Locale

/** Pure path validation and MIME mapping helpers, shared by runtime and unit tests. */
object OfflineAssetPaths {
    private val encodedTraversal = Regex("%2f|%5c|%00|%2e%2e", RegexOption.IGNORE_CASE)

    fun sanitizeRelativePath(rawPath: String): String? {
        val trimmed = rawPath.trimStart('/')
        val candidate = if (trimmed.isEmpty()) "index.html" else trimmed
        if (candidate.endsWith("/") ||
            candidate.contains('\\') ||
            candidate.contains('\u0000') ||
            encodedTraversal.containsMatchIn(candidate)
        ) {
            return null
        }
        val segments = candidate.split('/')
        if (segments.any { it.isEmpty() || it == "." || it == ".." || it.contains('%') }) {
            return null
        }
        return candidate
    }

    fun mimeTypeFor(path: String): String {
        val ext = path.substringAfterLast('.', "").lowercase(Locale.ROOT)
        return when (ext) {
            "html" -> "text/html"
            "js", "mjs" -> "text/javascript"
            "css" -> "text/css"
            "json", "gltf" -> "application/json"
            "wasm" -> "application/wasm"
            "glb" -> "model/gltf-binary"
            "svg" -> "image/svg+xml"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "webp" -> "image/webp"
            "avif" -> "image/avif"
            "ico" -> "image/x-icon"
            "woff2" -> "font/woff2"
            "woff" -> "font/woff"
            "ttf" -> "font/ttf"
            "ogg" -> "audio/ogg"
            "mp3" -> "audio/mpeg"
            "wav" -> "audio/wav"
            "md", "txt" -> "text/plain"
            else -> "application/octet-stream"
        }
    }

    fun charsetFor(mimeType: String): String? =
        if (mimeType.startsWith("text/") || mimeType == "application/json" || mimeType == "image/svg+xml") {
            "utf-8"
        } else {
            null
        }
}

/** Serves bundled Windway game assets directly from APK assets with zero network sockets. */
class OfflineAssetHandler(private val assetManager: AssetManager) : WebViewAssetLoader.PathHandler {
    override fun handle(path: String): WebResourceResponse? {
        val clean = OfflineAssetPaths.sanitizeRelativePath(path) ?: return null
        return try {
            val stream = assetManager.open("game/$clean")
            val mime = OfflineAssetPaths.mimeTypeFor(clean)
            val headers = mapOf(
                "X-Content-Type-Options" to "nosniff",
                "Cross-Origin-Resource-Policy" to "same-origin",
                "Cache-Control" to if (clean == "index.html") "no-store" else "private, max-age=3600",
            )
            WebResourceResponse(
                mime,
                OfflineAssetPaths.charsetFor(mime),
                200,
                "OK",
                headers,
                stream,
            )
        } catch (_: IOException) {
            null
        }
    }
}
