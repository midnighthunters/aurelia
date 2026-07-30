package com.aureliaapp.nativemodules

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AccessibilityModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AccessibilityModule"

  private fun getService(): AccessibilityAutomationService? {
    return AccessibilityAutomationService.instance
  }

  @ReactMethod
  fun isServiceEnabled(promise: Promise) {
    promise.resolve(getService() != null)
  }

  @ReactMethod
  fun dumpLayoutJSON(promise: Promise) {
    val service = getService()
    if (service == null) {
      promise.reject("SERVICE_DISABLED", "Accessibility service is not enabled in device settings")
      return
    }
    try {
      val json = service.dumpScreenJSON()
      promise.resolve(json)
    } catch (e: Exception) {
      promise.reject("DUMP_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun click(viewId: String?, text: String?, promise: Promise) {
    val service = getService()
    if (service == null) {
      promise.reject("SERVICE_DISABLED", "Accessibility service disabled")
      return
    }
    val targetId = if (viewId.isNullOrEmpty()) null else viewId
    val targetText = if (text.isNullOrEmpty()) null else text
    val success = service.performNodeAction("click", targetId, targetText)
    promise.resolve(success)
  }

  @ReactMethod
  fun longClick(viewId: String?, text: String?, promise: Promise) {
    val service = getService()
    if (service == null) {
      promise.reject("SERVICE_DISABLED", "Accessibility service disabled")
      return
    }
    val targetId = if (viewId.isNullOrEmpty()) null else viewId
    val targetText = if (text.isNullOrEmpty()) null else text
    val success = service.performNodeAction("long_click", targetId, targetText)
    promise.resolve(success)
  }

  @ReactMethod
  fun typeText(viewId: String?, text: String?, value: String, promise: Promise) {
    val service = getService()
    if (service == null) {
      promise.reject("SERVICE_DISABLED", "Accessibility service disabled")
      return
    }
    val targetId = if (viewId.isNullOrEmpty()) null else viewId
    val targetText = if (text.isNullOrEmpty()) null else text
    val success = service.performTypeAction(targetId, targetText, value)
    promise.resolve(success)
  }

  @ReactMethod
  fun scroll(direction: String, promise: Promise) {
    val service = getService()
    if (service == null) {
      promise.reject("SERVICE_DISABLED", "Accessibility service disabled")
      return
    }
    val success = service.performScrollAction(direction)
    promise.resolve(success)
  }

  @ReactMethod
  fun tapCoordinate(x: Float, y: Float, promise: Promise) {
    val service = getService()
    if (service == null) {
      promise.reject("SERVICE_DISABLED", "Accessibility service disabled")
      return
    }
    val success = service.performTapCoordinate(x, y)
    promise.resolve(success)
  }

  @ReactMethod
  fun swipeCoordinate(x1: Float, y1: Float, x2: Float, y2: Float, durationMs: Double, promise: Promise) {
    val service = getService()
    if (service == null) {
      promise.reject("SERVICE_DISABLED", "Accessibility service disabled")
      return
    }
    val success = service.performSwipeCoordinate(x1, y1, x2, y2, durationMs.toLong())
    promise.resolve(success)
  }

  @ReactMethod
  fun navigate(action: String, promise: Promise) {
    val service = getService()
    if (service == null) {
      promise.reject("SERVICE_DISABLED", "Accessibility service disabled")
      return
    }
    val success = service.performNavigation(action)
    promise.resolve(success)
  }

  @ReactMethod
  fun hasSensitiveField(promise: Promise) {
    val service = getService()
    if (service == null) {
      promise.resolve(false)
      return
    }
    promise.resolve(service.hasPasswordOrSensitiveField())
  }

  @ReactMethod
  fun pasteText(viewId: String?, text: String?, promise: Promise) {
    val service = getService()
    if (service == null) {
      promise.reject("SERVICE_DISABLED", "Accessibility service disabled")
      return
    }
    val targetId = if (viewId.isNullOrEmpty()) null else viewId
    val targetText = if (text.isNullOrEmpty()) null else text
    val success = service.performPasteAction(targetId, targetText)
    promise.resolve(success)
  }
}
