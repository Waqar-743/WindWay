package com.waqar.windway

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TiltControllerTest {
    @Test
    fun firstSampleCapturesComfortableNeutralPose() {
        val filter = TiltFilter()
        assertEquals(0.0, filter.sample(0.65, 1.0, false), 1e-9)
        assertEquals(0.65, filter.neutral!!, 1e-9)
    }

    @Test
    fun deadZoneFiltersMicroMovements() {
        val filter = TiltFilter()
        filter.sample(0.0, 1.0, false)
        assertEquals(0.0, filter.sample(0.03, 1.0, false), 1e-9)
        assertEquals(0.0, filter.sample(-0.03, 1.0, false), 1e-9)
    }

    @Test
    fun steeringSmoothsAndRespectsInversionAndSensitivity() {
        val normal = TiltFilter().apply { sample(0.0, 1.0, false) }
        val inverted = TiltFilter().apply { sample(0.0, 1.0, true) }
        val calm = TiltFilter().apply { sample(0.0, 0.5, false) }

        val first = normal.sample(0.2, 1.0, false)
        val second = normal.sample(0.2, 1.0, false)
        assertTrue(first > 0.0 && second > first && second < 1.0)
        assertEquals(-first, inverted.sample(0.2, 1.0, true), 1e-6)
        assertEquals(first / 2.0, calm.sample(0.2, 0.5, false), 1e-6)
    }

    @Test
    fun extremeAnglesStayBoundedAndNonFiniteValuesAreIgnored() {
        val filter = TiltFilter().apply { sample(0.0, 1.0, false) }
        repeat(80) {
            val out = filter.sample(99.0, 1.5, false)
            assertTrue(out in -1.0..1.0)
        }
        val prev = filter.value
        assertEquals(prev, filter.sample(Double.NaN, 1.0, false), 1e-9)
        assertEquals(prev, filter.sample(Double.POSITIVE_INFINITY, 1.0, false), 1e-9)
    }

    @Test
    fun recalibrationResetsNeutralAndOutput() {
        val filter = TiltFilter().apply {
            sample(0.0, 1.0, false)
            sample(0.4, 1.0, false)
        }
        assertTrue(filter.value > 0.0)
        filter.calibrate()
        assertNull(filter.neutral)
        assertEquals(0.0, filter.value, 1e-9)
        assertEquals(0.0, filter.sample(-0.5, 1.0, false), 1e-9)
        assertEquals(-0.5, filter.neutral!!, 1e-9)
    }
}
