package com.aureliaapp.nativemodules

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Phase 2 placeholder for Picovoice Porcupine (or openWakeWord-style gating).
 * MVP uses tap-to-talk only — this module exists so the JS layer can call a stable API
 * without being rewritten when wake word ships.
 *
 * Do not integrate Porcupine SDK until Phase 2 is explicitly green-lit.
 */
class WakeWordModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "WakeWordModule"

  @ReactMethod
  fun isSupported(promise: Promise) {
    // Phase 2: return true once Porcupine native lib is linked
    promise.resolve(false)
  }

  @ReactMethod
  fun start(keyword: String, promise: Promise) {
    promise.reject(
      "WAKE_WORD_NOT_IMPLEMENTED",
      "Wake word is Phase 2. Use tap-to-talk for MVP. keyword=$keyword"
    )
  }

  @ReactMethod
  fun stop(promise: Promise) {
    promise.resolve(true)
  }

  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}
}
