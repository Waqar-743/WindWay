package com.waqar.windway

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.view.Surface
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.max

/** Streams only local tilt values. No permission, telemetry or background service. */
class MainActivity : FlutterActivity(), SensorEventListener {
    private lateinit var sensors: SensorManager
    private var sink: EventChannel.EventSink? = null
    private var lastSample = 0L

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        sensors = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        EventChannel(flutterEngine.dartExecutor.binaryMessenger, "windway/tilt")
            .setStreamHandler(object : EventChannel.StreamHandler {
                override fun onListen(arguments: Any?, events: EventChannel.EventSink) {
                    sink = events
                    lastSample = 0L
                    val sensor = sensors.getDefaultSensor(Sensor.TYPE_GRAVITY)
                        ?: sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
                    if (sensor == null || !sensors.registerListener(this@MainActivity, sensor, SensorManager.SENSOR_DELAY_GAME)) {
                        events.error("NO_SENSOR", "This device has no usable tilt sensor. Choose arrows or the steering wheel.", null)
                        sink = null
                    }
                }
                override fun onCancel(arguments: Any?) { sensors.unregisterListener(this@MainActivity); sink = null }
            })
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "windway/platform")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "keepAwake" -> {
                        if (call.arguments == true) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    @Suppress("DEPRECATION")
    override fun onSensorChanged(event: SensorEvent) {
        if (sink == null || event.timestamp - lastSample < 33_333_333L) return
        lastSample = event.timestamp
        val opposite = windowManager.defaultDisplay.rotation == Surface.ROTATION_270
        val direction = if (opposite) 1.0 else -1.0
        val angle = direction * atan2(event.values[1].toDouble(), max(0.5, abs(event.values[2].toDouble())))
        if (angle.isFinite()) sink?.success(angle)
    }
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
    override fun onStop() { sensors.unregisterListener(this); super.onStop() }
    override fun onDestroy() { sensors.unregisterListener(this); sink = null; super.onDestroy() }
}
