package com.waqar.windway

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.view.Surface
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.max

/** Pure, testable tilt steering filter. The first comfortable holding pose sets neutral. */
class TiltFilter {
    var neutral: Double? = null
        private set
    var value: Double = 0.0
        private set

    fun calibrate() {
        neutral = null
        value = 0.0
    }

    fun sample(radians: Double, sensitivity: Double, inverted: Boolean): Double {
        if (!radians.isFinite() || !sensitivity.isFinite()) return value
        val safeSensitivity = sensitivity.coerceIn(0.5, 1.5)
        val baseline = neutral ?: radians.also { neutral = it }
        var delta = radians - baseline
        val deadzone = 0.035
        delta = when {
            abs(delta) <= deadzone -> 0.0
            delta < 0.0 -> delta + deadzone
            else -> delta - deadzone
        }
        val sign = if (inverted) -1.0 else 1.0
        val target = (delta / 0.48 * safeSensitivity * sign).coerceIn(-1.0, 1.0)
        value += (target - value) * 0.28
        if (abs(value) < 0.015) value = 0.0
        return value
    }
}

/** Streams local landscape tilt steering samples without network or telemetry. */
class TiltSensorDriver(
    context: Context,
    private val rotationProvider: () -> Int,
    private val onSteer: (Double) -> Unit,
) : SensorEventListener {
    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val filter = TiltFilter()
    private var active = false
    private var sensitivity = 1.0
    private var inverted = false
    private var lastTimestampNs = 0L
    private var lastSent = 0.0

    val hasTiltSensor: Boolean
        get() = pickSensor() != null

    private fun pickSensor(): Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_GRAVITY)
            ?: sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

    fun start(sensitivity: Double, inverted: Boolean) {
        this.sensitivity = sensitivity.coerceIn(0.5, 1.5)
        this.inverted = inverted
        if (active) return
        val sensor = pickSensor() ?: return
        filter.calibrate()
        lastTimestampNs = 0L
        lastSent = 0.0
        active = sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME)
    }

    fun calibrate() {
        filter.calibrate()
        lastSent = 0.0
        onSteer(0.0)
    }

    fun stop() {
        if (!active) return
        active = false
        sensorManager.unregisterListener(this)
        filter.calibrate()
        lastSent = 0.0
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (!active || event.timestamp - lastTimestampNs < 33_333_333L) return
        lastTimestampNs = event.timestamp
        val opposite = rotationProvider() == Surface.ROTATION_270
        val direction = if (opposite) 1.0 else -1.0
        val angle = direction * atan2(event.values[1].toDouble(), max(0.5, abs(event.values[2].toDouble())))
        if (!angle.isFinite()) return
        val next = filter.sample(angle, sensitivity, inverted)
        if (abs(next - lastSent) < 0.015 && (next != 0.0 || lastSent == 0.0)) return
        lastSent = next
        onSteer(next)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
