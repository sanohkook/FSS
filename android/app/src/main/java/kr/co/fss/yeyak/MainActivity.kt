package kr.co.fss.yeyak

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar

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

        // 자동 갱신 없음 — 예약 현황은 화면의 Refresh 버튼을 눌렀을 때만 조회한다.
        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(base)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        super.onDestroy()
        server?.stop()
    }
}
