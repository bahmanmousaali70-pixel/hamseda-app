package com.roozhaye.cinema

import android.app.Activity
import android.net.wifi.WifiManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.SecureRandom
import java.util.concurrent.Executors

class ProjectorRemoteServer(
    private val activity: Activity,
    private val webView: WebView
) {
    private val executor = Executors.newCachedThreadPool()
    private val pin = (100000 + SecureRandom().nextInt(900000)).toString()
    @Volatile private var token: String? = null
    @Volatile private var results = "[]"
    @Volatile private var running = false
    @Volatile private var server: ServerSocket? = null
    @Volatile var localAddress: String = "در انتظار اتصال Wi-Fi"
        private set

    fun start() {
        if (running) return
        running = true
        localAddress = getWifiAddress()
        executor.execute {
            try {
                server = ServerSocket(8765, 24, InetAddress.getByName("0.0.0.0"))
                while (running) {
                    val client = server?.accept() ?: break
                    executor.execute { handle(client) }
                }
            } catch (_: Exception) {
                running = false
            }
        }
    }

    fun stop() {
        running = false
        try { server?.close() } catch (_: Exception) {}
        executor.shutdownNow()
    }

    fun pairingInfo(): String = JSONObject()
        .put("ip", localAddress)
        .put("port", 8765)
        .put("pin", pin)
        .toString()

    fun publishResults(json: String) {
        results = try { JSONObject().put("items", org.json.JSONArray(json)).getJSONArray("items").toString() } catch (_: Exception) { "[]" }
    }

    fun publishStatus(message: String) {
        // Kept for future status synchronization; no personal data is stored.
    }

    private fun getWifiAddress(): String {
        return try {
            val wifi = activity.applicationContext.getSystemService(Activity.WIFI_SERVICE) as WifiManager
            val value = wifi.connectionInfo.ipAddress
            if (value == 0) "Wi-Fi وصل نیست"
            else listOf(value and 0xff, value shr 8 and 0xff, value shr 16 and 0xff, value shr 24 and 0xff).joinToString(".")
        } catch (_: Exception) { "IP نامشخص" }
    }

    private fun handle(socket: Socket) {
        socket.use { client ->
            try {
                client.soTimeout = 10000
                val input = client.getInputStream()
                val headerBytes = ByteArrayOutputStream()
                var matched = 0
                val marker = byteArrayOf(13, 10, 13, 10)
                while (headerBytes.size() < 16384 && matched < 4) {
                    val b = input.read()
                    if (b < 0) return
                    headerBytes.write(b)
                    matched = if (b.toByte() == marker[matched]) matched + 1 else if (b.toByte() == marker[0]) 1 else 0
                }
                val headerText = headerBytes.toString("UTF-8")
                val lines = headerText.split("\r\n")
                val first = lines.firstOrNull()?.split(" ") ?: return
                if (first.size < 2) return
                val method = first[0].uppercase()
                val path = first[1].substringBefore("?")
                val headers = lines.drop(1).mapNotNull {
                    val i = it.indexOf(':')
                    if (i > 0) it.substring(0, i).trim().lowercase() to it.substring(i + 1).trim() else null
                }.toMap()
                val length = (headers["content-length"] ?: "0").toIntOrNull()?.coerceIn(0, 65536) ?: 0
                val bodyBytes = ByteArray(length)
                var offset = 0
                while (offset < length) {
                    val n = input.read(bodyBytes, offset, length - offset)
                    if (n <= 0) break
                    offset += n
                }
                val body = JSONObject(String(bodyBytes, 0, offset, Charsets.UTF_8).ifBlank { "{}" })
                if (method == "OPTIONS") {
                    respond(client, 204, "text/plain", "")
                    return
                }
                when {
                    method == "GET" && (path == "/" || path == "/remote") -> {
                        val html = activity.assets.open("remote.html").bufferedReader().use { it.readText() }
                        respond(client, 200, "text/html; charset=utf-8", html)
                    }
                    method == "GET" && path == "/api/info" -> {
                        respond(client, 200, "application/json", JSONObject().put("name", "هم‌صدا سینما").put("pairingRequired", true).put("width", webView.width).put("height", webView.height).toString())
                    }
                    method == "POST" && path == "/api/pair" -> {
                        if (body.optString("pin") != pin) respond(client, 401, "application/json", JSONObject().put("error", "کد اتصال اشتباه است").toString())
                        else {
                            val newToken = java.util.UUID.randomUUID().toString()
                            token = newToken
                            respond(client, 200, "application/json", JSONObject().put("token", newToken).put("name", "هم‌صدا سینما").toString())
                        }
                    }
                    else -> {
                        val auth = headers["authorization"]?.removePrefix("Bearer ") ?: ""
                        if (token.isNullOrEmpty() || auth != token) {
                            respond(client, 401, "application/json", JSONObject().put("error", "ابتدا با کد اتصال جفت‌سازی کن").toString())
                            return
                        }
                        when {
                            method == "GET" && path == "/api/results" ->
                                respond(client, 200, "application/json", results)
                            method == "POST" && path == "/api/search" -> {
                                val query = body.optString("query").trim()
                                if (query.isNotEmpty()) webView.post {
                                    webView.evaluateJavascript("window.cinemaRemoteSearch && window.cinemaRemoteSearch(${JSONObject.quote(query)})", null)
                                }
                                respond(client, 200, "application/json", JSONObject().put("ok", true).toString())
                            }
                            method == "POST" && path == "/api/play" -> {
                                val id = body.optString("id")
                                if (id.isNotBlank()) webView.post {
                                    webView.evaluateJavascript("window.cinemaRemotePlay && window.cinemaRemotePlay(${JSONObject.quote(id)})", null)
                                }
                                respond(client, 200, "application/json", JSONObject().put("ok", true).toString())
                            }
                            method == "POST" && path == "/api/input" -> {
                                val action = body.optString("action")
                                val script = when (action) {
                                    "key" -> {
                                        val key = body.optString("key").replace("\\", "").replace("'", "")
                                        if (key !in setOf("ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter","Escape","Backspace","Tab"," ")) null
                                        else "document.dispatchEvent(new KeyboardEvent('keydown',{key:'$key',bubbles:true}));"
                                    }
                                    "move" -> {
                                        val x = (body.optDouble("x", 0.5).coerceIn(0.0, 1.0) * (webView.width / activity.resources.displayMetrics.density).toInt().coerceAtLeast(1)).toInt()
                                        val y = (body.optDouble("y", 0.5).coerceIn(0.0, 1.0) * (webView.height / activity.resources.displayMetrics.density).toInt().coerceAtLeast(1)).toInt()
                                        "(()=>{const e=document.elementFromPoint($x,$y)||document;e.dispatchEvent(new MouseEvent('mousemove',{clientX:$x,clientY:$y,bubbles:true}));})();"
                                    }
                                    "click" -> {
                                        val x = (body.optDouble("x", 0.5).coerceIn(0.0, 1.0) * (webView.width / activity.resources.displayMetrics.density).toInt().coerceAtLeast(1)).toInt()
                                        val y = (body.optDouble("y", 0.5).coerceIn(0.0, 1.0) * (webView.height / activity.resources.displayMetrics.density).toInt().coerceAtLeast(1)).toInt()
                                        "(()=>{const x=$x,y=$y,e=document.elementFromPoint(x,y);if(e){e.dispatchEvent(new MouseEvent('mousedown',{clientX:x,clientY:y,bubbles:true}));e.dispatchEvent(new MouseEvent('mouseup',{clientX:x,clientY:y,bubbles:true}));e.click();}})();"
                                    }
                                    "scroll" -> {
                                        val delta = body.optInt("delta", 0).coerceIn(-800, 800)
                                        "window.scrollBy(0,$delta);"
                                    }
                                    else -> null
                                }
                                if (script != null) webView.post { webView.evaluateJavascript(script, null) }
                                respond(client, 200, "application/json", JSONObject().put("ok", script != null).toString())
                            }
                            else -> respond(client, 404, "application/json", JSONObject().put("error", "not found").toString())
                        }
                    }
                }
            } catch (_: Exception) {
                try { respond(client, 400, "application/json", "{\"error\":\"bad request\"}") } catch (_: Exception) {}
            }
        }
    }

    private fun respond(socket: Socket, status: Int, type: String, body: String) {
        val bytes = body.toByteArray(Charsets.UTF_8)
        val reason = when (status) { 200 -> "OK"; 204 -> "No Content"; 401 -> "Unauthorized"; 404 -> "Not Found"; else -> "Bad Request" }
        val header = "HTTP/1.1 $status $reason\r\nContent-Type: $type\r\nContent-Length: ${bytes.size}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Authorization\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n"
        val out = socket.getOutputStream()
        out.write(header.toByteArray(Charsets.UTF_8))
        out.write(bytes)
        out.flush()
    }
}
