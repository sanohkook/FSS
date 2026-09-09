package kr.co.fss.yeyak

import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/**
 * 맥 없이 앱 단독 동작.
 * 앱 안에서 작은 HTTP 서버(LocalServer)를 띄우고, WebView 로 그 화면을 연다.
 * 스크레이핑·물때·저장 전부 앱이 처리 (server/ 로직 포팅).
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var bar: ProgressBar
    private var server: LocalServer? = null
    private val port = 8765
    private val base get() = "http://127.0.0.1:$port"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        try {
            server = LocalServer(applicationContext, port).apply { start(10000, false) }
        } catch (e: Exception) {
            Log.w("fss", "server start", e)
        }

        val root = FrameLayout(this)
        web = WebView(this)
        bar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, 6)
        }
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        root.addView(bar)
        setContentView(root)

        // 상태바·네비게이션바(제스처 바 포함)·디스플레이 컷아웃을 가리지 않도록 안전영역만큼 패딩
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.decorView.setBackgroundColor(0xFFFFFFFF.toInt())
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            v.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = false
            displayZoomControls = false
            setSupportZoom(false)
            textZoom = 100
            cacheMode = WebSettings.LOAD_NO_CACHE
        }
        web.addJavascriptInterface(Bridge(), "FssNative")
        if (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(v: WebView?, p: Int) {
                bar.progress = p
                bar.visibility = if (p in 1..99) View.VISIBLE else View.GONE
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, req: WebResourceRequest): Boolean {
                val url = req.url.toString()
                if (url.startsWith(base)) return false
                return runCatching {
                    startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, req.url)); true
                }.getOrDefault(false)
            }
        }

        // 갱신 알림(포그라운드 서비스)용 권한 — Android 13+
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            runCatching { requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 7) }
        }

        // 앱 업데이트 후 첫 실행이면 WebView 캐시를 비운다 (오래된 화면 방지)
        val sp = getSharedPreferences("fss", MODE_PRIVATE)
        if (sp.getInt("lastVc", -1) != BuildConfig.VERSION_CODE) {
            web.clearCache(true)
            sp.edit().putInt("lastVc", BuildConfig.VERSION_CODE).apply()
        }

        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(base)

        // 로딩 시 git 'avail' 브랜치(맥이 1시간마다 갱신)에서 예약현황을 받아온다.
        // 스크레이핑 아님 — 작은 JSON 다운로드. 실패하면 기존 캐시 유지. Refresh 버튼은 직접 재조회.
        Thread {
            val changed = runCatching { RemoteSync.pull(Store(applicationContext)) }.getOrDefault(false)
            if (changed) runOnUiThread { web.reload() }
        }.start()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    private var lastBackAt = 0L

    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        if (web.canGoBack()) { web.goBack(); return }
        val now = System.currentTimeMillis()
        if (now - lastBackAt < 2000) { super.onBackPressed(); return }
        lastBackAt = now
        Toast.makeText(this, "한 번 더 누르면 종료", Toast.LENGTH_SHORT).show()
    }

    override fun onDestroy() {
        super.onDestroy()
        server?.stop()
    }

    /** WebView(로컬 화면) ↔ 앱 브리지 — 업그레이드용 */
    inner class Bridge {
        @JavascriptInterface
        fun appVersion(): String = BuildConfig.VERSION_NAME

        private fun relay(js: String) = runOnUiThread {
            web.evaluateJavascript("window.__fssUpstate&&window.__fssUpstate($js)", null)
        }

        /** 로딩 시 조용히 새 버전 확인 */
        @JavascriptInterface
        fun checkUpdate() = Updater.check(this@MainActivity) { relay(it.toString()) }

        /** "업그레이드" 버튼 — 내려받아 설치 */
        @JavascriptInterface
        fun upgrade() = Updater.run(this@MainActivity) { relay(it.toString()) }
    }
}
