package com.aureliaapp.nativemodules

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Base64
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream

class ScreenCaptureModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  companion object {
    private const val REQUEST_CODE_SCREEN_CAPTURE = 9981
  }

  private var mediaProjectionManager: MediaProjectionManager? = null
  private var mediaProjection: MediaProjection? = null
  private var virtualDisplay: VirtualDisplay? = null
  private var imageReader: ImageReader? = null
  private var startPromise: Promise? = null
  private var handlerThread: HandlerThread? = null
  private var handler: Handler? = null
  private var lastFrameTime: Long = 0L

  init {
    reactContext.addActivityEventListener(this)
    mediaProjectionManager = reactContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
  }

  override fun getName(): String = "ScreenCaptureModule"

  @ReactMethod
  fun isSupported(promise: Promise) {
    promise.resolve(true)
  }

  @ReactMethod
  fun startCapture(promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Current activity is null")
      return
    }
    if (mediaProjection != null) {
      promise.resolve(true)
      return
    }
    startPromise = promise
    try {
      val intent = mediaProjectionManager?.createScreenCaptureIntent()
      if (intent != null) {
        activity.startActivityForResult(intent, REQUEST_CODE_SCREEN_CAPTURE)
      } else {
        promise.reject("INTENT_FAILED", "Failed to create screen capture intent")
      }
    } catch (e: Exception) {
      promise.reject("INTENT_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun stopCapture(promise: Promise) {
    try {
      stopCaptureInternal()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("STOP_FAILED", e.message, e)
    }
  }

  private fun stopCaptureInternal() {
    virtualDisplay?.release()
    virtualDisplay = null
    imageReader?.close()
    imageReader = null
    mediaProjection?.stop()
    mediaProjection = null
    handlerThread?.quitSafely()
    handlerThread = null
    handler = null

    // Notify Foreground service to lower its FGS type back to connectedDevice
    ForegroundSchedulerService.stopProjecting(reactContext)
    sendEvent("onScreenCaptureStopped", Arguments.createMap())
  }

  private fun startScreenCaptureInternal(resultCode: Int, data: Intent) {
    try {
      // Elevate service type to connectedDevice | mediaProjection
      ForegroundSchedulerService.startProjecting(reactContext)

      val mp = mediaProjectionManager?.getMediaProjection(resultCode, data)
      if (mp == null) {
        sendError("PROJECTION_NULL", "MediaProjection was null")
        return
      }
      mediaProjection = mp

      val metrics = reactContext.resources.displayMetrics
      // Limit resolution to balance network load (VLM-friendly 360x640)
      val width = 360
      val height = 640
      val dpi = metrics.densityDpi

      // Initialize background thread for processing frames
      val thread = HandlerThread("AureliaScreenCaptureThread")
      thread.start()
      handlerThread = thread
      val h = Handler(thread.looper)
      handler = h

      val reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
      imageReader = reader

      val flag = DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_PRESENT
      virtualDisplay = mp.createVirtualDisplay(
        "AureliaScreenCapture",
        width,
        height,
        dpi,
        flag,
        reader.surface,
        null,
        h
      )

      reader.setOnImageAvailableListener({ ir ->
        val image = ir.acquireLatestImage()
        if (image != null) {
          try {
            val now = System.currentTimeMillis()
            // Throttle to maximum 1 frame per second to conserve data & backend rate limits
            if (now - lastFrameTime >= 1000) {
              lastFrameTime = now
              val planes = image.planes
              val buffer = planes[0].buffer
              val pixelStride = planes[0].pixelStride
              val rowStride = planes[0].rowStride
              val rowPadding = rowStride - pixelStride * width

              // Allocate bitmap and copy raw pixel data
              val bitmap = Bitmap.createBitmap(
                width + rowPadding / pixelStride,
                height,
                Bitmap.Config.ARGB_8888
              )
              bitmap.copyPixelsFromBuffer(buffer)

              // Crop row stride padding
              val cropped = Bitmap.createBitmap(bitmap, 0, 0, width, height)
              val out = ByteArrayOutputStream()
              cropped.compress(Bitmap.CompressFormat.JPEG, 60, out)
              val bytes = out.toByteArray()
              val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)

              bitmap.recycle()
              cropped.recycle()

              val map = Arguments.createMap()
              map.putString("frame", base64)
              map.putDouble("timestamp", now.toDouble())
              sendEvent("screenFrame", map)
            }
          } catch (e: Exception) {
            // Silently catch frame processing failures to keep loop alive
          } finally {
            image.close()
          }
        }
      }, h)

      sendEvent("onScreenCaptureStarted", Arguments.createMap())
    } catch (e: Exception) {
      stopCaptureInternal()
      sendError("START_ERROR", e.message ?: "Unknown start error")
    }
  }

  private fun sendEvent(event: String, params: com.facebook.react.bridge.WritableMap) {
    if (!reactContext.hasActiveReactInstance()) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(event, params)
  }

  private fun sendError(code: String, message: String) {
    val map = Arguments.createMap()
    map.putString("code", code)
    map.putString("message", message)
    sendEvent("onScreenCaptureError", map)
  }

  // ActivityEventListener
  override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode == REQUEST_CODE_SCREEN_CAPTURE) {
      val promise = startPromise
      startPromise = null
      if (resultCode == Activity.RESULT_OK && data != null) {
        startScreenCaptureInternal(resultCode, data)
        promise?.resolve(true)
      } else {
        promise?.reject("PERMISSION_DENIED", "MediaProjection permission denied by user")
      }
    }
  }

  override fun onNewIntent(intent: Intent?) {
    // no-op
  }
}
