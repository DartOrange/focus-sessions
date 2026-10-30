package com.dartorange.sessionclock

import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SessionClockModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SessionClock")

    // elapsedRealtime includes deep sleep, unlike uptimeMillis / CLOCK_MONOTONIC.
    Function("elapsedRealtime") {
      SystemClock.elapsedRealtime().toDouble()
    }
  }
}
