package kr.co.fss.yeyak

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
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
            // 이미 떠 있거나 포트 충돌 — 무시하고 진행
        }

        val root = FrameLayout(this)
        web = WebView(this)
        bar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, 8)
        }
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        root.addView(bar)
        setContentView(root)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = true
            displayZoomControls = false
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
                // 예약 사이트 등 외부 링크는 기본 브라우저로
                return runCatching {
                    startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, req.url)); true
                }.getOrDefault(false)
            }
        }

        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(base)
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menu.add(0, 1, 0, "다시 불러오기")
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean = when (item.itemId) {
        1 -> { web.loadUrl(base); true }
        else -> super.onOptionsItemSelected(item)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    @Deprecated("back")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        super.onDestroy()
        server?.stop()
    }
}
