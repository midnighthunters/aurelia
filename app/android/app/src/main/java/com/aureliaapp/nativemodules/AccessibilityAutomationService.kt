package com.aureliaapp.nativemodules

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject

class AccessibilityAutomationService : AccessibilityService() {

  companion object {
    @Volatile
    var instance: AccessibilityAutomationService? = null
      private set
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    instance = this
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    // Capture layout/focus changes.
  }

  override fun onInterrupt() {
    // Required base class callback
  }

  override fun onDestroy() {
    instance = null
    super.onDestroy()
  }

  override fun onUnbind(intent: android.content.Intent?): Boolean {
    instance = null
    return super.onUnbind(intent)
  }

  /**
   * Dumps the active window node tree into a minimized JSON representation.
   * Prunes empty container nodes to minimize token counts.
   */
  fun dumpScreenJSON(): String {
    val root = rootInActiveWindow ?: return "{}"
    val json = serializeNode(root)
    root.recycle()
    return json.toString()
  }

  private fun serializeNode(node: AccessibilityNodeInfo?): JSONObject {
    val result = JSONObject()
    if (node == null) return result

    val className = node.className?.toString() ?: ""
    val text = node.text?.toString() ?: ""
    val desc = node.contentDescription?.toString() ?: ""
    val viewId = node.viewIdResourceName?.toString() ?: ""

    result.put("class", className.substringAfterLast('.'))
    if (text.isNotEmpty()) result.put("text", text)
    if (desc.isNotEmpty()) result.put("desc", desc)
    if (viewId.isNotEmpty()) result.put("id", viewId)

    if (node.isClickable) result.put("clickable", true)
    if (node.isScrollable) result.put("scrollable", true)
    if (node.isEditable) result.put("editable", true)

    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    val boundsArr = JSONArray().apply {
      put(bounds.left)
      put(bounds.top)
      put(bounds.right)
      put(bounds.bottom)
    }
    result.put("bounds", boundsArr)

    val children = JSONArray()
    for (i in 0 until node.childCount) {
      val child = node.getChild(i)
      if (child != null && child.isVisibleToUser) {
        val childJson = serializeNode(child)
        if (childJson.length() > 0) {
          children.put(childJson)
        }
        child.recycle()
      }
    }
    if (children.length() > 0) {
      result.put("children", children)
    }

    return result
  }

  /**
   * Performs an accessibility action on a specific node match.
   */
  fun performNodeAction(actionType: String, viewId: String?, textMatch: String?): Boolean {
    val root = rootInActiveWindow ?: return false
    val list = findNodes(root, viewId, textMatch)
    if (list.isEmpty()) {
      root.recycle()
      return false
    }
    val target = list[0]
    val action = when (actionType.lowercase()) {
      "click" -> AccessibilityNodeInfo.ACTION_CLICK
      "focus" -> AccessibilityNodeInfo.ACTION_FOCUS
      "long_click" -> AccessibilityNodeInfo.ACTION_LONG_CLICK
      else -> 0
    }
    val success = if (action != 0) {
      // Bypasses coordinate mapping if the native node receives click directly
      var actNode = target
      while (actNode != null && !actNode.isClickable && action == AccessibilityNodeInfo.ACTION_CLICK) {
        val parent = actNode.parent
        if (parent != null) {
          actNode = parent
        } else {
          break
        }
      }
      actNode?.performAction(action) ?: false
    } else false

    list.forEach { it.recycle() }
    root.recycle()
    return success
  }

  /**
   * Types text into a matched editable field.
   */
  fun performTypeAction(viewId: String?, textMatch: String?, textToType: String): Boolean {
    val root = rootInActiveWindow ?: return false
    val list = findNodes(root, viewId, textMatch).filter { it.isEditable }
    if (list.isEmpty()) {
      root.recycle()
      return false
    }
    val target = list[0]
    val arguments = android.os.Bundle()
    arguments.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, textToType)
    val success = target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
    list.forEach { it.recycle() }
    root.recycle()
    return success
  }

  /**
   * Emulates custom screen swipe/scroll actions using gestures.
   */
  fun performScrollAction(direction: String): Boolean {
    val root = rootInActiveWindow ?: return false
    val scrollableNodes = findScrollableNodes(root)
    if (scrollableNodes.isEmpty()) {
      root.recycle()
      return false
    }
    val target = scrollableNodes[0]
    val success = when (direction.lowercase()) {
      "down" -> target.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
      "up" -> target.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
      else -> false
    }
    scrollableNodes.forEach { it.recycle() }
    root.recycle()
    return success
  }

  /**
   * Simulates a screen tap coordinate.
   */
  fun performTapCoordinate(x: Float, y: Float): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
    val path = Path()
    path.moveTo(x, y)
    val gesture = GestureDescription.Builder()
      .addStroke(GestureDescription.StrokeDescription(path, 0, 50))
      .build()
    return dispatchGesture(gesture, null, null)
  }

  /**
   * Simulates a drag/swipe gesture across coordinates.
   */
  fun performSwipeCoordinate(x1: Float, y1: Float, x2: Float, y2: Float, duration: Long): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
    val path = Path()
    path.moveTo(x1, y1)
    path.lineTo(x2, y2)
    val gesture = GestureDescription.Builder()
      .addStroke(GestureDescription.StrokeDescription(path, 0, duration))
      .build()
    return dispatchGesture(gesture, null, null)
  }

  /**
   * Performs standard navigation inputs (Back, Home, Recents).
   */
  fun performNavigation(action: String): Boolean {
    val globalAction = when (action.lowercase()) {
      "back" -> GLOBAL_ACTION_BACK
      "home" -> GLOBAL_ACTION_HOME
      "recents" -> GLOBAL_ACTION_RECENTS
      "notifications" -> GLOBAL_ACTION_NOTIFICATIONS
      else -> return false
    }
    return performGlobalAction(globalAction)
  }

  // Helpers
  private fun findNodes(node: AccessibilityNodeInfo, viewId: String?, text: String?): List<AccessibilityNodeInfo> {
    val result = mutableListOf<AccessibilityNodeInfo>()
    traverseNodes(node) { n ->
      val matchId = viewId == null || n.viewIdResourceName?.toString() == viewId
      val matchText = text == null || n.text?.toString()?.contains(text, ignoreCase = true) == true ||
                      n.contentDescription?.toString()?.contains(text, ignoreCase = true) == true
      if (matchId && matchText && (viewId != null || text != null)) {
        result.add(AccessibilityNodeInfo.obtain(n))
      }
    }
    return result
  }

  private fun findScrollableNodes(node: AccessibilityNodeInfo): List<AccessibilityNodeInfo> {
    val result = mutableListOf<AccessibilityNodeInfo>()
    traverseNodes(node) { n ->
      if (n.isScrollable) {
        result.add(AccessibilityNodeInfo.obtain(n))
      }
    }
    return result
  }

  private fun traverseNodes(node: AccessibilityNodeInfo?, visitor: (AccessibilityNodeInfo) -> Unit) {
    if (node == null) return
    visitor(node)
    for (i in 0 until node.childCount) {
      val child = node.getChild(i)
      if (child != null) {
        traverseNodes(child, visitor)
        child.recycle()
      }
    }
  }
}
