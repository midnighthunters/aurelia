package com.aureliaapp.nativemodules

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class AureliaNotificationListener : NotificationListenerService() {

  companion object {
    private val notifications = mutableListOf<Map<String, String>>()

    @Synchronized
    fun getRecentNotifications(): List<Map<String, String>> {
      return notifications.toList()
    }

    @Synchronized
    fun clearNotifications() {
      notifications.clear()
    }
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    super.onNotificationPosted(sbn)
    val s = sbn ?: return
    val extras = s.notification?.extras ?: return
    val title = extras.getCharSequence("android.title")?.toString() ?: ""
    val text = extras.getCharSequence("android.text")?.toString() ?: ""
    val pack = s.packageName ?: ""

    val item = mapOf(
      "title" to title,
      "text" to text,
      "package" to pack,
      "timestamp" to System.currentTimeMillis().toString()
    )

    synchronized(notifications) {
      notifications.add(item)
      if (notifications.size > 100) {
        notifications.removeAt(0)
      }
    }
  }
}
