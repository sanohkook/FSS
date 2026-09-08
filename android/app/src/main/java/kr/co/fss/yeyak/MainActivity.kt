package kr.co.fss.yeyak

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.text.InputType
import android.view.Menu
import android.view.MenuItem
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar

/**
 * 인천 예약현황 웹앱을 감싸는 WebView 컨테이너.
 * 스크레이핑은 맥에서 도는 Node 서버가 하므로, 이 앱은 그 서버 주소를 열기만 한다.
 * 서버 주소는 첫 실행 시 물어보고 SharedPreferences 에 저장. 메뉴에서 언제든 변경.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var bar: ProgressBar
    private val prefs by lazy { getSharedPreferences("fss", Context.MODE_PRIVATE) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

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
            setSupportZoom(true)
            cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(v: WebView?, p: Int) {
                bar.progress = p
                bar.visibility = if (p in 1..99) android.view.View.VISIBLE else android.view.View.GONE
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, req: WebResourceRequest): Boolean {
                // 예약 사이트 등 외부 링크는 기본 브라우저로
                val host = req.url.host ?: return false
                val serverHost = runCatching { android.net.Uri.parse(serverUrl()).host }.getOrNull()
                return if (host == serverHost) false else {
                    runCatching { startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, req.url)) }
                    true
                }
            }

            override fun onReceivedError(v: WebView, req: WebResourceRequest, err: WebResourceError) {
                if (req.isForMainFrame) showError()
            }
        }

        if (savedInstanceState != null) web.restoreState(savedInstanceState)

        val stored = prefs.getString("server", null)
        if (stored.isNullOrBlank()) askServer(true) else web.loadUrl(stored)
    }

    private fun serverUrl() = prefs.getString("server", "") ?: ""

    private fun askServer(first: Boolean) {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            hint = "http://192.168.0.10:3300"
            setText(prefs.getString("server", "http://") ?: "http://")
        }
        val pad = (16 * resources.displayMetrics.density).toInt()
        val box = LinearLayout(this).apply { setPadding(pad, pad / 2, pad, 0); addView(input) }
        AlertDialog.Builder(this)
            .setTitle("예약현황 서버 주소")
            .setMessage("맥에서 `npm start` 로 띄운 서버 주소를 입력하세요. (같은 와이파이의 맥 IP:3300)")
            .setView(box)
            .setCancelable(!first)
            .setPositiveButton("연결") { _, _ ->
                var u = input.text.toString().trim().trimEnd('/')
                if (u.isNotEmpty() && !u.startsWith("http")) u = "http://$u"
                if (u.isNotEmpty()) {
                    prefs.edit().putString("server", u).apply()
                    web.loadUrl(u)
                }
            }
            .apply { if (!first) setNegativeButton("취소", null) }
            .show()
    }

    private fun showError() {
        web.loadData(
            """
            <html><head><meta name=viewport content="width=device-width,initial-scale=1">
            <style>body{font-family:sans-serif;background:#0d181d;color:#e0ebee;display:flex;
            height:100vh;margin:0;align-items:center;justify-content:center;text-align:center}
            a{color:#2bb6d4}</style></head><body><div>
            <h3>서버에 연결할 수 없습니다</h3>
            <p>${serverUrl()}</p>
            <p>맥에서 서버가 켜져 있는지, 폰과 같은 와이파이인지 확인하세요.<br>
            메뉴(⋮) → <b>서버 주소</b> 에서 주소를 바꿀 수 있습니다.</p>
            </div></body></html>
            """.trimIndent(), "text/html", "utf-8"
        )
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menu.add(0, 1, 0, "새로고침")
        menu.add(0, 2, 1, "서버 주소")
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean = when (item.itemId) {
        1 -> { web.reload(); true }
        2 -> { askServer(false); true }
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
}
