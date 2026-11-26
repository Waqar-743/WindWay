package com.waqar.windway

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.webkit.JavascriptInterface
import org.json.JSONObject

/** Native Kotlin bridge exposed to the offline Windway WebView as window.WindwayAndroidHost. */
class WindwayAndroidBridge(
    private val context: Context,
    private val tiltDriver: TiltSensorDriver,
    private val onKeepScreenOn: (Boolean) -> Unit,
    private val onExitRequested: () -> Unit,
) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    @JavascriptInterface
    fun loadState(): String? = prefs.getString(STATE_KEY, null)

    @JavascriptInterface
    fun saveState(json: String?): Boolean {
        if (json == null || json.length > MAX_STATE_BYTES) return false
        return try {
            prefs.edit().putString(STATE_KEY, json).apply()
            true
        } catch (_: Throwable) {
            false
        }
    }

    @JavascriptInterface
    fun setTiltActive(active: Boolean, sensitivity: Double, inverted: Boolean) {
        if (active) tiltDriver.start(sensitivity, inverted)
        else tiltDriver.stop()
    }

    @JavascriptInterface
    fun calibrateTilt() {
        tiltDriver.calibrate()
    }

    @JavascriptInterface
    fun haptic(kind: String?) {
        val (durationMs, amplitude) = when (kind) {
            "tap" -> 12L to 75
            "gate" -> 22L to 125
            "boost" -> 38L to 180
            "impact" -> 50L to 210
            "finish" -> 65L to 220
            else -> return
        }
        vibrate(durationMs, amplitude)
    }

    @JavascriptInterface
    fun setKeepScreenOn(enabled: Boolean) {
        onKeepScreenOn(enabled)
    }

    @JavascriptInterface
    fun getDeviceInfo(): String {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memInfo = ActivityManager.MemoryInfo()
        am.getMemoryInfo(memInfo)
        val totalMemoryMb = (memInfo.totalMem / (1024L * 1024L)).toInt()
        val payload = JSONObject().apply {
            put("totalMemoryMb", totalMemoryMb)
            put("cpuCores", Runtime.getRuntime().availableProcessors())
            put("apiLevel", Build.VERSION.SDK_INT)
            put("hasTiltSensor", tiltDriver.hasTiltSensor)
            put("appVersion", APP_VERSION)
        }
        return payload.toString()
    }

    @JavascriptInterface
    fun exitApp() {
        onExitRequested()
    }

    @Suppress("DEPRECATION")
    private fun vibrate(durationMs: Long, amplitude: Int) {
        try {
            val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                manager?.defaultVibrator
            } else {
                context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
            if (vibrator == null || !vibrator.hasVibrator()) return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(durationMs, amplitude))
            } else {
                vibrator.vibrate(durationMs)
            }
        } catch (_: Throwable) {
            // Haptics remain optional on devices without a vibrator motor.
        }
    }

    companion object {
        private const val PREFS_NAME = "windway_android_state_v2"
        private const val STATE_KEY = "app_state_json"
        private const val MAX_STATE_BYTES = 65_536
        private const val APP_VERSION = "2.0.0"
    }
}
