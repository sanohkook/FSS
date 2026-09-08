package kr.co.fss.yeyak

import android.content.Context
import org.json.JSONObject
import java.util.Calendar

/** data/tide.json (KHOA 인천 조석예보, 2026–2027) → 날짜별 파생값. server/tide.js 포팅. */
object Tide {
    private val WD = arrayOf("일", "월", "화", "수", "목", "금", "토")
    private val SARI = setOf("7물", "8물")
    private val MID = setOf("5물", "6물", "9물", "10물")

    // 대한민국 공휴일 (대체공휴일 포함) 2026–2027
    private val HOLIDAYS = mapOf(
        "2026-01-01" to "신정",
        "2026-02-16" to "설날 연휴", "2026-02-17" to "설날", "2026-02-18" to "설날 연휴",
        "2026-03-01" to "삼일절", "2026-03-02" to "대체공휴일",
        "2026-05-05" to "어린이날",
        "2026-05-24" to "부처님오신날", "2026-05-25" to "대체공휴일",
        "2026-06-06" to "현충일",
        "2026-08-15" to "광복절", "2026-08-17" to "대체공휴일",
        "2026-09-24" to "추석 연휴", "2026-09-25" to "추석", "2026-09-26" to "추석 연휴",
        "2026-10-03" to "개천절", "2026-10-05" to "대체공휴일",
        "2026-10-09" to "한글날",
        "2026-12-25" to "성탄절",
        "2027-01-01" to "신정",
        "2027-02-06" to "설날 연휴", "2027-02-07" to "설날", "2027-02-08" to "설날 연휴", "2027-02-09" to "대체공휴일",
        "2027-03-01" to "삼일절",
        "2027-05-05" to "어린이날",
        "2027-05-13" to "부처님오신날",
        "2027-06-06" to "현충일",
        "2027-08-15" to "광복절", "2027-08-16" to "대체공휴일",
        "2027-09-14" to "추석 연휴", "2027-09-15" to "추석", "2027-09-16" to "추석 연휴",
        "2027-10-03" to "개천절", "2027-10-04" to "대체공휴일",
        "2027-10-09" to "한글날", "2027-10-11" to "대체공휴일",
        "2027-12-25" to "성탄절", "2027-12-27" to "대체공휴일",
    )

    private var cache: JSONObject? = null
    fun load(ctx: Context): JSONObject {
        cache?.let { return it }
        val txt = ctx.assets.open("tide.json").bufferedReader().use { it.readText() }
        return JSONObject(txt).also { cache = it }
    }

    fun mulTier(mul: String?): String = when {
        SARI.contains(mul) -> "sari"
        MID.contains(mul) -> "mid"
        else -> ""
    }

    fun daysInMonth(month: String): Int {
        val (y, m) = month.split("-").map { it.toInt() }
        val c = Calendar.getInstance()
        c.set(y, m, 1) // m 은 1-based → Calendar 다음 달 0일 = m월 말일
        c.set(Calendar.DAY_OF_MONTH, 0)
        return c.get(Calendar.DAY_OF_MONTH)
    }

    fun weekday(iso: String): String {
        val (y, m, d) = iso.split("-").map { it.toInt() }
        val c = Calendar.getInstance()
        c.set(y, m - 1, d)
        return WD[c.get(Calendar.DAY_OF_WEEK) - 1]
    }

    /** server/tide.js tideRow 와 동일 필드 */
    fun row(tide: JSONObject, iso: String): JSONObject {
        val wd = weekday(iso)
        val holiday = HOLIDAYS[iso]
        val o = JSONObject()
        o.put("date", iso)
        o.put("weekday", wd)
        o.put("holiday", holiday ?: JSONObject.NULL)
        val rec = tide.optJSONObject(iso)
        if (rec == null) {
            o.put("lunar", JSONObject.NULL); o.put("mul", ""); o.put("mulTier", "")
            o.put("flow", JSONObject.NULL); o.put("flowLabel", ""); o.put("est", false)
            return o
        }
        val est = rec.optInt("e", 0) == 1
        val f = if (rec.has("f")) rec.optInt("f") else -1
        val x = rec.optString("x", "")
        val flowLabel = when {
            x.isNotEmpty() -> x
            est -> "≈$f%"
            else -> "$f%"
        }
        o.put("lunar", if (rec.has("l")) rec.optInt("l") else JSONObject.NULL)
        o.put("mul", rec.optString("m", ""))
        o.put("mulTier", mulTier(rec.optString("m", "")))
        o.put("flow", if (f >= 0) f else JSONObject.NULL)
        o.put("flowLabel", flowLabel)
        o.put("est", est)
        return o
    }
}
