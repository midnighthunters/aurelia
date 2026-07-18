package com.aureliaapp.nativemodules

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.ContactsContract
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class MessagingUtilityModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "MessagingUtilityModule"

  @ReactMethod
  fun scanContacts(promise: Promise) {
    val list = Arguments.createArray()
    try {
      val resolver = reactContext.contentResolver
      val cursor = resolver.query(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        arrayOf(
          ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
          ContactsContract.CommonDataKinds.Phone.NUMBER
        ),
        null,
        null,
        null
      )
      cursor?.use { c ->
        val nameIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
        val numIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
        var count = 0
        while (c.moveToNext() && count < 250) {
          if (nameIdx >= 0 && numIdx >= 0) {
            val name = c.getString(nameIdx) ?: ""
            val num = c.getString(numIdx) ?: ""
            val item = Arguments.createMap().apply {
              putString("name", name)
              putString("number", num)
            }
            list.pushMap(item)
            count++
          }
        }
      }
      promise.resolve(list)
    } catch (e: Exception) {
      promise.reject("CONTACTS_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun dialCall(number: String, promise: Promise) {
    try {
      val intent = Intent(Intent.ACTION_CALL).apply {
        data = Uri.parse("tel:$number")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      // Fallback to Dial intent if ACTION_CALL is blocked by permissions
      try {
        val intent = Intent(Intent.ACTION_DIAL).apply {
          data = Uri.parse("tel:$number")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactContext.startActivity(intent)
        promise.resolve(false)
      } catch (ex: Exception) {
        promise.reject("CALL_ERROR", ex.message, ex)
      }
    }
  }

  @ReactMethod
  fun getRecentNotifications(promise: Promise) {
    try {
      val list = Arguments.createArray()
      val recent = AureliaNotificationListener.getRecentNotifications()
      for (n in recent) {
        val item = Arguments.createMap().apply {
          putString("title", n["title"])
          putString("text", n["text"])
          putString("package", n["package"])
          putString("timestamp", n["timestamp"])
        }
        list.pushMap(item)
      }
      promise.resolve(list)
    } catch (e: Exception) {
      promise.reject("NOTIFICATION_ERROR", e.message, e)
    }
  }
}
