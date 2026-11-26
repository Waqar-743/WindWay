package com.waqar.windway

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.Surface
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import java.util.Locale

/**
 * Pure Native Kotlin Android host for Windway.
 * Serves the entire 3D driving app offline via AndroidX WebViewAssetLoader with zero network permissions.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var errorOverlay: LinearLayout
    private lateinit var tiltDriver: TiltSensorDriver
    private lateinit var assetLoader: WebViewAssetLoader

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)

        configureImmersiveDisplay()

        assetLoader = WebViewAssetLoader.Builder()
            .setDomain(APP_ASSET_DOMAIN)
            .addPathHandler("/assets/game/", OfflineAssetHandler(assets))
            .build()

        tiltDriver = TiltSensorDriver(
            context = this,
            rotationProvider = { currentDisplayRotation() },
            onSteer = { value ->
                val formatted = String.format(Locale.US, "%.4f", value)
                runOnUiThread {
                    if (::webView.isInitialized) {
                        webView.evaluateJavascript("window.onWindwayTilt && window.onWindwayTilt($formatted);", null)
                    }
                }
            },
        )

        val root = FrameLayout(this).apply {
            setBackgroundColor(COLOR_OBSIDIAN)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }

        webView = buildWebView()
        errorOverlay = buildErrorOverlay()

        root.addView(webView)
        root.addView(errorOverlay)
        setContentView(root)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("window.onWindwayBack && window.onWindwayBack();", null)
            }
        })

        loadOfflineApp()
    }

    private fun configureImmersiveDisplay() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        applyImmersiveInsets()
    }

    private fun applyImmersiveInsets() {
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildWebView(): WebView {
        val bridge = WindwayAndroidBridge(
            context = this,
            tiltDriver = tiltDriver,
            onKeepScreenOn = { enabled ->
                runOnUiThread {
                    if (enabled) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
            },
            onExitRequested = {
                runOnUiThread { finish() }
            },
        )

        return WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(COLOR_OBSIDIAN)
            overScrollMode = View.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                allowFileAccess = false
                allowContentAccess = false
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                cacheMode = WebSettings.LOAD_DEFAULT
            }

            addJavascriptInterface(bridge, "WindwayAndroidHost")

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest,
                ): Boolean {
                    val uri = request.url
                    if (isTrustedAppUri(uri)) return false
                    if (isAllowedExternalCreditUri(uri)) {
                        runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                    }
                    return true
                }

                override fun onPageFinished(view: WebView, url: String?) {
                    super.onPageFinished(view, url)
                    applyImmersiveInsets()
                }

                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError,
                ) {
                    if (request.isForMainFrame) {
                        runOnUiThread { errorOverlay.visibility = View.VISIBLE }
                    }
                }
            }
        }
    }

    private fun buildErrorOverlay(): LinearLayout {
        val pad = dp(28)
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(COLOR_OBSIDIAN)
            setPadding(pad, pad, pad, pad)
            visibility = View.GONE
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )

            addView(TextView(this@MainActivity).apply {
                text = getString(R.string.offline_error_title)
                setTextColor(COLOR_IVORY)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
                gravity = Gravity.CENTER
            })

            addView(TextView(this@MainActivity).apply {
                text = getString(R.string.offline_error_message)
                setTextColor(COLOR_MUTED)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
                gravity = Gravity.CENTER
                setPadding(0, dp(10), 0, dp(20))
            })

            addView(Button(this@MainActivity).apply {
                text = getString(R.string.offline_error_retry)
                setBackgroundColor(COLOR_AMBER)
                setTextColor(COLOR_OBSIDIAN)
                setPadding(dp(24), dp(12), dp(24), dp(12))
                setOnClickListener { loadOfflineApp() }
            })
        }
    }

    private fun loadOfflineApp() {
        errorOverlay.visibility = View.GONE
        webView.loadUrl(APP_ENTRY_URL)
    }

    private fun isTrustedAppUri(uri: Uri): Boolean =
        uri.scheme == "https" &&
            uri.host == APP_ASSET_DOMAIN &&
            (uri.path?.startsWith("/assets/game/") == true)

    private fun isAllowedExternalCreditUri(uri: Uri): Boolean {
        if (uri.scheme != "https") return false
        val host = uri.host?.lowercase(Locale.ROOT) ?: return false
        return host == "github.com" ||
            host == "creativecommons.org" ||
            host == "sketchfab.com"
    }

    @Suppress("DEPRECATION")
    private fun currentDisplayRotation(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            display?.rotation ?: Surface.ROTATION_90
        } else {
            windowManager.defaultDisplay.rotation
        }

    private fun dp(value: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) applyImmersiveInsets()
    }

    override fun onPause() {
        tiltDriver.stop()
        if (::webView.isInitialized) {
            webView.evaluateJavascript("window.onWindwayLifecycle && window.onWindwayLifecycle('pause');", null)
            webView.onPause()
        }
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        applyImmersiveInsets()
        if (::webView.isInitialized) {
            webView.onResume()
        }
    }

    override fun onDestroy() {
        tiltDriver.stop()
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (::webView.isInitialized) {
            webView.destroy()
        }
        super.onDestroy()
    }

    companion object {
        private const val APP_ASSET_DOMAIN = "appassets.androidplatform.net"
        private const val APP_ENTRY_URL = "https://$APP_ASSET_DOMAIN/assets/game/index.html?android=1"

        private val COLOR_OBSIDIAN = Color.parseColor("#0B0A09")
        private val COLOR_IVORY = Color.parseColor("#F5EFE6")
        private val COLOR_MUTED = Color.parseColor("#B0A699")
        private val COLOR_AMBER = Color.parseColor("#F2A93B")
    }
}
