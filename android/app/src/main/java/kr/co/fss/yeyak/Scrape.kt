package kr.co.fss.yeyak

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/**
 * 예약 사이트 스크레이퍼 — server/scrape/{xe,sunsang}.js 포팅.
 * generic/recipe 사이트는 저장된 recipe 가 있으면 적용, 없으면 링크 전용.
 */
object Scrape {

    private fun today(): String {
        val c = Calendar.getInstance()
        return "%04d-%02d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
    }

    private fun addMonths(iso: String, k: Int): String {
        val (y, m, d) = iso.split("-").map { it.toInt() }
        val c = Calendar.getInstance()
        c.set(y, m - 1 + k, d)
        return "%04d-%02d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
    }

    private fun nowIsoZ(): String {
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        return fmt.format(java.util.Date())
    }

    private fun monthsBetween(fromIso: String, toIso: String): List<Pair<String, String>> {
        val out = ArrayList<Pair<String, String>>()
        var y = fromIso.substring(0, 4).toInt()
        var m = fromIso.substring(5, 7).toInt()
        val end = toIso.substring(0, 7)
        for (i in 0 until 12) {
            val key = "%04d-%02d".format(y, m)
            out.add(y.toString() to "%02d".format(m))
            if (key >= end) break
            m++; if (m > 12) { m = 1; y++ }
        }
        return out
    }

    // ---------- 결과 누적 ----------
    private class Acc {
        val boats = LinkedHashMap<String, JSONObject>()      // uid -> {name, fish}
        val byDate = HashMap<String, HashMap<String, JSONObject>>() // iso -> uid -> cell
        val errors = ArrayList<String>()
        fun cell(iso: String, uid: String): HashMap<String, JSONObject> = byDate.getOrPut(iso) { HashMap() }
    }

    // ---------- XpressEngine (칸피싱·제일낚시·팀만수·아라호) ----------
    private val XE_BOAT = Regex(
        "<span style=\"font-size:15px;\\s*font-weight:bold;[^\"]*\">([\\s\\S]*?)</span>([\\s\\S]*?)<div id=\"admin-right-(\\d{8})-(\\d+)-0\">([\\s\\S]*?)</div>"
    )
    private val XE_ANCHOR = Regex("<a\\s+name=\"(\\d{8})\"\\s*>")
    private val XE_FISH = Regex("alt=\"낚시종류\"[\\s\\S]*?padding-left:5px;\">\\s*([^<]+?)\\s*</td>")

    private fun xeClassify(alt: String): Triple<String, Int?, Int?> {
        if (Regex("예약완료|예약마감|마감").containsMatchIn(alt)) return Triple("full", 0, null)
        if (Regex("배정비|정비일|휴항|운휴").containsMatchIn(alt)) return Triple("unknown", null, null)
        val m = Regex("남은자리\\s*(\\d+)\\s*명?").find(alt)
        if (m != null) {
            val r = m.groupValues[1].toInt()
            return Triple(if (r <= 0) "full" else if (r <= 3) "few" else "open", r, null)
        }
        return Triple("unknown", null, null)
    }

    private fun xeParseSections(html: String, origin: String, modDir: String, acc: Acc) {
        val anchors = XE_ANCHOR.findAll(html).toList()
        for (i in anchors.indices) {
            val ymd = anchors[i].groupValues[1]
            val iso = "${ymd.substring(0, 4)}-${ymd.substring(4, 6)}-${ymd.substring(6, 8)}"
            val start = anchors[i].range.first
            val endPos = if (i + 1 < anchors.size) anchors[i + 1].range.first else html.length
            val seg = html.substring(start, endPos)
            for (mm in XE_BOAT.findAll(seg)) {
                val name = Http.stripTags(mm.groupValues[1]).replace(Regex("\\s+"), " ").trim()
                if (name.isEmpty()) continue
                // 공지사항/안내 행: admin-right div 가 비어 있음 → 배 아님
                if (!Regex("<img\\b", RegexOption.IGNORE_CASE).containsMatchIn(mm.groupValues[5])) continue
                if (Regex("공지|안내사항|입금계좌|예약규정").containsMatchIn(name)) continue
                val between = mm.groupValues[2]
                val uid = mm.groupValues[4]
                val (status, remain, total) = xeClassify(mm.groupValues[5])
                val hint = XE_FISH.find(between)?.groupValues?.get(1)?.replace("낚시", "")?.trim() ?: ""
                val fish = Fish.detect(between, hint)
                acc.boats.getOrPut(uid) { JSONObject().put("name", name).put("fish", fish) }.also {
                    if (fish.isNotEmpty() && it.optString("fish").isEmpty()) it.put("fish", fish)
                }
                val url = "$origin/_core/module/$modDir/popup.step1.php?date=$ymd&PA_N_UID=$uid"
                val c = JSONObject().put("status", status).put("url", url).put("fish", fish)
                if (remain != null) c.put("remain", remain) else c.put("remain", JSONObject.NULL)
                if (total != null) c.put("total", total)
                acc.cell(iso, uid)[uid] = c
            }
        }
    }

    private fun scrapeXe(site: JSONObject, fromIso: String, toIso: String): Acc {
        val acc = Acc()
        val origin = URL(site.getString("listUrl")).let { "${it.protocol}://${it.host}" }
        val fromYmd = fromIso.replace("-", "")
        val toYmd = toIso.replace("-", "")
        var modDir = "reservation_boat_v5.2_seat1"
        try {
            val url = site.getString("listUrl")
                .replace("{y}", fromIso.substring(0, 4)).replace("{m}", fromIso.substring(5, 7))
            val res = Http.get(url)
            modDir = Regex("reservation_boat_v5\\.\\d+_seat\\d+").find(res.text)?.value ?: modDir
            xeParseSections(res.text, origin, modDir, acc)
        } catch (e: Exception) {
            acc.errors.add("${site.getString("id")} list: ${e.message}")
        }
        var cursor = fromYmd
        for (guard in 0 until 24) {
            val res = try {
                Http.get(
                    "$origin/_core/module/$modDir/_module.new.list.more.php?date8=$cursor&PA_N_UID=0",
                    mapOf("x-requested-with" to "XMLHttpRequest")
                )
            } catch (e: Exception) {
                acc.errors.add("${site.getString("id")} more $cursor: ${e.message}"); break
            }
            val htmlM = Regex("<htmlCode>([\\s\\S]*?)</htmlCode>").find(res.text)
            val lastM = Regex("<last_day>(\\d{8})</last_day>").find(res.text)
            if (htmlM != null) xeParseSections(Http.unescapeHtml(htmlM.groupValues[1]), origin, modDir, acc)
            val last = lastM?.groupValues?.get(1)
            if (last == null || last <= cursor) break
            cursor = last
            if (cursor >= toYmd) break
        }
        return acc
    }

    // ---------- sunsang24 (동양낚시) ----------
    private val SS_UNIT_START = Regex("<table class=\"[^\"]*ship_unit_ship_no_(\\d+)[^\"]*\"")

    private fun ssParseUnit(block: String): Triple<String, Int?, Int?> {
        if (block.contains("data-status_code=\"END\"") || block.contains("예약마감")) {
            val t = Regex("예약마감</span>[\\s\\S]*?<span class=\"number[^\"]*\"[^>]*>\\s*(\\d+)\\s*명").find(block)
            return Triple("full", 0, t?.groupValues?.get(1)?.toInt())
        }
        val r = Regex("남은자리[\\s\\S]*?<span class=\"number[^\"]*\"[^>]*>\\s*(\\d+)\\s*명").find(block)
        if (r != null) {
            val remain = r.groupValues[1].toInt()
            val booked = Regex("예약/\\s*<span class=\"number[^\"]*\"[^>]*>\\s*(\\d+)\\s*명").find(block)
            val total = booked?.groupValues?.get(1)?.toInt()?.plus(remain)
            return Triple(if (remain <= 0) "full" else if (remain <= 3) "few" else "open", remain, total)
        }
        return Triple("unknown", null, null)
    }

    private fun scrapeSunsang(site: JSONObject, fromIso: String, toIso: String): Acc {
        val acc = Acc()
        val origin = URL(site.getString("listUrl")).let { "${it.protocol}://${it.host}" }
        val fromYmd = fromIso.replace("-", "")
        val toYmd = toIso.replace("-", "")
        for ((y, m) in monthsBetween(fromIso, toIso)) {
            val url = "$origin/ship/schedule_fleet/$y$m"
            val res = try { Http.get(url) } catch (e: Exception) {
                acc.errors.add("${site.getString("id")} $y-$m: ${e.message}"); continue
            }
            // 배 블록 = ship_unit 테이블 시작 ~ 다음 시작(또는 끝). 종료 주석에 의존하지 않음.
            val starts = SS_UNIT_START.findAll(res.text).toList()
            for (idx in starts.indices) {
                val shipNo = starts[idx].groupValues[1]
                val from = starts[idx].range.first
                val to = if (idx + 1 < starts.size) starts[idx + 1].range.first else res.text.length
                val block = res.text.substring(from, to)
                val sd = Regex("data-sdate=\"(\\d{4}-\\d{2}-\\d{2})\"").find(block) ?: continue
                val iso = sd.groupValues[1]
                val ymd = iso.replace("-", "")
                if (ymd < fromYmd || ymd > toYmd) continue
                val name = Regex("<div class=\"title\">\\s*([^<]+?)\\s*</div>").find(block)
                    ?.let { Http.stripTags(it.groupValues[1]) } ?: "선박$shipNo"
                if (Regex("마트|낚시마트").containsMatchIn(name)) continue
                var hint = Regex("<div id=\"fish\">\\s*([^<]+?)\\s*</div>").find(block)?.groupValues?.get(1)?.trim() ?: ""
                if (Regex("출조안내|미정|준비|안내").containsMatchIn(hint)) hint = ""
                val memo = Regex("editor_memo_pc\">([\\s\\S]{0,800})").find(block)?.groupValues?.get(1) ?: ""
                val fish = Fish.detect("$memo ${hint.replace(",", " ")}", hint)
                acc.boats.getOrPut(shipNo) { JSONObject().put("name", name).put("fish", fish) }.also {
                    if (fish.isNotEmpty() && it.optString("fish").isEmpty()) it.put("fish", fish)
                }
                val (status, remain, total) = ssParseUnit(block)
                val c = JSONObject().put("status", status).put("fish", fish)
                    .put("url", "$origin/ship/schedule_fleet/$y$m/$shipNo")
                c.put("remain", remain ?: JSONObject.NULL)
                c.put("total", total ?: JSONObject.NULL)
                acc.cell(iso, shipNo)[shipNo] = c
            }
        }
        return acc
    }

    // ---------- 전체 재조회 ----------
    fun refreshAll(ctx: Context, store: Store): JSONObject {
        val sites = store.sites()
        val prev = store.avail()
        val fromIso = today()
        val monthNum = fromIso.substring(5, 7).toInt()
        val months = maxOf(4, 12 - monthNum + 1)
        val toIso = addMonths(fromIso, months)

        val boatMeta = LinkedHashMap<String, JSONObject>()
        val prevBoats = prev.optJSONArray("boats") ?: JSONArray()
        for (i in 0 until prevBoats.length()) {
            val b = prevBoats.getJSONObject(i)
            boatMeta[b.getString("id")] = b
        }

        val byDate = JSONObject()
        val summary = JSONArray()
        val errors = JSONArray()
        var collected = 0

        Log.i("fss", "refreshAll $fromIso ~ $toIso, sites=${sites.length()}")
        for (i in 0 until sites.length()) {
            val site = sites.getJSONObject(i)
            if (site.optBoolean("enabled", true).not()) continue
            val kind = site.optString("kind")
            val acc = try {
                when (kind) {
                    "xe" -> scrapeXe(site, fromIso, toIso)
                    "sunsang" -> scrapeSunsang(site, fromIso, toIso)
                    else -> { summary.put(JSONObject().put("site", site.getString("id")).put("kind", kind).put("days", 0).put("note", "링크 전용")); continue }
                }
            } catch (e: Exception) {
                Log.w("fss", "${site.optString("id")} 실패", e)
                errors.put("${site.getString("id")}: ${e.message}")
                summary.put(JSONObject().put("site", site.getString("id")).put("kind", kind).put("days", 0).put("note", e.message))
                continue
            }
            acc.errors.forEach { errors.put(it); Log.w("fss", it) }
            Log.i("fss", "${site.optString("id")}: 배 ${acc.boats.size}, 날짜블록 ${acc.byDate.size}")
            val sid = site.getString("id")
            for ((uid, meta) in acc.boats) {
                val id = "$sid:$uid"
                val existing = boatMeta[id]
                boatMeta[id] = JSONObject()
                    .put("id", id).put("siteId", sid).put("uid", uid)
                    .put("name", meta.optString("name").ifEmpty { existing?.optString("name") ?: id })
                    .put("fish", meta.optString("fish").ifEmpty { existing?.optString("fish") ?: "" })
                    .put("lastSeen", fromIso)
            }
            var days = 0
            for ((iso, cells) in acc.byDate) {
                val bd = byDate.optJSONObject(iso) ?: JSONObject().also { byDate.put(iso, it) }
                for ((uid, cell) in cells) bd.put("$sid:$uid", cell)
                val y = iso.replace("-", "")
                if (y >= fromIso.replace("-", "") && y <= toIso.replace("-", "")) days++
            }
            collected += days
            summary.put(JSONObject().put("site", sid).put("kind", kind).put("days", days))
        }

        if (collected == 0 && prevBoats.length() > 0) {
            return JSONObject().put("ok", false).put("kept", true)
                .put("updatedAt", prev.opt("updatedAt")).put("summary", summary)
                .put("errors", errors).put("message", "수집 0건 — 기존 데이터 유지")
        }

        // 이번 조회에 등장한 배만
        val seen = HashSet<String>()
        val it = byDate.keys()
        while (it.hasNext()) {
            val cells = byDate.getJSONObject(it.next())
            val ck = cells.keys()
            while (ck.hasNext()) seen.add(ck.next())
        }
        val boats = JSONArray()
        boatMeta.values.filter { seen.contains(it.getString("id")) }
            .sortedWith(compareBy({ siteIndex(sites, it.getString("siteId")) }, { it.optString("name") }))
            .forEach { boats.put(it) }

        val avail = JSONObject()
            .put("updatedAt", nowIsoZ())
            .put("boats", boats)
            .put("byDate", byDate)
            .put("errors", errors)
        store.saveAvail(avail)
        return JSONObject().put("ok", true).put("updatedAt", avail.getString("updatedAt"))
            .put("boats", boats.length()).put("days", collected).put("summary", summary).put("errors", errors)
    }

    private fun siteIndex(sites: JSONArray, id: String): Int {
        for (i in 0 until sites.length()) if (sites.getJSONObject(i).optString("id") == id) return i
        return 99
    }
}
