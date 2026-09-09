package kr.co.fss.yeyak

import android.util.Log
import org.json.JSONObject

/**
 * 맥이 1시간마다 스크레이핑해 git 'avail' 브랜치에 올린 예약현황을 받아온다.
 * 앱은 스스로 스크레이핑하지 않고 이걸 쓴다 (Refresh 버튼만 직접 재조회 — Scrape.refreshAll).
 * 실패하면 기존 캐시(store.avail) 유지.
 */
object RemoteSync {
    private const val URL =
        "https://raw.githubusercontent.com/sanohkook/FSS/avail/avail.json"

    /** 원격 avail 을 받아 저장. 갱신되면 true. */
    fun pull(store: Store): Boolean {
        return try {
            val res = Http.get(URL, mapOf("Accept" to "application/json"), timeoutMs = 15000)
            if (res.status != 200) { Log.i("fss", "remote avail HTTP ${res.status}"); return false }
            val obj = JSONObject(res.text)
            if (!obj.has("byDate")) { Log.w("fss", "remote avail: byDate 없음"); return false }
            val prev = store.avail().optString("updatedAt", "")
            val now = obj.optString("updatedAt", "")
            // 로컬(앱에서 직접 Refresh 한 결과)이 더 최신이면 원격으로 덮어쓰지 않는다.
            // ISO8601(UTC) 이라 문자열 비교 = 시간 비교.
            if (prev.isNotEmpty() && now.isNotEmpty() && now <= prev) {
                Log.i("fss", "remote avail 무시: 로컬($prev) ≥ 원격($now)")
                return false
            }
            store.saveAvail(obj)
            Log.i("fss", "remote avail 적용: $prev → $now (배 ${obj.optJSONArray("boats")?.length() ?: 0})")
            prev != now
        } catch (e: Exception) {
            Log.w("fss", "remote avail 실패", e)
            false
        }
    }
}
