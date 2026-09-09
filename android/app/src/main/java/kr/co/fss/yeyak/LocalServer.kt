package kr.co.fss.yeyak

import android.content.Context
import fi.iki.elonen.NanoHTTPD
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URL

/**
 * 앱 내부에서 도는 작은 HTTP 서버. server/index.js 의 라우트를 그대로 재현한다.
 * 웹뷰가 http://127.0.0.1:<port> 를 열면 기존 프런트엔드가 수정 없이 동작.
 */
class LocalServer(private val ctx: Context, port: Int) : NanoHTTPD("127.0.0.1", port) {

    private val store = Store(ctx)

    override fun serve(session: IHTTPSession): Response {
        return try {
            val uri = session.uri
            when {
                uri.startsWith("/api/") -> api(session, uri)
                else -> static(uri)
            }
        } catch (e: Exception) {
            json(500, JSONObject().put("error", e.message ?: "error"))
        }
    }

    // ---------- 정적 파일 (assets/web) ----------
    private fun static(uriIn: String): Response {
        var uri = if (uriIn == "/" || uriIn.isEmpty()) "/index.html" else uriIn
        uri = uri.substringBefore('?').removePrefix("/")
        val path = "web/$uri"
        return try {
            val bytes = ctx.assets.open(path).use { it.readBytes() }
            newFixedLengthResponse(Response.Status.OK, mime(uri), bytes.inputStream(), bytes.size.toLong())
                .also { it.addHeader("Cache-Control", "no-store, must-revalidate") }
        } catch (e: Exception) {
            newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "not found: $uri")
        }
    }

    private fun mime(name: String) = when {
        name.endsWith(".html") -> "text/html; charset=utf-8"
        name.endsWith(".js") -> "application/javascript; charset=utf-8"
        name.endsWith(".css") -> "text/css; charset=utf-8"
        name.endsWith(".json") -> "application/json; charset=utf-8"
        name.endsWith(".svg") -> "image/svg+xml"
        name.endsWith(".png") -> "image/png"
        else -> "application/octet-stream"
    }

    // ---------- API ----------
    private fun body(session: IHTTPSession, cached: MutableMap<String, String>): JSONObject {
        // NanoHTTPD: POST 본문 → "postData"(문자열), PUT 본문 → "content"(임시 파일 경로).
        val raw = cached["postData"]
            ?: cached["content"]?.let { runCatching { File(it).readText(Charsets.UTF_8) }.getOrNull() }
            ?: return JSONObject()
        return if (raw.isBlank()) JSONObject() else runCatching { JSONObject(raw) }.getOrDefault(JSONObject())
    }

    private fun api(session: IHTTPSession, uri: String): Response {
        val method = session.method
        val bm = HashMap<String, String>()
        if (method == Method.POST || method == Method.PUT) {
            // NanoHTTPD 는 charset 미지정 시 본문을 US-ASCII 로 디코드 → 한글 손실.
            // charset 이 없으면 헤더에 UTF-8 을 박아 parseBody 가 UTF-8 로 읽게 한다.
            val ct = session.headers["content-type"]
            if (ct != null && !ct.contains("charset", ignoreCase = true)) {
                session.headers["content-type"] = "$ct; charset=UTF-8"
            }
            runCatching { session.parseBody(bm) }
        }
        val parts = uri.trim('/').split('/') // ["api","board"] ...

        if (uri.startsWith("/api/board")) {
            val month = session.parameters["month"]?.firstOrNull()
            return json(200, Board.build(ctx, store, month))
        }

        if (uri == "/api/sites") {
            if (method == Method.GET) return json(200, store.sites())
            if (method == Method.POST) {
                val b = body(session, bm)
                val url = b.optString("url")
                if (!Regex("^https?://").containsMatchIn(url)) return json(400, JSONObject().put("error", "url 필요"))
                val kind = detectKind(url)
                val norm = normalize(url, kind)
                val id = "s" + (System.currentTimeMillis().toString(36)) +
                    b.optString("name").filter { it.isLetterOrDigit() }.take(4).lowercase()
                val site = JSONObject().put("id", id)
                    .put("name", b.optString("name").ifEmpty { URL(url).host.removePrefix("www.") })
                    .put("kind", kind).put("listUrl", norm.first).put("dayUrl", norm.second).put("enabled", true)
                val sites = store.sites()
                sites.put(site)
                store.saveSites(sites)
                if (kind != "generic") Thread { runCatching { Scrape.refreshAll(ctx, store) } }.start()
                return json(200, JSONObject().put("site", site).put("sites", sites).put("kind", kind)
                    .put("aiNote", if (kind == "generic") "이 앱은 AI 분석을 지원하지 않습니다 — 링크 전용(X)으로 추가" else null))
            }
        }

        if (parts.size == 3 && parts[1] == "sites") {
            val id = parts[2]
            val sites = store.sites()
            if (method == Method.PUT) {
                val b = body(session, bm)
                var found = false
                for (i in 0 until sites.length()) {
                    val s = sites.getJSONObject(i)
                    if (s.getString("id") == id) {
                        found = true
                        if (b.has("name")) s.put("name", b.getString("name"))
                        if (b.has("enabled")) s.put("enabled", b.getBoolean("enabled"))
                        if (b.has("listUrl")) s.put("listUrl", b.getString("listUrl"))
                        if (b.has("dayUrl")) s.put("dayUrl", b.getString("dayUrl"))
                    }
                }
                if (!found) return json(404, JSONObject().put("error", "없는 사이트"))
                store.saveSites(sites)
                return json(200, JSONObject().put("sites", sites))
            }
            if (method == Method.DELETE) {
                val next = JSONArray()
                for (i in 0 until sites.length()) {
                    val s = sites.getJSONObject(i)
                    if (s.getString("id") != id) next.put(s)
                }
                store.saveSites(next)
                return json(200, JSONObject().put("sites", next))
            }
        }

        if (uri == "/api/refresh/status" && method == Method.GET) {
            return json(200, RefreshService.state)
        }
        if (uri == "/api/refresh" && method == Method.POST) {
            // 포그라운드 서비스로 실행 → 화면 나가도 계속 진행
            if (RefreshService.running) return json(200, JSONObject().put("started", false).put("running", true))
            RefreshService.start(ctx)
            return json(200, JSONObject().put("started", true))
        }
        if (uri == "/api/tide/refresh" && method == Method.POST) {
            return json(200, JSONObject().put("ok", false)
                .put("message", "이 앱은 번들 물때 데이터(2026–2027)를 사용합니다."))
        }

        if (uri == "/api/myplan") {
            if (method == Method.GET) return json(200, store.myplan())
            if (method == Method.PUT) {
                // 전체 교체 (가져오기)
                val arr = body(session, bm).optJSONArray("list") ?: return json(400, JSONObject().put("error", "list 배열 필요"))
                val clean = JSONArray()
                for (i in 0 until arr.length()) {
                    val x = arr.optJSONObject(i) ?: continue
                    val d = x.optString("date"); val bid = x.optString("boatId")
                    if (d.isEmpty() || bid.isEmpty()) continue
                    clean.put(JSONObject().put("date", d).put("boatId", bid)
                        .put("note", x.optString("note")).put("addedAt", x.optString("addedAt").ifEmpty { nowIso() }))
                }
                store.saveMyplan(clean)
                return json(200, clean)
            }
            if (method == Method.POST) {
                val b = body(session, bm)
                val date = b.optString("date"); val boatId = b.optString("boatId")
                if (date.isEmpty() || boatId.isEmpty()) return json(400, JSONObject().put("error", "date, boatId 필요"))
                val list = store.myplan()
                var idx = -1
                for (i in 0 until list.length()) {
                    val x = list.getJSONObject(i)
                    if (x.optString("date") == date && x.optString("boatId") == boatId) idx = i
                }
                if (idx >= 0) list.remove(idx)
                else list.put(JSONObject().put("date", date).put("boatId", boatId).put("note", b.optString("note"))
                    .put("addedAt", nowIso()))
                store.saveMyplan(list)
                return json(200, list)
            }
        }
        if (parts.size == 4 && parts[1] == "myplan" && method == Method.DELETE) {
            val date = parts[2]; val boatId = java.net.URLDecoder.decode(parts[3], "UTF-8")
            val list = store.myplan(); val next = JSONArray()
            for (i in 0 until list.length()) {
                val x = list.getJSONObject(i)
                if (!(x.optString("date") == date && x.optString("boatId") == boatId)) next.put(x)
            }
            store.saveMyplan(next)
            return json(200, next)
        }

        return json(404, JSONObject().put("error", "not found"))
    }

    private fun detectKind(url: String): String {
        val u = url.lowercase()
        if (u.contains("sunsang24")) return "sunsang"
        if (Regex("mid=bk|reservation_boat|thefishing\\.kr").containsMatchIn(u)) return "xe"
        return try {
            val body = Http.get(url, timeoutMs = 12000).text
            when {
                Regex("sunsang24|ship_unit_ship_no_").containsMatchIn(body) -> "sunsang"
                Regex("admin-right-|reservation_boat_v5").containsMatchIn(body) -> "xe"
                else -> "generic"
            }
        } catch (e: Exception) { "generic" }
    }

    private fun normalize(url: String, kind: String): Pair<String, String> {
        val u = URL(url)
        val origin = "${u.protocol}://${u.host}"
        return when (kind) {
            "sunsang" -> "$origin/ship/schedule_fleet/{y}{m}" to "$origin/ship/schedule_fleet/{y}{m}"
            "xe" -> {
                val q = u.query ?: ""
                val mid = Regex("mid=([^&]+)").find(q)?.groupValues?.get(1) ?: "bk"
                "$origin${u.path}?mid=$mid&year={y}&month={m}&mode=list" to
                    "$origin${u.path}?mid=$mid&year={y}&month={m}&day={d}&mode=list"
            }
            else -> url to url
        }
    }

    private fun nowIso(): String {
        val f = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
        f.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return f.format(java.util.Date())
    }

    private fun json(code: Int, o: Any): Response {
        val status = Response.Status.values().firstOrNull { it.requestStatus == code } ?: Response.Status.OK
        return newFixedLengthResponse(status, "application/json; charset=utf-8", o.toString())
            .also { it.addHeader("Cache-Control", "no-store") }
    }
}
