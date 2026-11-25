package com.hamseda.app

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.util.Log
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Multi-engine native Android offline Persian TTS manager powered by Sherpa-ONNX.
 * Manages 3 isolated native ONNX/VITS engines side-by-side:
 *  - ava_gyro   : Bundled inside APK (auto-extracted on install/startup) + Goftari NLP + streaming AudioTrack
 *  - mana_piper : Mana Persian Piper (MIT, ~63.5 MB) downloadable on-demand into filesDir
 *  - amir_piper : Piper Amir male/formal Persian (MIT, ~60.6 MB) downloadable on-demand into filesDir
 */
object OfflinePersianTts {
    private const val TAG = "HamsedaOfflineTTS"
    private const val PREFS_NAME = "rmz_native_prefs"
    private const val KEY_ACTIVE_ENGINE = "active_offline_tts_engine"
    private const val BASE_DIR = "hamseda_offline_tts"

    data class EngineSpec(
        val id: String,
        val folderName: String,
        val bundledInApk: Boolean,
        val defaultGoftari: Boolean,
        val modelUrl: String,
        val tokensUrl: String,
        val expectedMinBytes: Long
    )

    private val ENGINES: Map<String, EngineSpec> = linkedMapOf(
        "ava_gyro" to EngineSpec(
            id = "ava_gyro",
            folderName = "gyro",
            bundledInApk = true,
            defaultGoftari = true,
            modelUrl = "https://huggingface.co/csukuangfj/vits-piper-fa_IR-gyro-medium/resolve/main/fa_IR-gyro-medium.onnx",
            tokensUrl = "https://huggingface.co/csukuangfj/vits-piper-fa_IR-gyro-medium/resolve/main/tokens.txt",
            expectedMinBytes = 20_000_000L
        ),
        "mana_piper" to EngineSpec(
            id = "mana_piper",
            folderName = "mana_piper",
            bundledInApk = false,
            defaultGoftari = false,
            modelUrl = "https://github.com/darkpsychichere-ui/mana-persian-piper-sherpa-onnx/releases/download/v1.0.0/model.onnx",
            tokensUrl = "https://github.com/darkpsychichere-ui/mana-persian-piper-sherpa-onnx/releases/download/v1.0.0/tokens.txt",
            expectedMinBytes = 20_000_000L
        ),
        "amir_piper" to EngineSpec(
            id = "amir_piper",
            folderName = "amir_piper",
            bundledInApk = false,
            defaultGoftari = false,
            modelUrl = "https://huggingface.co/csukuangfj/vits-piper-fa_IR-amir-medium/resolve/main/fa_IR-amir-medium.onnx",
            tokensUrl = "https://huggingface.co/csukuangfj/vits-piper-fa_IR-amir-medium/resolve/main/tokens.txt",
            expectedMinBytes = 20_000_000L
        )
    )

    data class SpeakResult(
        val ok: Boolean,
        val engineId: String,
        val synthesisMs: Long = 0L,
        val durationSec: Double = 0.0,
        val rtf: Double = 0.0,
        val error: String? = null
    )

    private val playbackGen = AtomicLong(0)
    private val cancelled = AtomicBoolean(false)
    private val engineLock = Any()

    @Volatile
    private var cachedEngineId: String? = null

    @Volatile
    private var cachedTts: OfflineTts? = null

    @Volatile
    private var activeTrack: AudioTrack? = null

    @JvmStatic
    fun getActiveEngineId(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val saved = prefs.getString(KEY_ACTIVE_ENGINE, "ava_gyro") ?: "ava_gyro"
        return if (ENGINES.containsKey(saved)) saved else "ava_gyro"
    }

    @JvmStatic
    fun setActiveEngineId(context: Context, engineId: String): Boolean {
        if (!ENGINES.containsKey(engineId)) return false
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_ACTIVE_ENGINE, engineId)
            .apply()
        return true
    }

    @JvmStatic
    fun stop() {
        playbackGen.incrementAndGet()
        cancelled.set(true)
        val track = activeTrack
        activeTrack = null
        if (track != null) {
            try {
                track.pause()
                track.flush()
                track.stop()
            } catch (_: Exception) {
            }
            try {
                track.release()
            } catch (_: Exception) {
            }
        }
    }

    private fun rootDir(context: Context): File = File(context.filesDir, BASE_DIR)

    private fun espeakDir(context: Context): File = File(rootDir(context), "espeak-ng-data")

    private fun engineDir(context: Context, spec: EngineSpec): File =
        File(rootDir(context), spec.folderName)

    @JvmStatic
    fun ensureDefaultInstalled(context: Context): Boolean {
        return try {
            val espeak = espeakDir(context)
            val espeakFiles = espeak.list()
            if (!espeak.isDirectory || espeakFiles == null || espeakFiles.isEmpty()) {
                copyAssetDir(context, "offline_tts/espeak-ng-data", espeak)
            }
            val gyroSpec = ENGINES["ava_gyro"]!!
            val gyroDir = engineDir(context, gyroSpec)
            val model = File(gyroDir, "model.onnx")
            val tokens = File(gyroDir, "tokens.txt")
            if (!model.isFile || model.length() < gyroSpec.expectedMinBytes) {
                copyAsset(context, "offline_tts/gyro/model.onnx", model)
            }
            if (!tokens.isFile || tokens.length() == 0L) {
                copyAsset(context, "offline_tts/gyro/tokens.txt", tokens)
            }
            isEngineInstalled(context, "ava_gyro")
        } catch (t: Throwable) {
            Log.w(TAG, "ensureDefaultInstalled warning: ${t.message}")
            false
        }
    }

    private fun isEngineInstalled(context: Context, engineId: String): Boolean {
        val spec = ENGINES[engineId] ?: return false
        val dir = engineDir(context, spec)
        val model = File(dir, "model.onnx")
        val tokens = File(dir, "tokens.txt")
        val espeak = espeakDir(context)
        return model.isFile && model.length() >= spec.expectedMinBytes &&
            tokens.isFile && tokens.length() > 0L &&
            espeak.isDirectory
    }

    @JvmStatic
    fun getStatusesJson(context: Context): String {
        ensureDefaultInstalled(context)
        val activeId = getActiveEngineId(context)
        val arr = JSONArray()
        for (spec in ENGINES.values) {
            val dir = engineDir(context, spec)
            val model = File(dir, "model.onnx")
            val tokens = File(dir, "tokens.txt")
            val installed = isEngineInstalled(context, spec.id)
            val obj = JSONObject()
            obj.put("id", spec.id)
            obj.put("installed", installed)
            obj.put("bundledInApk", spec.bundledInApk)
            obj.put("sizeBytes", if (model.isFile) model.length() + tokens.length() else 0L)
            obj.put("isActive", spec.id == activeId)
            arr.put(obj)
        }
        return arr.toString()
    }

    fun interface DownloadProgressListener {
        fun onProgress(engineId: String, bytesDownloaded: Long, totalBytes: Long, stage: String)
    }

    @JvmStatic
    fun installEngine(
        context: Context,
        engineId: String,
        listener: DownloadProgressListener?
    ): Pair<Boolean, String?> {
        val spec = ENGINES[engineId] ?: return false to "موتور ناشناخته است."
        ensureDefaultInstalled(context)
        if (isEngineInstalled(context, engineId)) {
            return true to null
        }

        val espeak = espeakDir(context)
        if (!espeak.isDirectory) {
            return false to "پوشه فونتیک پایه (espeak-ng-data) در حافظه پیدا نشد."
        }

        val dir = engineDir(context, spec)
        if (!dir.exists()) dir.mkdirs()

        return try {
            val tokensFile = File(dir, "tokens.txt")
            listener?.onProgress(engineId, 0L, 1024L, "tokens")
            downloadFileAtomic(spec.tokensUrl, tokensFile) { _, _ -> }

            val modelFile = File(dir, "model.onnx")
            downloadFileAtomic(spec.modelUrl, modelFile) { got, total ->
                listener?.onProgress(engineId, got, total, "model")
            }

            if (modelFile.length() < spec.expectedMinBytes || tokensFile.length() == 0L) {
                modelFile.delete()
                return false to "فایل مدل دانلودشده کامل نیست."
            }
            true to null
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to install engine $engineId", t)
            false to ("خطا در دانلود مدل: " + (t.message ?: "اتصال اینترنت یا فیلترشکن را بررسی کنید"))
        }
    }

    @JvmStatic
    fun deleteEngine(context: Context, engineId: String): Boolean {
        val spec = ENGINES[engineId] ?: return false
        if (spec.bundledInApk) return false
        synchronized(engineLock) {
            if (cachedEngineId == engineId) {
                try {
                    cachedTts?.release()
                } catch (_: Exception) {
                }
                cachedTts = null
                cachedEngineId = null
            }
        }
        val dir = engineDir(context, spec)
        val ok = if (dir.exists()) dir.deleteRecursively() else true
        if (getActiveEngineId(context) == engineId) {
            setActiveEngineId(context, "ava_gyro")
        }
        return ok
    }

    @JvmStatic
    fun speak(context: Context, text: String, rate: Float): Boolean {
        return speakWithEngine(context, getActiveEngineId(context), text, rate, null).ok
    }

    @JvmStatic
    fun speakWithEngine(
        context: Context,
        requestedEngineId: String?,
        rawText: String,
        rate: Float,
        goftariOverride: Boolean?
    ): SpeakResult {
        val engineId = if (requestedEngineId != null && ENGINES.containsKey(requestedEngineId)) {
            requestedEngineId
        } else {
            getActiveEngineId(context)
        }
        val spec = ENGINES[engineId] ?: return SpeakResult(false, engineId, error = "موتور نامعتبر است.")

        if (rawText.isBlank()) {
            return SpeakResult(false, engineId, error = "متن خالی است.")
        }

        stop()
        val myGen = playbackGen.incrementAndGet()
        cancelled.set(false)

        if (!ensureDefaultInstalled(context) || !isEngineInstalled(context, engineId)) {
            return SpeakResult(
                ok = false,
                engineId = engineId,
                error = "فایل‌های آفلاین این موتور هنوز روی گوشی نصب نشده‌اند."
            )
        }

        val useGoftari = goftariOverride ?: spec.defaultGoftari
        val prepared = PersianSpeechProcessor.prepareForSynthesis(rawText, useGoftari)
        val sentences = PersianSpeechProcessor.splitSentences(prepared)
        if (sentences.isEmpty()) {
            return SpeakResult(false, engineId, error = "متن قابل تلفظی پیدا نشد.")
        }

        var track: AudioTrack? = null
        return try {
            val engine = getOrCreateTts(context, spec)
            val sampleRate = engine.sampleRate().takeIf { it > 8000 } ?: 22050
            val speed = rate.coerceIn(0.65f, 1.5f)

            val minBytes = AudioTrack.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )
            track = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setBufferSizeInBytes(maxOf(minBytes * 2, 16384))
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()

            if (cancelled.get() || myGen != playbackGen.get()) {
                track.release()
                return SpeakResult(false, engineId, error = "پخش متوقف شد.")
            }

            activeTrack = track
            val streamTrack: AudioTrack = track
            streamTrack.play()

            val startNs = System.nanoTime()
            var totalSamples = 0L
            var writtenFrames = 0L

            for ((idx, sentence) in sentences.withIndex()) {
                if (cancelled.get() || myGen != playbackGen.get()) break

                engine.generateWithCallback(sentence, 0, speed) { chunkSamples ->
                    if (cancelled.get() || myGen != playbackGen.get()) {
                        0 // Abort streaming synthesis immediately
                    } else {
                        writeFloatChunk(streamTrack, chunkSamples)
                        totalSamples += chunkSamples.size
                        writtenFrames += chunkSamples.size
                        1
                    }
                }

                // Short natural breath pause between sentences
                if (idx < sentences.size - 1 && !cancelled.get() && myGen == playbackGen.get()) {
                    val pauseSamples = ShortArray((sampleRate * 0.16f).toInt())
                    val writtenPause = streamTrack.write(pauseSamples, 0, pauseSamples.size)
                    if (writtenPause > 0) writtenFrames += writtenPause
                }
            }

            val synthesisMs = (System.nanoTime() - startNs) / 1_000_000L
            val durationSec = if (sampleRate > 0) totalSamples.toDouble() / sampleRate.toDouble() else 0.0
            val rtf = if (durationSec > 0.01) (synthesisMs / 1000.0) / durationSec else 0.0

            // Allow remaining buffered audio in AudioTrack to drain naturally until head catches up
            if (!cancelled.get() && myGen == playbackGen.get() && writtenFrames > 0L) {
                val drainStart = System.currentTimeMillis()
                val maxDrainMs = 2400L
                var lastHead = -1L
                var stagnantSince = drainStart
                while (!cancelled.get() && myGen == playbackGen.get()) {
                    val now = System.currentTimeMillis()
                    if (now - drainStart >= maxDrainMs) break
                    val head = try {
                        streamTrack.playbackHeadPosition.toLong() and 0xFFFFFFFFL
                    } catch (_: Exception) {
                        break
                    }
                    if (head >= writtenFrames) {
                        Thread.sleep(60L)
                        break
                    }
                    if (head != lastHead) {
                        lastHead = head
                        stagnantSince = now
                    } else if (now - stagnantSince >= 450L) {
                        break
                    }
                    Thread.sleep(35L)
                }
            }

            SpeakResult(
                ok = totalSamples > 0 && !cancelled.get(),
                engineId = engineId,
                synthesisMs = synthesisMs,
                durationSec = durationSec,
                rtf = rtf,
                error = if (totalSamples == 0L) "خروجی صوتی تولید نشد." else null
            )
        } catch (t: Throwable) {
            Log.e(TAG, "Offline Persian TTS failed ($engineId)", t)
            SpeakResult(false, engineId, error = t.message ?: "خطا در اجرای موتور صوتی")
        } finally {
            if (activeTrack === track) activeTrack = null
            if (track != null) {
                try {
                    track.stop()
                } catch (_: Exception) {
                }
                try {
                    track.release()
                } catch (_: Exception) {
                }
            }
        }
    }

    private fun writeFloatChunk(track: AudioTrack, samples: FloatArray) {
        if (samples.isEmpty()) return
        val pcm = ShortArray(samples.size) { i ->
            (samples[i].coerceIn(-1f, 1f) * 32767f).toInt().toShort()
        }
        var offset = 0
        while (offset < pcm.size && !cancelled.get()) {
            val written = track.write(pcm, offset, pcm.size - offset)
            if (written <= 0) break
            offset += written
        }
    }

    private fun getOrCreateTts(context: Context, spec: EngineSpec): OfflineTts {
        synchronized(engineLock) {
            val existing = cachedTts
            if (existing != null && cachedEngineId == spec.id) {
                return existing
            }
            try {
                existing?.release()
            } catch (_: Exception) {
            }
            cachedTts = null
            cachedEngineId = null

            val dir = engineDir(context, spec)
            val model = File(dir, "model.onnx")
            val tokens = File(dir, "tokens.txt")
            val espeak = espeakDir(context)
            check(model.isFile && tokens.isFile && espeak.isDirectory) {
                "Offline TTS files missing for ${spec.id}"
            }

            val vits = OfflineTtsVitsModelConfig(
                model = model.absolutePath,
                lexicon = "",
                tokens = tokens.absolutePath,
                dataDir = espeak.absolutePath,
                noiseScale = 0.667f,
                noiseScaleW = 0.8f,
                lengthScale = 1.0f
            )
            val modelConfig = OfflineTtsModelConfig(
                vits = vits,
                numThreads = (Runtime.getRuntime().availableProcessors() / 2).coerceIn(1, 4),
                debug = false,
                provider = "cpu"
            )
            val created = OfflineTts(
                assetManager = null,
                config = OfflineTtsConfig(model = modelConfig)
            )
            cachedTts = created
            cachedEngineId = spec.id
            return created
        }
    }

    private fun downloadFileAtomic(
        urlStr: String,
        target: File,
        onProgress: (Long, Long) -> Unit
    ) {
        target.parentFile?.mkdirs()
        val temp = File(target.absolutePath + ".download.tmp")
        if (temp.exists()) temp.delete()

        var currentUrl = urlStr
        var redirects = 0
        var conn: HttpURLConnection
        while (true) {
            conn = (URL(currentUrl).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = true
                connectTimeout = 15000
                readTimeout = 30000
                setRequestProperty("User-Agent", "Hamseda-Android/1.0")
            }
            val code = conn.responseCode
            if (code in 301..308 && redirects < 6) {
                val loc = conn.getHeaderField("Location")
                conn.disconnect()
                if (loc.isNullOrBlank()) throw IllegalStateException("Redirect location missing")
                currentUrl = URL(URL(currentUrl), loc).toString()
                redirects++
            } else if (code !in 200..299) {
                conn.disconnect()
                throw IllegalStateException("HTTP $code")
            } else {
                break
            }
        }

        val total = conn.contentLengthLong
        try {
            conn.inputStream.use { input ->
                FileOutputStream(temp).use { output ->
                    val buf = ByteArray(32 * 1024)
                    var got = 0L
                    var lastEmit = 0L
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        output.write(buf, 0, n)
                        got += n
                        val now = System.currentTimeMillis()
                        if (now - lastEmit >= 180L) {
                            onProgress(got, total)
                            lastEmit = now
                        }
                    }
                    output.fd.sync()
                    onProgress(got, total)
                }
            }
        } finally {
            conn.disconnect()
        }

        if (target.exists()) target.delete()
        check(temp.renameTo(target)) { "Cannot finalize downloaded file ${target.name}" }
    }

    private fun copyAsset(context: Context, asset: String, target: File) {
        if (target.isFile && target.length() > 0) return
        target.parentFile?.mkdirs()
        val temp = File(target.absolutePath + ".tmp")
        context.assets.open(asset).use { input ->
            FileOutputStream(temp).use { output ->
                input.copyTo(output)
                output.fd.sync()
            }
        }
        if (target.exists()) target.delete()
        check(temp.renameTo(target)) { "Cannot install asset $asset" }
    }

    private fun copyAssetDir(context: Context, assetDir: String, targetDir: File) {
        val children = context.assets.list(assetDir) ?: return
        targetDir.mkdirs()
        for (child in children) {
            val assetPath = "$assetDir/$child"
            val nested = context.assets.list(assetPath)
            val target = File(targetDir, child)
            if (nested != null && nested.isNotEmpty()) copyAssetDir(context, assetPath, target)
            else if (!target.isFile || target.length() == 0L) copyAsset(context, assetPath, target)
        }
    }
}