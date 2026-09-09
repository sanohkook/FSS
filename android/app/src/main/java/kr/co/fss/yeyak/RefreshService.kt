package kr.co.fss.yeyak

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * 예약 현황 갱신을 포그라운드 서비스로 실행.
 * 화면을 나가거나 앱을 잠깐 백그라운드로 보내도 스크레이핑이 이어진다.
 * 상태는 companion.state 로 노출 → LocalServer 의 /api/refresh/status 가 반환.
 */
class RefreshService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIF_ID, notif("예약 현황 갱신 중…", true))
        if (!running) {
            running = true
            val startedAt = iso()
            state = JSONObject()
                .put("running", true).put("startedAt", startedAt)
                .put("finishedAt", JSONObject.NULL).put("ok", false)
                .put("summary", JSONArray()).put("message", "")
            Thread {
                var res: JSONObject? = null
                var err = ""
                try {
                    res = Scrape.refreshAll(applicationContext, Store(applicationContext))
                } catch (e: Exception) {
                    Log.w("fss", "refresh service", e)
                    err = e.message ?: "갱신 실패"
                }
                running = false
                state = JSONObject()
                    .put("running", false).put("startedAt", startedAt).put("finishedAt", iso())
                    .put("ok", res?.optBoolean("ok") ?: false)
                    .put("summary", res?.optJSONArray("summary") ?: JSONArray())
                    .put("message", if (err.isNotEmpty()) err else res?.optString("message") ?: "")
                runCatching { nm().notify(NOTIF_ID, notif("예약 현황 갱신 완료", false)) }
                stopForeground(STOP_FOREGROUND_DETACH)
                stopSelf()
            }.start()
        }
        return START_NOT_STICKY
    }

    private fun nm() = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private fun notif(text: String, ongoing: Boolean): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm().createNotificationChannel(
                NotificationChannel(CH, "예약 현황 갱신", NotificationManager.IMPORTANCE_LOW)
            )
        }
        return NotificationCompat.Builder(this, CH)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("예약현황")
            .setContentText(text)
            .setOngoing(ongoing)
            .setSilent(true)
            .setContentIntent(
                android.app.PendingIntent.getActivity(
                    this, 0, Intent(this, MainActivity::class.java),
                    android.app.PendingIntent.FLAG_IMMUTABLE
                )
            )
            .build()
    }

    private fun iso(): String {
        val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        f.timeZone = TimeZone.getTimeZone("UTC")
        return f.format(java.util.Date())
    }

    companion object {
        private const val CH = "refresh"
        private const val NOTIF_ID = 42

        @Volatile var running = false

        @Volatile
        var state: JSONObject = JSONObject().put("running", false).put("finishedAt", JSONObject.NULL)

        fun start(ctx: Context) {
            val i = Intent(ctx, RefreshService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i)
            else ctx.startService(i)
        }
    }
}
