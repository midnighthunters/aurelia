package com.aureliaapp.nativemodules

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class OverlayModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    private var instance: OverlayModule? = null

    fun notifyStopPressed() {
      instance?.sendEvent("onStopPressed", Arguments.createMap())
    }
  }

  init {
    instance = this
  }

  override fun getName(): String = "OverlayModule"

  private fun sendEvent(eventName: String, params: Any?) {
    if (reactContext.hasActiveCatalystInstance()) {
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(eventName, params)
    }
  }

  @ReactMethod
  fun canDrawOverlays(promise: Promise) {
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
      promise.resolve(Settings.canDrawOverlays(reactContext))
    } else {
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun requestOverlayPermission(promise: Promise) {
    try {
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
        if (!Settings.canDrawOverlays(reactContext)) {
          val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${reactContext.packageName}")
          ).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          reactContext.startActivity(intent)
          promise.resolve(false)
        } else {
          promise.resolve(true)
        }
      } else {
        promise.resolve(true)
      }
    } catch (e: Exception) {
      promise.reject("OVERLAY_PERMISSION_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun startOverlayService(promise: Promise) {
    try {
      val intent = Intent(reactContext, OverlayService::class.java)
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent)
      } else {
        reactContext.startService(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("OVERLAY_START_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun updateOverlayStatus(statusText: String, promise: Promise) {
    val service = OverlayService.instance
    if (service != null) {
      service.updateStatusText(statusText)
      promise.resolve(true)
    } else {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun stopOverlayService(promise: Promise) {
    try {
      val intent = Intent(reactContext, OverlayService::class.java)
      reactContext.stopService(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("OVERLAY_STOP_ERROR", e.message, e)
    }
  }
}
