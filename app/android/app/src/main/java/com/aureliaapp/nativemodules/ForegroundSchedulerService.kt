package com.aureliaapp.nativemodules

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import com.aureliaapp.MainActivity
import com.aureliaapp.R
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.ReactApplication

/**
 * Persistent foreground service that owns the check-in timer while backgrounded.
 * Android requires a visible ongoing notification for reliability — there is no workaround.
 *
 * Also used by Phase 0 spike for multi-hour survival + scheduled TTS probes.
 *
 * // future iOS: BGAppRefresh / background audio session — not built in this pass
 */
class ForegroundSchedulerService : Service() {

  companion object {
    const val CHANNEL_ID = "aurelia_companion"
    const val NOTIFICATION_ID = 7701
    const val ACTION_START = "com.aureliaapp.scheduler.START"
    const val ACTION_STOP = "com.aureliaapp.scheduler.STOP"
    const val ACTION_SET_INTERVAL = "com.aureliaapp.scheduler.SET_INTERVAL"
    const val ACTION_SET_QUIET = "com.aureliaapp.scheduler.SET_QUIET"
    const val ACTION_FIRE_CHECKIN = "com.aureliaapp.scheduler.FIRE_CHECKIN"
    const val ACTION_PHASE0_PROBE = "com.aureliaapp.scheduler.PHASE0_PROBE"
    const val EXTRA_INTERVAL_MS = "intervalMs"
    const val EXTRA_QUIET = "quiet"
    const val EXTRA_PHASE0 = "phase0"
    const val DEFAULT_INTERVAL_MS = 60L * 60L * 1000L // 60 minutes mid of 45–90

    const val PREFS = "aurelia_scheduler"
    const val KEY_INTERVAL = "interval_ms"
    const val KEY_QUIET = "quiet_mode"
    const val KEY_LAST_CHECKIN = "last_checkin_ms"
    const val KEY_STARTED_AT = "started_at_ms"
    const val KEY_PHASE0 = "phase0_mode"

    @Volatile
    var isRunning: Boolean = false
      private set

    fun start(context: Context, intervalMs: Long = DEFAULT_INTERVAL_MS, phase0: Boolean = false) {
      val intent = Intent(context, ForegroundSchedulerService::class.java).apply {
        action = ACTION_START
        putExtra(EXTRA_INTERVAL_MS, intervalMs)
        putExtra(EXTRA_PHASE0, phase0)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      val intent = Intent(context, ForegroundSchedulerService::class.java).apply {
        action = ACTION_STOP
      }
      context.startService(intent)
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private var intervalMs: Long = DEFAULT_INTERVAL_MS
  private var quietMode: Boolean = false
  private var phase0Mode: Boolean = false
  private var wakeLock: PowerManager.WakeLock? = null

  private val tickRunnable = object : Runnable {
    override fun run() {
      if (!isRunning) return
      maybeFireCheckIn()
      // Phase 0: also log battery every 5 minutes
      if (phase0Mode) {
        logPhase0Battery("tick")
      }
      handler.postDelayed(this, minOf(intervalMs, 5 * 60 * 1000L))
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
    val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    intervalMs = prefs.getLong(KEY_INTERVAL, DEFAULT_INTERVAL_MS)
    quietMode = prefs.getBoolean(KEY_QUIET, false)
    phase0Mode = prefs.getBoolean(KEY_PHASE0, false)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        shutdown()
        return START_NOT_STICKY
      }
      ACTION_SET_INTERVAL -> {
        intervalMs = intent.getLongExtra(EXTRA_INTERVAL_MS, intervalMs).coerceIn(
          5 * 60 * 1000L, // min 5 min for sanity (UI allows 45–90; Phase 0 may use shorter)
          6 * 60 * 60 * 1000L
        )
        getSharedPreferences(PREFS, Context.MODE_PRIVATE)
          .edit().putLong(KEY_INTERVAL, intervalMs).apply()
        scheduleAlarm()
      }
      ACTION_SET_QUIET -> {
        quietMode = intent.getBooleanExtra(EXTRA_QUIET, false)
        getSharedPreferences(PREFS, Context.MODE_PRIVATE)
          .edit().putBoolean(KEY_QUIET, quietMode).apply()
        updateNotification()
      }
      ACTION_FIRE_CHECKIN, ACTION_PHASE0_PROBE -> {
        fireCheckIn(force = intent.action == ACTION_PHASE0_PROBE)
      }
      else -> {
        // START
        if (intent?.hasExtra(EXTRA_INTERVAL_MS) == true) {
          intervalMs = intent.getLongExtra(EXTRA_INTERVAL_MS, intervalMs)
        }
        phase0Mode = intent?.getBooleanExtra(EXTRA_PHASE0, phase0Mode) ?: phase0Mode
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
          .putLong(KEY_INTERVAL, intervalMs)
          .putBoolean(KEY_PHASE0, phase0Mode)
          .putLong(KEY_STARTED_AT, System.currentTimeMillis())
          .apply()
        enterForeground()
        acquireWakeLock()
        isRunning = true
        scheduleAlarm()
        handler.removeCallbacks(tickRunnable)
        handler.postDelayed(tickRunnable, minOf(intervalMs, 5 * 60 * 1000L))
        if (phase0Mode) {
          logPhase0Battery("service_start")
        }
        emitJs("schedulerStarted", mapOf(
          "intervalMs" to intervalMs,
          "phase0" to phase0Mode
        ))
      }
    }
    return START_STICKY
  }

  private fun enterForeground() {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      // connectedDevice: long-lived BT headset session companion.
      // mic is only used during explicit tap-to-talk (activity/JS), not continuous in this service.
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun updateNotification() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.notify(NOTIFICATION_ID, buildNotification())
  }

  private fun buildNotification(): Notification {
    val launch = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val status = when {
      quietMode -> "Quiet mode — check-ins paused"
      phase0Mode -> "Phase 0 spike running"
      else -> "Listening for earbuds · check-in every ${intervalMs / 60000}m"
    }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Aurelia")
      .setContentText(status)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentIntent(launch)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Aurelia companion",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Keeps Aurelia present while earbuds are connected"
        setShowBadge(false)
      }
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.createNotificationChannel(channel)
    }
  }

  private fun scheduleAlarm() {
    val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pi = checkInPendingIntent()
    am.cancel(pi)
    val triggerAt = SystemClock.elapsedRealtime() + intervalMs
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
    } else {
      am.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
    }
  }

  private fun checkInPendingIntent(): PendingIntent {
    val intent = Intent(this, ForegroundSchedulerService::class.java).apply {
      action = if (phase0Mode) ACTION_PHASE0_PROBE else ACTION_FIRE_CHECKIN
    }
    return PendingIntent.getService(
      this,
      42,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun maybeFireCheckIn() {
    val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val last = prefs.getLong(KEY_LAST_CHECKIN, 0L)
    val now = System.currentTimeMillis()
    if (last == 0L) {
      // First run: arm last_checkin to now so we wait a full interval
      prefs.edit().putLong(KEY_LAST_CHECKIN, now).apply()
      scheduleAlarm()
      return
    }
    if (now - last >= intervalMs) {
      fireCheckIn(force = false)
    } else {
      scheduleAlarm()
    }
  }

  private fun fireCheckIn(force: Boolean) {
    if (!force && quietMode) {
      scheduleAlarm()
      emitJs("checkInSuppressed", mapOf("reason" to "quiet_mode"))
      return
    }
    getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit().putLong(KEY_LAST_CHECKIN, System.currentTimeMillis()).apply()
    scheduleAlarm()

    if (phase0Mode) {
      logPhase0Battery("checkin_fire")
    }

    emitJs(
      "proactiveCheckIn",
      mapOf(
        "timestamp" to System.currentTimeMillis(),
        "phase0" to phase0Mode,
        "forced" to force
      )
    )

    // Also kick a headless JS task if the app is backgrounded without an active bridge listener
    try {
      val headless = Intent(this, CheckInHeadlessService::class.java)
      headless.putExtra("phase0", phase0Mode)
      startService(headless)
    } catch (_: Exception) {
    }
  }

  private fun logPhase0Battery(event: String) {
    val bm = getSystemService(Context.BATTERY_SERVICE) as android.os.BatteryManager
    val level = bm.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY)
    val line = "${System.currentTimeMillis()},$event,battery_pct=$level,interval_ms=$intervalMs\n"
    try {
      openFileOutput("phase0_battery.log", Context.MODE_APPEND).use { it.write(line.toByteArray()) }
    } catch (_: Exception) {
    }
    emitJs("phase0BatterySample", mapOf("event" to event, "batteryPct" to level))
  }

  private fun acquireWakeLock() {
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "aurelia:scheduler").apply {
      setReferenceCounted(false)
      // Long enough for a check-in cycle; renewed on each start
      acquire(10 * 60 * 1000L)
    }
  }

  private fun releaseWakeLock() {
    try {
      wakeLock?.let { if (it.isHeld) it.release() }
    } catch (_: Exception) {
    }
    wakeLock = null
  }

  private fun shutdown() {
    isRunning = false
    handler.removeCallbacks(tickRunnable)
    val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.cancel(checkInPendingIntent())
    releaseWakeLock()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
    emitJs("schedulerStopped", emptyMap())
  }

  private fun emitJs(event: String, payload: Map<String, Any?>) {
    try {
      val app = application as? ReactApplication ?: return
      val ctx = app.reactNativeHost.reactInstanceManager.currentReactContext ?: return
      val map = Arguments.createMap()
      for ((k, v) in payload) {
        when (v) {
          null -> map.putNull(k)
          is Boolean -> map.putBoolean(k, v)
          is Int -> map.putInt(k, v)
          is Long -> map.putDouble(k, v.toDouble())
          is Double -> map.putDouble(k, v)
          is Float -> map.putDouble(k, v.toDouble())
          is String -> map.putString(k, v)
          else -> map.putString(k, v.toString())
        }
      }
      ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(event, map)
    } catch (_: Exception) {
    }
  }

  override fun onDestroy() {
    isRunning = false
    handler.removeCallbacks(tickRunnable)
    releaseWakeLock()
    super.onDestroy()
  }
}

/**
 * Headless JS entry for check-ins when UI is not mounted.
 * Registered task name: AureliaCheckIn
 */
class CheckInHeadlessService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras
    val data = Arguments.createMap()
    data.putBoolean("phase0", extras?.getBoolean("phase0") ?: false)
    data.putDouble("timestamp", System.currentTimeMillis().toDouble())
    return HeadlessJsTaskConfig(
      "AureliaCheckIn",
      data,
      30_000,
      true
    )
  }
}
