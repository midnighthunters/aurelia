package com.aureliaapp.nativemodules

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder

import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView

class OverlayService : Service() {

  companion object {
    var instance: OverlayService? = null
      private set

    const val CHANNEL_ID = "aurelia_overlay_channel"
    const val NOTIF_ID = 2001
  }

  private var windowManager: WindowManager? = null
  private var overlayView: View? = null
  private var statusTextView: TextView? = null
  private var stopButton: Button? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    createNotificationChannel()
    startForeground(NOTIF_ID, createNotification("Aurelia Agent Active"))
    setupOverlayView()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Aurelia Overlay Service",
        NotificationManager.IMPORTANCE_LOW
      )
      val manager = getSystemService(NotificationManager::class.java)
      manager?.createNotificationChannel(channel)
    }
  }

  private fun createNotification(status: String): Notification {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    return builder
      .setContentTitle("Aurelia AI Agent")
      .setContentText(status)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setOngoing(true)
      .build()
  }

  private fun setupOverlayView() {
    windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }

    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      layoutType,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.END
      x = 30
      y = 150
    }

    val container = android.widget.LinearLayout(this).apply {
      orientation = android.widget.LinearLayout.HORIZONTAL
      setBackgroundColor(Color.parseColor("#CC1E1E2E"))
      setPadding(24, 16, 24, 16)
    }

    statusTextView = TextView(this).apply {
      text = "🤖 Agent Idle"
      setTextColor(Color.WHITE)
      textSize = 13f
      setPadding(0, 0, 16, 0)
    }

    stopButton = Button(this).apply {
      text = "⏹ STOP"
      setTextColor(Color.WHITE)
      setBackgroundColor(Color.parseColor("#E74C3C"))
      textSize = 12f
      setPadding(12, 4, 12, 4)
      setOnClickListener {
        OverlayModule.notifyStopPressed()
      }
    }

    container.addView(statusTextView)
    container.addView(stopButton)
    overlayView = container

    try {
      windowManager?.addView(overlayView, params)
    } catch (e: Exception) {
      e.printStackTrace()
    }
  }

  fun updateStatusText(text: String) {
    statusTextView?.text = "🤖 $text"
  }

  override fun onDestroy() {
    if (overlayView != null) {
      try {
        windowManager?.removeView(overlayView)
      } catch (e: Exception) {
        e.printStackTrace()
      }
    }
    instance = null
    super.onDestroy()
  }
}
