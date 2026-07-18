package com.aureliaapp.nativemodules

import android.Manifest
import android.content.ContentValues
import android.content.pm.PackageManager
import android.provider.CalendarContract
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * Tier 1 calendar automation: silent write via CalendarContract ContentProvider.
 * Requires READ_CALENDAR + WRITE_CALENDAR runtime permissions.
 */
class CalendarModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CalendarModule"

  @ReactMethod
  fun createEvent(
    title: String,
    startIso: String,
    endIso: String,
    notes: String?,
    allDay: Boolean,
    promise: Promise
  ) {
    try {
      if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.WRITE_CALENDAR)
        != PackageManager.PERMISSION_GRANTED
      ) {
        promise.reject("CALENDAR_PERMISSION", "WRITE_CALENDAR not granted")
        return
      }

      val calId = primaryCalendarId()
      if (calId == null) {
        promise.reject("NO_CALENDAR", "No writable calendar found on device")
        return
      }

      val startMs = parseIsoToEpochMs(startIso)
      val endMs = parseIsoToEpochMs(endIso)
      if (startMs == null || endMs == null) {
        promise.reject("BAD_TIMESTAMP", "Could not parse start_iso/end_iso: $startIso / $endIso")
        return
      }

      val values = ContentValues().apply {
        put(CalendarContract.Events.DTSTART, startMs)
        put(CalendarContract.Events.DTEND, endMs)
        put(CalendarContract.Events.TITLE, title)
        put(CalendarContract.Events.DESCRIPTION, notes ?: "")
        put(CalendarContract.Events.CALENDAR_ID, calId)
        put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().id)
        put(CalendarContract.Events.ALL_DAY, if (allDay) 1 else 0)
      }

      val uri = reactContext.contentResolver.insert(CalendarContract.Events.CONTENT_URI, values)
      if (uri == null) {
        promise.reject("INSERT_FAILED", "ContentResolver.insert returned null")
        return
      }
      promise.resolve(uri.lastPathSegment)
    } catch (e: Exception) {
      promise.reject("CALENDAR_ERROR", e.message, e)
    }
  }

  private fun primaryCalendarId(): Long? {
    if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.READ_CALENDAR)
      != PackageManager.PERMISSION_GRANTED
    ) {
      return null
    }
    val projection = arrayOf(
      CalendarContract.Calendars._ID,
      CalendarContract.Calendars.IS_PRIMARY,
      CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL
    )
    reactContext.contentResolver.query(
      CalendarContract.Calendars.CONTENT_URI,
      projection,
      null,
      null,
      null
    )?.use { cursor ->
      val idIdx = cursor.getColumnIndex(CalendarContract.Calendars._ID)
      val primaryIdx = cursor.getColumnIndex(CalendarContract.Calendars.IS_PRIMARY)
      val accessIdx = cursor.getColumnIndex(CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL)
      var fallback: Long? = null
      while (cursor.moveToNext()) {
        val id = cursor.getLong(idIdx)
        val access = if (accessIdx >= 0) cursor.getInt(accessIdx) else 0
        if (access < CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR) continue
        val isPrimary = primaryIdx >= 0 && cursor.getInt(primaryIdx) == 1
        if (isPrimary) return id
        if (fallback == null) fallback = id
      }
      return fallback
    }
    return null
  }

  /**
   * Parses ISO-8601-ish strings from the backend. Handles Z and ±HH:MM offsets.
   * Avoids java.time so minSdk 24 works without desugaring.
   */
  private fun parseIsoToEpochMs(iso: String): Long? {
    val raw = iso.trim().replace(" ", "T")
    val patterns = listOf(
      "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
      "yyyy-MM-dd'T'HH:mm:ssXXX",
      "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
      "yyyy-MM-dd'T'HH:mm:ssZ",
      "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
      "yyyy-MM-dd'T'HH:mm:ss'Z'",
      "yyyy-MM-dd'T'HH:mm:ss"
    )
    for (p in patterns) {
      try {
        val sdf = SimpleDateFormat(p, Locale.US)
        if (!p.contains("X") && !p.contains("Z") && !p.contains("'Z'")) {
          sdf.timeZone = TimeZone.getDefault()
        } else if (p.contains("'Z'") || p.endsWith("Z") && !p.contains("X")) {
          sdf.timeZone = TimeZone.getTimeZone("UTC")
        }
        val d = sdf.parse(raw) ?: continue
        return d.time
      } catch (_: Exception) {
      }
    }
    // Manual: strip Z / offset and parse as local if all else fails
    return try {
      val cleaned = raw
        .replace(Regex("\\.\\d+"), "")
        .replace(Regex("[Zz]$"), "")
        .replace(Regex("[+-]\\d{2}:\\d{2}$"), "")
        .replace(Regex("[+-]\\d{4}$"), "")
      val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
      sdf.timeZone = TimeZone.getDefault()
      sdf.parse(cleaned)?.time
    } catch (_: Exception) {
      null
    }
  }
}
