package kr.co.fss.yeyak

import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.zip.GZIPInputStream
import java.util.zip.InflaterInputStream
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

/**
 * 한국 낚시 예약 사이트용 GET 헬퍼.
 * 일부 사이트의 인증서 체인이 불완전(Missing AKI)해 표준 검증이 실패하므로,
 * 공개 읽기 전용 페이지에 한해 검증 없이 가져온다. (server/scrape/http.js 와 동일 취지)
 */
object Http {
    // sunsang24 는 모바일 UA 에 다른(축약) HTML 을 준다 → 데스크톱 호환 UA 고정
    private const val UA =
        "Mozilla/5.0 (compatible; FSS-tide-board/2.0; +https://github.com/sanohkook/FSS)"

    private val insecureSsl: javax.net.ssl.SSLSocketFactory by lazy {
        val tm = object : X509TrustManager {
            override fun checkClientTrusted(c: Array<X509Certificate>?, a: String?) {}
            override fun checkServerTrusted(c: Array<X509Certificate>?, a: String?) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
        }
        SSLContext.getInstance("TLS").apply { init(null, arrayOf(tm), SecureRandom()) }.socketFactory
    }

    data class Res(val status: Int, val text: String)

    fun get(url: String, headers: Map<String, String> = emptyMap(), timeoutMs: Int = 25000, redirects: Int = 5): Res {
        val u = URL(url)
        val conn = u.openConnection() as HttpURLConnection
        if (conn is HttpsURLConnection) {
            conn.sslSocketFactory = insecureSsl
            conn.setHostnameVerifier { _, _ -> true }
        }
        conn.instanceFollowRedirects = false
        conn.connectTimeout = timeoutMs
        conn.readTimeout = timeoutMs
        conn.setRequestProperty("User-Agent", UA)
        conn.setRequestProperty("Accept-Language", "ko,en;q=0.8")
        conn.setRequestProperty("Accept-Encoding", "gzip, deflate")
        headers.forEach { (k, v) -> conn.setRequestProperty(k, v) }

        val code = conn.responseCode
        if (code in 300..399 && redirects > 0) {
            val loc = conn.getHeaderField("Location")
            conn.disconnect()
            if (loc != null) return get(URL(u, loc).toString(), headers, timeoutMs, redirects - 1)
        }
        val raw = try {
            (if (code >= 400) conn.errorStream else conn.inputStream)?.use { input ->
                val enc = conn.contentEncoding?.lowercase()
                val stream = when (enc) {
                    "gzip" -> GZIPInputStream(input)
                    "deflate" -> InflaterInputStream(input)
                    else -> input
                }
                ByteArrayOutputStream().apply { stream.copyTo(this) }.toByteArray()
            } ?: ByteArray(0)
        } finally {
            conn.disconnect()
        }
        val ct = (conn.contentType ?: "").lowercase()
        var charset = Regex("charset=([\\w-]+)").find(ct)?.groupValues?.get(1)
        if (charset == null) {
            val head = String(raw, 0, minOf(raw.size, 2048), Charsets.ISO_8859_1).lowercase()
            if (Regex("euc-kr|ks_c_5601|cp949").containsMatchIn(head)) charset = "EUC-KR"
        }
        val text = try {
            String(raw, charset(charset ?: "UTF-8"))
        } catch (e: Exception) {
            String(raw, Charsets.UTF_8)
        }
        return Res(code, text)
    }

    fun unescapeHtml(s: String): String = s
        .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"")
        .replace(Regex("&#0?39;"), "'").replace("&apos;", "'")
        .replace("&nbsp;", " ").replace("&amp;", "&")

    fun stripTags(s: String?): String = (s ?: "")
        .replace(Regex("<br\\s*/?>", RegexOption.IGNORE_CASE), " ")
        .replace(Regex("<[^>]+>"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()
}
