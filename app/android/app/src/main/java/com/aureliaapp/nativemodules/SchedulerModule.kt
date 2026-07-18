package com.aureliaapp.nativemodules

import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * JS bridge for ForegroundSchedulerService.
 */
class SchedulerModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "SchedulerModule"

  @ReactMethod
  fun start(intervalMs: Double, phase0: Boolean, promise: Promise) {
    try {
      ForegroundSchedulerService.start(
        reactContext,
        intervalMs.toLong().coerceAtLeast(60_000L),
        phase0
      )
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SCHEDULER_START_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      ForegroundSchedulerService.stop(reactContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SCHEDULER_STOP_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun setIntervalMs(intervalMs: Double, promise: Promise) {
    try {
      val intent = Intent(reactContext, ForegroundSchedulerService::class.java).apply {
        action = ForegroundSchedulerService.ACTION_SET_INTERVAL
        putExtra(ForegroundSchedulerService.EXTRA_INTERVAL_MS, intervalMs.toLong())
      }
      reactContext.startService(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SCHEDULER_INTERVAL_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun setQuietMode(quiet: Boolean, promise: Promise) {
    try {
      val intent = Intent(reactContext, ForegroundSchedulerService::class.java).apply {
        action = ForegroundSchedulerService.ACTION_SET_QUIET
        putExtra(ForegroundSchedulerService.EXTRA_QUIET, quiet)
      }
      reactContext.startService(intent)
      // Persist even if service not running yet
      reactContext
        .getSharedPreferences(ForegroundSchedulerService.PREFS, 0)
        .edit()
        .putBoolean(ForegroundSchedulerService.KEY_QUIET, quiet)
        .apply()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SCHEDULER_QUIET_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun isRunning(promise: Promise) {
    promise.resolve(ForegroundSchedulerService.isRunning)
  }

  @ReactMethod
  fun getPhase0BatteryLog(promise: Promise) {
    try {
      val file = reactContext.getFileStreamPath("phase0_battery.log")
      if (!file.exists()) {
        promise.resolve("")
        return
      }
      promise.resolve(file.readText())
    } catch (e: Exception) {
      promise.reject("PHASE0_LOG_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // no-op for RN event emitter
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // no-op
  }
}
