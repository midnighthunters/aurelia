package com.aureliaapp.nativemodules

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale
import java.util.UUID

/**
 * Android platform STT (SpeechRecognizer) + TTS (TextToSpeech) for MVP.
 * Audio focus is requested temporarily so we coexist with music without permanent steal.
 *
 * Module boundary mirrors Open-LLM-VTuber style: swappable later for cloud STT/TTS.
 */
class SpeechModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), TextToSpeech.OnInitListener {

  private var tts: TextToSpeech? = null
  private var ttsReady = false
  private var recognizer: SpeechRecognizer? = null
  private var listening = false
  private var listenPromise: Promise? = null
  private var speakPromise: Promise? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  private var audioFocusRequest: AudioFocusRequest? = null

  override fun getName(): String = "SpeechModule"

  init {
    mainHandler.post {
      tts = TextToSpeech(reactContext, this)
    }
  }

  override fun onInit(status: Int) {
    ttsReady = status == TextToSpeech.SUCCESS
    if (ttsReady) {
      tts?.language = Locale.getDefault()
      tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String?) {
          sendEvent("ttsStarted", Arguments.createMap().apply {
            putString("utteranceId", utteranceId)
          })
        }

        override fun onDone(utteranceId: String?) {
          abandonAudioFocus()
          sendEvent("ttsDone", Arguments.createMap().apply {
            putString("utteranceId", utteranceId)
          })
          speakPromise?.resolve(true)
          speakPromise = null
        }

        @Deprecated("Deprecated in Java")
        override fun onError(utteranceId: String?) {
          abandonAudioFocus()
          speakPromise?.reject("TTS_ERROR", "TTS error for $utteranceId")
          speakPromise = null
        }

        override fun onError(utteranceId: String?, errorCode: Int) {
          abandonAudioFocus()
          speakPromise?.reject("TTS_ERROR", "TTS error code=$errorCode id=$utteranceId")
          speakPromise = null
        }
      })
    }
  }

  @ReactMethod
  fun isTtsReady(promise: Promise) {
    promise.resolve(ttsReady)
  }

  @ReactMethod
  fun speak(text: String, promise: Promise) {
    mainHandler.post {
      if (!ttsReady || tts == null) {
        promise.reject("TTS_NOT_READY", "TextToSpeech not initialized")
        return@post
      }
      // Barge-in: stop any current utterance
      tts?.stop()
      speakPromise?.resolve(false)
      speakPromise = promise
      requestAudioFocus()
      val id = UUID.randomUUID().toString()
      val params = Bundle()
      val result = tts?.speak(text, TextToSpeech.QUEUE_FLUSH, params, id)
      if (result == TextToSpeech.ERROR) {
        abandonAudioFocus()
        speakPromise = null
        promise.reject("TTS_SPEAK_FAILED", "speak() returned ERROR")
      }
    }
  }

  @ReactMethod
  fun stopSpeaking(promise: Promise) {
    mainHandler.post {
      tts?.stop()
      abandonAudioFocus()
      speakPromise?.resolve(false)
      speakPromise = null
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun startListening(promise: Promise) {
    mainHandler.post {
      if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO)
        != PackageManager.PERMISSION_GRANTED
      ) {
        promise.reject("MIC_PERMISSION", "RECORD_AUDIO not granted")
        return@post
      }
      if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
        promise.reject("STT_UNAVAILABLE", "SpeechRecognizer not available on this device")
        return@post
      }
      // Default: do not record until tap-to-talk — this method is only called from tap
      stopListeningInternal()
      listenPromise?.reject("STT_CANCELLED", "Superseded by new listen")
      listenPromise = promise
      listening = true

      // Stop TTS for barge-in
      tts?.stop()

      if (recognizer == null) {
        recognizer = SpeechRecognizer.createSpeechRecognizer(reactContext)
        recognizer?.setRecognitionListener(createListener())
      }

      requestAudioFocus()
      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
        putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, reactContext.packageName)
      }
      try {
        recognizer?.startListening(intent)
        sendEvent("sttStarted", Arguments.createMap())
      } catch (e: Exception) {
        listening = false
        listenPromise = null
        abandonAudioFocus()
        promise.reject("STT_START_FAILED", e.message, e)
      }
    }
  }

  @ReactMethod
  fun stopListening(promise: Promise) {
    mainHandler.post {
      stopListeningInternal()
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun logLatency(endOfSpeechMs: Double, ttsStartMs: Double, roundTripMs: Double, promise: Promise) {
    try {
      val line =
        "${System.currentTimeMillis()},end_of_speech=$endOfSpeechMs,tts_start=$ttsStartMs,round_trip_ms=$roundTripMs\n"
      reactContext.openFileOutput("latency.log", android.content.Context.MODE_APPEND).use {
        it.write(line.toByteArray())
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("LATENCY_LOG_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun getLatencyLog(promise: Promise) {
    try {
      val f = reactContext.getFileStreamPath("latency.log")
      promise.resolve(if (f.exists()) f.readText() else "")
    } catch (e: Exception) {
      promise.reject("LATENCY_READ_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}

  private fun stopListeningInternal() {
    try {
      recognizer?.stopListening()
      recognizer?.cancel()
    } catch (_: Exception) {
    }
    listening = false
    abandonAudioFocus()
  }

  private fun createListener(): RecognitionListener = object : RecognitionListener {
    override fun onReadyForSpeech(params: Bundle?) {
      sendEvent("sttReady", Arguments.createMap())
    }

    override fun onBeginningOfSpeech() {
      sendEvent("sttBeginning", Arguments.createMap())
    }

    override fun onRmsChanged(rmsdB: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}

    override fun onEndOfSpeech() {
      sendEvent(
        "sttEndOfSpeech",
        Arguments.createMap().apply {
          putDouble("timestamp", System.currentTimeMillis().toDouble())
        }
      )
    }

    override fun onError(error: Int) {
      listening = false
      abandonAudioFocus()
      val msg = when (error) {
        SpeechRecognizer.ERROR_AUDIO -> "ERROR_AUDIO"
        SpeechRecognizer.ERROR_CLIENT -> "ERROR_CLIENT"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "ERROR_INSUFFICIENT_PERMISSIONS"
        SpeechRecognizer.ERROR_NETWORK -> "ERROR_NETWORK"
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "ERROR_NETWORK_TIMEOUT"
        SpeechRecognizer.ERROR_NO_MATCH -> "ERROR_NO_MATCH"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "ERROR_RECOGNIZER_BUSY"
        SpeechRecognizer.ERROR_SERVER -> "ERROR_SERVER"
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "ERROR_SPEECH_TIMEOUT"
        else -> "ERROR_$error"
      }
      sendEvent("sttError", Arguments.createMap().apply { putString("error", msg) })
      listenPromise?.reject("STT_ERROR", msg)
      listenPromise = null
    }

    override fun onResults(results: Bundle?) {
      listening = false
      abandonAudioFocus()
      val texts = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
      val best = texts?.firstOrNull().orEmpty()
      val map = Arguments.createMap()
      map.putString("transcript", best)
      val arr = Arguments.createArray()
      texts?.forEach { arr.pushString(it) }
      map.putArray("alternatives", arr)
      map.putDouble("timestamp", System.currentTimeMillis().toDouble())
      sendEvent("sttResults", map)
      listenPromise?.resolve(best)
      listenPromise = null
    }

    override fun onPartialResults(partialResults: Bundle?) {
      val texts = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
      val best = texts?.firstOrNull().orEmpty()
      sendEvent(
        "sttPartial",
        Arguments.createMap().apply { putString("transcript", best) }
      )
    }

    override fun onEvent(eventType: Int, params: Bundle?) {}
  }

  private fun requestAudioFocus() {
    val am = reactContext.getSystemService(android.content.Context.AUDIO_SERVICE) as AudioManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val attrs = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANT)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
      val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        .setAudioAttributes(attrs)
        .setOnAudioFocusChangeListener { }
        .build()
      audioFocusRequest = req
      am.requestAudioFocus(req)
    } else {
      @Suppress("DEPRECATION")
      am.requestAudioFocus(
        null,
        AudioManager.STREAM_MUSIC,
        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
      )
    }
  }

  private fun abandonAudioFocus() {
    val am = reactContext.getSystemService(android.content.Context.AUDIO_SERVICE) as AudioManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      audioFocusRequest?.let { am.abandonAudioFocusRequest(it) }
      audioFocusRequest = null
    } else {
      @Suppress("DEPRECATION")
      am.abandonAudioFocus(null)
    }
  }

  private fun sendEvent(event: String, params: com.facebook.react.bridge.WritableMap) {
    if (!reactContext.hasActiveReactInstance()) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(event, params)
  }

  override fun invalidate() {
    mainHandler.post {
      stopListeningInternal()
      tts?.stop()
      tts?.shutdown()
      tts = null
      recognizer?.destroy()
      recognizer = null
    }
    super.invalidate()
  }
}
