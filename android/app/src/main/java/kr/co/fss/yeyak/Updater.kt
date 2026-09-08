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
 * GitHub Releases 최신본과 현재 설치 버전을 비교해, 새 버전이면 APK 를 내려받아
 * 시스템 패키지 설치기를 띄운다. 자동 확인은 하지 않고 화면의 "업그레이드" 버튼으로만 동작.
 *
 * 릴리스 규칙: 태그 = vX.Y (예 v2.3), 자산으로 *.apk 하나 업로드.
 */
object Updater {
    private const val API = "https://api.github.com/repos/sanohkook/FSS/releases/latest"

    /** 진행 상태를 JS(window.__fssUpstate)로 전달 */
    fun run(act: Activity, report: (JSONObject) -> Unit) {
        Thread {
            try {
                report(st("checking"))
                val res = Http.get(API, mapOf("Accept" to "application/vnd.github+json"))
                if (res.status == 404) { report(st("error").put("msg", "아직 배포된 릴리스가 없습니다")); return@Thread }
                val rel = JSONObject(res.text)
                val tag = rel.optString("tag_name").trim().removePrefix("v")
                val cur = BuildConfig.VERSION_NAME
                val asset = rel.optJSONArray("assets")?.let { arr ->
                    (0 until arr.length()).map { arr.getJSONObject(it) }
                        .firstOrNull { it.optString("name").endsWith(".apk", true) }
                }
                if (tag.isEmpty() || asset == null) { report(st("error").put("msg", "릴리스에 APK가 없습니다")); return@Thread }
                if (!newer(tag, cur)) { report(st("none").put("latest", tag).put("current", cur)); return@Thread }

                report(st("downloading").put("latest", tag).put("pct", 0))
                val apk = download(asset.getString("browser_download_url"), File(act.cacheDir, "updates").apply { mkdirs() }) { pct ->
                    report(st("downloading").put("latest", tag).put("pct", pct))
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
                report(st("install").put("latest", tag))
            } catch (e: Exception) {
                Log.w("fss", "update", e)
                report(st("error").put("msg", e.message ?: "업데이트 실패"))
            }
        }.start()
    }

    private fun st(phase: String) = JSONObject().put("phase", phase)

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
