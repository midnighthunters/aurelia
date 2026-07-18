package com.aureliaapp.nativemodules

import android.app.NotificationManager
import android.bluetooth.BluetoothAdapter
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.net.wifi.WifiManager
import android.provider.AlarmClock
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DeviceControlModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "DeviceControlModule"

  @ReactMethod
  fun setVolume(streamType: String, percent: Float, promise: Promise) {
    try {
      val am = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val stream = when (streamType.lowercase()) {
        "music" -> AudioManager.STREAM_MUSIC
        "ring" -> AudioManager.STREAM_RING
        "notification" -> AudioManager.STREAM_NOTIFICATION
        "system" -> AudioManager.STREAM_SYSTEM
        else -> AudioManager.STREAM_MUSIC
      }
      val max = am.getStreamMaxVolume(stream)
      val target = (max * percent).toInt().coerceIn(0, max)
      am.setStreamVolume(stream, target, AudioManager.FLAG_SHOW_UI)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("VOLUME_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun setBrightness(percent: Float, promise: Promise) {
    try {
      if (Settings.System.canWrite(reactContext)) {
        val target = (255 * percent).toInt().coerceIn(0, 255)
        Settings.System.putInt(
          reactContext.contentResolver,
          Settings.System.SCREEN_BRIGHTNESS,
          target
        )
        promise.resolve(true)
      } else {
        // Redirect to System Settings permission overlay
        val intent = Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactContext.startActivity(intent)
        promise.reject("WRITE_SETTINGS_PERMISSION", "Write settings permission is required. Opened settings screen.")
      }
    } catch (e: Exception) {
      promise.reject("BRIGHTNESS_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun setDndMode(enabled: Boolean, promise: Promise) {
    try {
      val nm = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.isNotificationPolicyAccessGranted) {
        val filter = if (enabled) {
          NotificationManager.INTERRUPTION_FILTER_NONE
        } else {
          NotificationManager.INTERRUPTION_FILTER_ALL
        }
        nm.setInterruptionFilter(filter)
        promise.resolve(true)
      } else {
        val intent = Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactContext.startActivity(intent)
        promise.reject("DND_PERMISSION", "Notification Policy Access permission required. Opened settings screen.")
      }
    } catch (e: Exception) {
      promise.reject("DND_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun toggleRadio(radioType: String, enabled: Boolean, promise: Promise) {
    try {
      when (radioType.lowercase()) {
        "wifi" -> {
          val wm = reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
          @Suppress("DEPRECATION")
          if (wm.setWifiEnabled(enabled)) {
            promise.resolve(true)
          } else {
            // Open wifi settings panel if programmatic toggle is blocked on Android 10+
            val intent = Intent(Settings.ACTION_WIFI_SETTINGS).apply {
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(false)
          }
        }
        "bluetooth" -> {
          val adapter = BluetoothAdapter.getDefaultAdapter()
          if (adapter == null) {
            promise.reject("NO_BLUETOOTH", "Device does not support Bluetooth")
            return
          }
          @Suppress("DEPRECATION")
          val success = if (enabled) adapter.enable() else adapter.disable()
          if (success) {
            promise.resolve(true)
          } else {
            val intent = Intent(Settings.ACTION_BLUETOOTH_SETTINGS).apply {
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(false)
          }
        }
        else -> promise.reject("INVALID_RADIO", "Unsupported radio type: $radioType")
      }
    } catch (e: Exception) {
      promise.reject("RADIO_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun launchApp(appName: String, promise: Promise) {
    try {
      val pm = reactContext.packageManager
      val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
      var launched = false
      for (app in apps) {
        val label = pm.getApplicationLabel(app).toString().lowercase()
        if (label == appName.lowercase() || label.contains(appName.lowercase())) {
          val intent = pm.getLaunchIntentForPackage(app.packageName)
          if (intent != null) {
            reactContext.startActivity(intent.apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) })
            launched = true
            promise.resolve(app.packageName)
            break
          }
        }
      }
      if (!launched) {
        promise.reject("APP_NOT_FOUND", "Could not find any installed app named: $appName")
      }
    } catch (e: Exception) {
      promise.reject("LAUNCH_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun setAlarm(hour: Int, minute: Int, message: String, promise: Promise) {
    try {
      val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
        putExtra(AlarmClock.EXTRA_HOUR, hour)
        putExtra(AlarmClock.EXTRA_MINUTES, minute)
        putExtra(AlarmClock.EXTRA_MESSAGE, message)
        putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ALARM_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun setTimer(seconds: Int, message: String, promise: Promise) {
    try {
      val intent = Intent(AlarmClock.ACTION_SET_TIMER).apply {
        putExtra(AlarmClock.EXTRA_LENGTH, seconds)
        putExtra(AlarmClock.EXTRA_MESSAGE, message)
        putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("TIMER_ERROR", e.message, e)
    }
  }
}
