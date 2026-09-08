package kr.co.fss.yeyak

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/** GET /api/board 응답 조립 — server/index.js 포팅. */
object Board {

    private fun today(): String {
        val c = Calendar.getInstance()
        return "%04d-%02d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
    }

    fun build(ctx: Context, store: Store, monthReq: String?): JSONObject {
        val today = today()
        val month = if (monthReq != null && Regex("^\\d{4}-\\d{2}$").matches(monthReq)) monthReq else today.substring(0, 7)
        val tide = Tide.load(ctx)
        val avail = store.avail()
        val sites = store.sites()
        val myplan = store.myplan()

        val enabledSites = ArrayList<JSONObject>()
        for (i in 0 until sites.length()) {
            val s = sites.getJSONObject(i)
            if (s.optBoolean("enabled", true)) enabledSites.add(s)
        }
        val enabledIds = enabledSites.map { it.getString("id") }.toHashSet()
        val siteById = HashMap<String, JSONObject>()
        for (i in 0 until sites.length()) siteById[sites.getJSONObject(i).getString("id")] = sites.getJSONObject(i)

        val availBoats = avail.optJSONArray("boats") ?: JSONArray()
        val scraped = ArrayList<JSONObject>()
        for (i in 0 until availBoats.length()) {
            val b = availBoats.getJSONObject(i)
            if (enabledIds.contains(b.optString("siteId"))) scraped.add(b)
        }
        // generic 사이트(배 없음) → 링크 전용 열
        val linkOnly = ArrayList<JSONObject>()
        for (s in enabledSites) {
            if (s.optString("kind") == "generic" && scraped.none { it.optString("siteId") == s.getString("id") }) {
                linkOnly.add(
                    JSONObject().put("id", "${s.getString("id")}:_link").put("siteId", s.getString("id"))
                        .put("name", s.getString("name")).put("fish", "").put("generic", true)
                )
            }
        }
        val boats = ArrayList<JSONObject>().apply { addAll(scraped); addAll(linkOnly) }
        val byDate = avail.optJSONObject("byDate") ?: JSONObject()

        fun linkUrl(s: JSONObject, iso: String): String {
            var u = (if (s.has("dayUrl")) s.optString("dayUrl") else s.optString("listUrl"))
            u = u.replace("{y}", iso.substring(0, 4)).replace("{yyyy}", iso.substring(0, 4))
                .replace("{m}", iso.substring(5, 7)).replace("{mm}", iso.substring(5, 7))
                .replace("{d}", iso.substring(8, 10)).replace("{dd}", iso.substring(8, 10))
            return if (u.isEmpty()) "#" else u
        }

        val n = Tide.daysInMonth(month)
        val startDay = if (month == today.substring(0, 7)) today.substring(8, 10).toInt() else 1
        val rows = JSONArray()
        for (d in startDay..n) {
            val iso = "%s-%02d".format(month, d)
            val row = Tide.row(tide, iso)
            val cells = JSONObject()
            val dayAvail = byDate.optJSONObject(iso) ?: JSONObject()
            for (b in scraped) {
                val id = b.getString("id")
                if (dayAvail.has(id)) cells.put(id, dayAvail.getJSONObject(id))
            }
            for (b in linkOnly) {
                cells.put(b.getString("id"), JSONObject().put("status", "link")
                    .put("url", linkUrl(siteById[b.getString("siteId")]!!, iso)))
            }
            row.put("isToday", iso == today)
            row.put("cells", cells)
            rows.put(row)
        }

        val boatsOut = JSONArray()
        for (b in boats) {
            val sid = b.optString("siteId")
            val s = siteById[sid]
            boatsOut.put(
                JSONObject().put("id", b.getString("id")).put("siteId", sid)
                    .put("site", s?.optString("name") ?: sid)
                    .put("kind", s?.optString("kind") ?: "generic")
                    .put("name", b.optString("name")).put("fish", b.optString("fish"))
                    .put("generic", b.optBoolean("generic", false))
            )
        }

        return JSONObject()
            .put("month", month).put("today", today)
            .put("updatedAt", avail.opt("updatedAt"))
            .put("tideSource", "국립해양조사원 인천 조석예보")
            .put("sites", sites)
            .put("boats", boatsOut)
            .put("rows", rows)
            .put("myplan", myplan)
    }
}
