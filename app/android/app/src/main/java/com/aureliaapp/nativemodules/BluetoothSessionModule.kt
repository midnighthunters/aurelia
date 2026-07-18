package com.aureliaapp.nativemodules

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothHeadset
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Detects Bluetooth headset/earbud connect and disconnect via ACL + SCO + profile callbacks.
 * Emits JS events: bluetoothHeadsetConnected / bluetoothHeadsetDisconnected / bluetoothScoState
 *
 * Android-only for this pass. // future iOS: AVAudioSession route change notifications
 */
class BluetoothSessionModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var listening = false
  private var headsetProxy: BluetoothHeadset? = null

  private val profileListener = object : BluetoothProfile.ServiceListener {
    override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
      if (profile == BluetoothProfile.HEADSET) {
        headsetProxy = proxy as BluetoothHeadset
        emitConnectionState(isHeadsetConnected())
      }
    }

    override fun onServiceDisconnected(profile: Int) {
      if (profile == BluetoothProfile.HEADSET) {
        headsetProxy = null
        emitConnectionState(false)
      }
    }
  }

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      when (intent?.action) {
        BluetoothDevice.ACTION_ACL_CONNECTED -> {
          val device = intent.getParcelableExtraCompat<BluetoothDevice>(BluetoothDevice.EXTRA_DEVICE)
          if (device != null && isAudioDevice(device)) {
            emitConnected(deviceName(device))
          } else {
            // Re-check aggregate headset state (some devices connect before class is known)
            if (isHeadsetConnected()) {
              emitConnected(deviceName(device))
            }
          }
        }
        BluetoothDevice.ACTION_ACL_DISCONNECTED -> {
          // If no headsets remain, emit disconnected
          if (!isHeadsetConnected()) {
            emitDisconnected(deviceName(intent.getParcelableExtraCompat(BluetoothDevice.EXTRA_DEVICE)))
          }
        }
        BluetoothAdapter.ACTION_CONNECTION_STATE_CHANGED -> {
          val state = intent.getIntExtra(BluetoothAdapter.EXTRA_CONNECTION_STATE, -1)
          if (state == BluetoothAdapter.STATE_CONNECTED && isHeadsetConnected()) {
            emitConnected(null)
          } else if (state == BluetoothAdapter.STATE_DISCONNECTED && !isHeadsetConnected()) {
            emitDisconnected(null)
          }
        }
        AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED -> {
          val state = intent.getIntExtra(AudioManager.EXTRA_SCO_AUDIO_STATE, -1)
          val map = Arguments.createMap()
          map.putInt("state", state)
          map.putString(
            "label",
            when (state) {
              AudioManager.SCO_AUDIO_STATE_CONNECTED -> "connected"
              AudioManager.SCO_AUDIO_STATE_DISCONNECTED -> "disconnected"
              AudioManager.SCO_AUDIO_STATE_CONNECTING -> "connecting"
              else -> "unknown"
            }
          )
          sendEvent("bluetoothScoState", map)
        }
        Intent.ACTION_HEADSET_PLUG -> {
          // Wired; ignore for earbud flow but useful for debugging
        }
      }
    }
  }

  override fun getName(): String = "BluetoothSessionModule"

  @ReactMethod
  fun startListening(promise: Promise) {
    try {
      if (!listening) {
        val filter = IntentFilter().apply {
          addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
          addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
          addAction(BluetoothAdapter.ACTION_CONNECTION_STATE_CHANGED)
          addAction(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          reactContext.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
          @Suppress("UnspecifiedRegisterReceiverFlag")
          reactContext.registerReceiver(receiver, filter)
        }
        val adapter = BluetoothAdapter.getDefaultAdapter()
        adapter?.getProfileProxy(reactContext, profileListener, BluetoothProfile.HEADSET)
        listening = true
      }
      // Emit current state immediately so UI can hydrate
      emitConnectionState(isHeadsetConnected())
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("BT_START_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun stopListening(promise: Promise) {
    try {
      if (listening) {
        try {
          reactContext.unregisterReceiver(receiver)
        } catch (_: Exception) {
        }
        val adapter = BluetoothAdapter.getDefaultAdapter()
        headsetProxy?.let { adapter?.closeProfileProxy(BluetoothProfile.HEADSET, it) }
        headsetProxy = null
        listening = false
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("BT_STOP_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun isConnected(promise: Promise) {
    try {
      promise.resolve(isHeadsetConnected())
    } catch (e: Exception) {
      promise.reject("BT_STATUS_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun getConnectedDeviceName(promise: Promise) {
    try {
      promise.resolve(currentDeviceName())
    } catch (e: Exception) {
      promise.reject("BT_NAME_FAILED", e.message, e)
    }
  }

  /** Required for RN event emitters to avoid warnings. */
  @ReactMethod
  fun addListener(eventName: String) {
    // no-op
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // no-op
  }

  private fun isHeadsetConnected(): Boolean {
    // Prefer BluetoothHeadset profile connected devices
    val proxyDevices = headsetProxy?.connectedDevices
    if (!proxyDevices.isNullOrEmpty()) {
      return true
    }

    // Fallback: AudioManager communication devices (API 31+) / getDevices
    val am = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      val devices = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
      for (d in devices) {
        if (d.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
          d.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
          d.type == AudioDeviceInfo.TYPE_BLE_HEADSET
        ) {
          return true
        }
      }
    }

    @Suppress("DEPRECATION")
    if (am.isBluetoothScoOn || am.isBluetoothA2dpOn) {
      return true
    }
    return false
  }

  private fun currentDeviceName(): String? {
    val devices = headsetProxy?.connectedDevices
    if (!devices.isNullOrEmpty()) {
      return deviceName(devices[0])
    }
    return null
  }

  private fun isAudioDevice(device: BluetoothDevice): Boolean {
    // Major device class: AUDIO_VIDEO (0x0400)
    val major = device.bluetoothClass?.majorDeviceClass ?: return true
    return major == 0x0400 || major == 0x0000
  }

  private fun deviceName(device: BluetoothDevice?): String? {
    if (device == null) return null
    return try {
      device.name ?: device.address
    } catch (_: SecurityException) {
      device.address
    }
  }

  private fun emitConnectionState(connected: Boolean) {
    if (connected) emitConnected(currentDeviceName()) else emitDisconnected(null)
  }

  private fun emitConnected(name: String?) {
    val map = Arguments.createMap()
    map.putBoolean("connected", true)
    map.putString("deviceName", name)
    map.putDouble("timestamp", System.currentTimeMillis().toDouble())
    sendEvent("bluetoothHeadsetConnected", map)
  }

  private fun emitDisconnected(name: String?) {
    val map = Arguments.createMap()
    map.putBoolean("connected", false)
    map.putString("deviceName", name)
    map.putDouble("timestamp", System.currentTimeMillis().toDouble())
    sendEvent("bluetoothHeadsetDisconnected", map)
  }

  private fun sendEvent(event: String, params: com.facebook.react.bridge.WritableMap) {
    if (!reactContext.hasActiveReactInstance()) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(event, params)
  }

  private inline fun <reified T : android.os.Parcelable> Intent.getParcelableExtraCompat(key: String): T? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      getParcelableExtra(key, T::class.java)
    } else {
      @Suppress("DEPRECATION")
      getParcelableExtra(key) as? T
    }
  }
}
