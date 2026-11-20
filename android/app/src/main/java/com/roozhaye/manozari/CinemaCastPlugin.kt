package com.roozhaye.manozari

import android.content.Intent
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.yinnho.upnpcast.DLNACast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONArray
import java.net.URI
import java.util.concurrent.ConcurrentHashMap

@CapacitorPlugin(name = "CinemaCast")
class CinemaCastPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val discoveredDevices = ConcurrentHashMap<String, DLNACast.Device>()

    override fun load() {
        super.load()
        DLNACast.init(context)
    }

    @PluginMethod
    fun discoverDevices(call: PluginCall) {
        val timeout = (call.getInt("timeoutMs") ?: 5000).coerceIn(1000, 12000).toLong()
        scope.launch {
            try {
                val found = DLNACast.search(timeout)
                discoveredDevices.clear()
                found.forEach { discoveredDevices[it.id] = it }
                val items = JSONArray()
                found.forEach { device ->
                    items.put(JSObject().apply {
                        put("id", device.id)
                        put("name", device.name)
                        put("address", device.address)
                        put("isTV", device.isTV)
                    })
                }
                call.resolve(JSObject().apply {
                    put("ok", true)
                    put("devices", items)
                    put("count", found.size)
                })
            } catch (error: Exception) {
                call.resolve(JSObject().apply {
                    put("ok", false)
                    put("devices", JSONArray())
                    put("error", error.message ?: "جستجوی دستگاه‌های DLNA ناموفق بود.")
                })
            }
        }
    }

    @PluginMethod
    fun castToDevice(call: PluginCall) {
        val deviceId = call.getString("deviceId")?.trim().orEmpty()
        val mediaUrl = call.getString("url")?.trim().orEmpty()
        val title = call.getString("title")?.trim()?.take(160)
        val device = discoveredDevices[deviceId]
        if (device == null) {
            call.resolve(JSObject().apply {
                put("ok", false)
                put("error", "دستگاه پیدا نشد؛ دوباره جستجوی پروژکتور را بزن.")
            })
            return
        }
        if (!isHttpMediaUrl(mediaUrl)) {
            call.resolve(JSObject().apply {
                put("ok", false)
                put("error", "برای ارسال به DLNA باید لینک مستقیم و قابل‌دسترسی HTTP یا HTTPS باشد؛ لینک صفحه یوتیوب قابل ارسال نیست.")
            })
            return
        }
        scope.launch {
            try {
                val success = DLNACast.castToDevice(device, mediaUrl, title)
                call.resolve(JSObject().apply {
                    put("ok", success)
                    if (!success) put("error", "پروژکتور لینک را نپذیرفت؛ ممکن است فرمت یا آدرس رسانه پشتیبانی نشود.")
                    put("deviceName", device.name)
                })
            } catch (error: Exception) {
                call.resolve(JSObject().apply {
                    put("ok", false)
                    put("error", error.message ?: "ارسال ویدئو به پروژکتور ناموفق بود.")
                })
            }
        }
    }

    @PluginMethod
    fun controlPlayback(call: PluginCall) {
        val action = call.getString("action")?.lowercase().orEmpty()
        val value = call.getDouble("value")
        scope.launch {
            try {
                val ok = when (action) {
                    "play" -> DLNACast.play()
                    "pause" -> DLNACast.pause()
                    "stop" -> DLNACast.stop()
                    "seek" -> DLNACast.seek((value ?: 0.0).toLong().coerceAtLeast(0))
                    "volume" -> DLNACast.setVolume((value ?: 50.0).toInt().coerceIn(0, 100))
                    "mute" -> DLNACast.setMute(value != 0.0)
                    else -> false
                }
                call.resolve(JSObject().apply {
                    put("ok", ok)
                    if (!ok) put("error", "فرمان اجرا نشد؛ اتصال DLNA را بررسی کن.")
                })
            } catch (error: Exception) {
                call.resolve(JSObject().apply {
                    put("ok", false)
                    put("error", error.message ?: "کنترل پخش ناموفق بود.")
                })
            }
        }
    }

    @PluginMethod
    fun getPlaybackState(call: PluginCall) {
        scope.launch {
            try {
                val state = DLNACast.getState()
                val progress = DLNACast.getProgress()
                call.resolve(JSObject().apply {
                    put("ok", true)
                    put("connected", state.isConnected)
                    put("deviceName", state.currentDevice?.name ?: "")
                    put("playbackState", state.playbackState.name.lowercase())
                    put("isPlaying", state.isPlaying)
                    put("isPaused", state.isPaused)
                    put("volume", state.volume)
                    put("isMuted", state.isMuted)
                    if (progress != null) {
                        put("positionMs", progress.first)
                        put("durationMs", progress.second)
                    }
                })
            } catch (error: Exception) {
                call.resolve(JSObject().apply {
                    put("ok", false)
                    put("error", error.message ?: "خواندن وضعیت پخش ناموفق بود.")
                })
            }
        }
    }

    @PluginMethod
    fun openSystemCastSettings(call: PluginCall) {
        try {
            val ctx = context
            val castIntent = Intent(Settings.ACTION_CAST_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (castIntent.resolveActivity(ctx.packageManager) != null) {
                ctx.startActivity(castIntent)
            } else {
                ctx.startActivity(Intent(Settings.ACTION_WIFI_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            call.resolve(JSObject().apply { put("ok", true) })
        } catch (error: Exception) {
            call.resolve(JSObject().apply {
                put("ok", false)
                put("error", error.message ?: "تنظیمات نمایش بی‌سیم در این دستگاه در دسترس نیست.")
            })
        }
    }

    private fun isHttpMediaUrl(value: String): Boolean = try {
        val uri = URI(value)
        (uri.scheme == "http" || uri.scheme == "https") && !uri.host.isNullOrBlank() && uri.userInfo == null
    } catch (_: Exception) {
        false
    }

    override fun handleOnDestroy() {
        scope.cancel()
        DLNACast.cleanup()
        super.handleOnDestroy()
    }
}
