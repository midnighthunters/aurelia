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

  @ReactMethod
  fun placeCall(number: String, promise: Promise) {
    try {
      val intent = Intent(Intent.ACTION_CALL, android.net.Uri.parse("tel:$number")).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("CALL_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun openDialerPrefilled(number: String, promise: Promise) {
    try {
      val intent = Intent(Intent.ACTION_DIAL, android.net.Uri.parse("tel:$number")).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("DIALER_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun queryContacts(nameQuery: String, promise: Promise) {
    try {
      val resolver = reactContext.contentResolver
      val cursor = resolver.query(
        android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        arrayOf(
          android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
          android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER
        ),
        "${android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?",
        arrayOf("%$nameQuery%"),
        null
      )
      val results = Arguments.createArray()
      cursor?.use { c ->
        val nameIdx = c.getColumnIndex(android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
        val numIdx = c.getColumnIndex(android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER)
        while (c.moveToNext()) {
          val item = Arguments.createMap()
          item.putString("name", if (nameIdx >= 0) c.getString(nameIdx) else "")
          item.putString("number", if (numIdx >= 0) c.getString(numIdx) else "")
          results.pushMap(item)
        }
      }
      promise.resolve(results)
    } catch (e: Exception) {
      promise.reject("CONTACTS_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun copyToClipboard(label: String, text: String, promise: Promise) {
    try {
      val cm = reactContext.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
      val clip = android.content.ClipData.newPlainText(label, text)
      cm.setPrimaryClip(clip)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("CLIPBOARD_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun getClipboardText(promise: Promise) {
    try {
      val cm = reactContext.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
      val clip = cm.primaryClip
      if (clip != null && clip.itemCount > 0) {
        val text = clip.getItemAt(0).text?.toString() ?: ""
        promise.resolve(text)
      } else {
        promise.resolve("")
      }
    } catch (e: Exception) {
      promise.reject("CLIPBOARD_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun openSystemSettings(settingType: String, promise: Promise) {
    try {
      val action = when (settingType.lowercase()) {
        "wifi" -> Settings.ACTION_WIFI_SETTINGS
        "bluetooth" -> Settings.ACTION_BLUETOOTH_SETTINGS
        "accessibility" -> Settings.ACTION_ACCESSIBILITY_SETTINGS
        "application_details" -> Settings.ACTION_APPLICATION_DETAILS_SETTINGS
        "display" -> Settings.ACTION_DISPLAY_SETTINGS
        "sound" -> Settings.ACTION_SOUND_SETTINGS
        else -> Settings.ACTION_SETTINGS
      }
      val intent = Intent(action).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (settingType.lowercase() == "application_details") {
          data = android.net.Uri.parse("package:${reactContext.packageName}")
        }
      }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SETTINGS_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun sendMediaKey(action: String, promise: Promise) {
    try {
      val keyCode = when (action.lowercase()) {
        "play_pause" -> android.view.KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
        "play" -> android.view.KeyEvent.KEYCODE_MEDIA_PLAY
        "pause" -> android.view.KeyEvent.KEYCODE_MEDIA_PAUSE
        "next" -> android.view.KeyEvent.KEYCODE_MEDIA_NEXT
        "previous" -> android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS
        else -> android.view.KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
      }
      val am = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      am.dispatchMediaKeyEvent(android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, keyCode))
      am.dispatchMediaKeyEvent(android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, keyCode))
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("MEDIA_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun requestUninstallApp(packageName: String, promise: Promise) {
    try {
      val intent = Intent(Intent.ACTION_UNINSTALL_PACKAGE).apply {
        data = android.net.Uri.parse("package:$packageName")
        putExtra(Intent.EXTRA_RETURN_RESULT, true)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("UNINSTALL_ERROR", e.message, e)
    }
  }
}
