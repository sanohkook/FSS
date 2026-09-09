package kr.co.fss.yeyak

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * GitHub Releases 최신본과 현재 설치 버전을 비교한다.
 *  - check(): 로딩 시 조용히 확인 → 새 버전이 있으면 phase "available"
 *  - run():   "업그레이드" 버튼 → APK 내려받아 시스템 패키지 설치기 실행
 * 자동 확인/설치는 없음.
 *
 * 릴리스 규칙: 태그 = vX.Y (예 v2.3), 자산으로 *.apk 하나.
 */
object Updater {
    // 1순위: raw (사실상 무제한). release.sh 가 'release' 브랜치에 {version, apk} 를 올린다.
    private const val LATEST_JSON =
        "https://raw.githubusercontent.com/sanohkook/FSS/release/latest.json"
    // 폴백: GitHub API (비인증 시간당 60회)
    private const val API = "https://api.github.com/repos/sanohkook/FSS/releases/latest"

    private data class Rel(val tag: String, val apkUrl: String)

    /** 새 버전 여부만 확인. 결과 phase: available | none | error */
    fun check(act: Activity, report: (JSONObject) -> Unit) {
        Thread {
            try {
                val rel = latest()
                if (rel == null) report(st("none"))
                else report(st("available").put("latest", rel.tag).put("current", BuildConfig.VERSION_NAME))
            } catch (e: Exception) {
                Log.w("fss", "update check", e)
                report(st("error").put("msg", e.message ?: "확인 실패"))
            }
        }.start()
    }

    /** 최신 APK 를 내려받아 설치 화면을 띄운다. */
    fun run(act: Activity, report: (JSONObject) -> Unit) {
        Thread {
            try {
                report(st("checking"))
                val rel = latest() ?: run {
                    report(st("error").put("msg", "받을 수 있는 새 버전이 없습니다")); return@Thread
                }

                report(st("downloading").put("latest", rel.tag).put("pct", 0))
                val apk = download(rel.apkUrl, File(act.cacheDir, "updates").apply { mkdirs() }) { pct ->
                    report(st("downloading").put("latest", rel.tag).put("pct", pct))
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !act.packageManager.canRequestPackageInstalls()) {
                    report(st("permission"))
                    act.startActivity(
                        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + act.packageName))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                    return@Thread
                }
                install(act, apk)
                report(st("install").put("latest", rel.tag))
            } catch (e: Exception) {
                Log.w("fss", "update", e)
                report(st("error").put("msg", e.message ?: "업데이트 실패"))
            }
        }.start()
    }

    private fun st(phase: String) = JSONObject().put("phase", phase)

    /** 최신 릴리스가 현재보다 높으면 Rel, 아니면 null. raw 먼저, 실패 시에만 API. */
    private fun latest(): Rel? {
        val res = runCatching {
            Http.get(LATEST_JSON, mapOf("Accept" to "application/json"), timeoutMs = 12000)
        }.getOrNull()
        if (res != null && res.status == 200) {
            return try {
                val o = JSONObject(res.text)
                val v = o.optString("version").trim().removePrefix("v")
                val apk = o.optString("apk")
                Log.i("fss", "update(raw): $v vs ${BuildConfig.VERSION_NAME}")
                if (v.isNotEmpty() && apk.isNotEmpty() && newer(v, BuildConfig.VERSION_NAME)) Rel(v, apk) else null
            } catch (e: Exception) {
                Log.w("fss", "latest.json 파싱 실패 → API", e); latestFromApi()
            }
        }
        return latestFromApi()
    }

    private fun latestFromApi(): Rel? {
        val res = Http.get(API, mapOf("Accept" to "application/vnd.github+json"))
        if (res.status == 404) return null
        val rel = JSONObject(res.text)
        val tag = rel.optString("tag_name").trim().removePrefix("v")
        val asset = rel.optJSONArray("assets")?.let { arr ->
            (0 until arr.length()).map { arr.getJSONObject(it) }
                .firstOrNull { it.optString("name").endsWith(".apk", true) }
        }
        Log.i("fss", "update(api): tag=$tag current=${BuildConfig.VERSION_NAME} asset=${asset?.optString("name")}")
        if (tag.isEmpty() || asset == null) return null
        if (!newer(tag, BuildConfig.VERSION_NAME)) return null
        return Rel(tag, asset.getString("browser_download_url"))
    }

    /** a(최신) 가 b(현재) 보다 높은 버전인가 — 점 구분 숫자 비교 */
    private fun newer(a: String, b: String): Boolean {
        val pa = a.split(".").map { it.toIntOrNull() ?: 0 }
        val pb = b.split(".").map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(pa.size, pb.size)) {
            val x = pa.getOrElse(i) { 0 }; val y = pb.getOrElse(i) { 0 }
            if (x != y) return x > y
        }
        return false
    }

    private fun download(url: String, dir: File, onPct: (Int) -> Unit): File {
        val out = File(dir, "fss-update.apk")
        (URL(url).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = true
            connectTimeout = 20000
            readTimeout = 60000
            setRequestProperty("User-Agent", "FSS-updater")
        }.let { conn ->
            try {
                val total = conn.contentLengthLong
                conn.inputStream.use { input ->
                    out.outputStream().use { fout ->
                        val buf = ByteArray(64 * 1024)
                        var read: Int; var done = 0L; var lastPct = -1
                        while (input.read(buf).also { read = it } >= 0) {
                            fout.write(buf, 0, read); done += read
                            if (total > 0) {
                                val pct = (done * 100 / total).toInt()
                                if (pct != lastPct) { lastPct = pct; onPct(pct) }
                            }
                        }
                    }
                }
            } finally { conn.disconnect() }
        }
        return out
    }

    private fun install(act: Activity, apk: File) {
        val uri = FileProvider.getUriForFile(act, act.packageName + ".fileprovider", apk)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        act.startActivity(intent)
    }
}
