package kr.co.fss.yeyak

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** data 폴더의 json 파일 대체 — 앱 내부 저장소. server 의 store.js 포팅. */
class Store(private val ctx: Context) {
    private val dir = File(ctx.filesDir, "data").apply { mkdirs() }
    private fun f(name: String) = File(dir, name)

    @Synchronized
    fun readText(name: String): String? = f(name).takeIf { it.exists() }?.readText()

    @Synchronized
    fun writeText(name: String, text: String) {
        val tmp = File(dir, "$name.tmp")
        tmp.writeText(text)
        tmp.renameTo(f(name))
    }

    fun sites(): JSONArray {
        val cur = readText("sites.json")
        if (cur != null) {
            val a = JSONArray(cur)
            if (a.length() > 0) return a
        }
        val seed = JSONArray(DEFAULT_SITES.toString()) // 공유 인스턴스 변형 방지용 복사본
        writeText("sites.json", seed.toString(2))
        return seed
    }

    fun saveSites(a: JSONArray) = writeText("sites.json", a.toString(2))

    fun avail(): JSONObject =
        readText("avail.json")?.let { JSONObject(it) }
            ?: JSONObject().put("updatedAt", JSONObject.NULL).put("boats", JSONArray())
                .put("byDate", JSONObject()).put("errors", JSONArray())

    fun saveAvail(o: JSONObject) = writeText("avail.json", o.toString())

    fun myplan(): JSONArray = readText("myplan.json")?.let { JSONArray(it) } ?: JSONArray()
    fun saveMyplan(a: JSONArray) = writeText("myplan.json", a.toString(2))

    companion object {
        val DEFAULT_SITES: JSONArray = JSONArray(
            """
            [
              {"id":"khan","name":"칸피싱","kind":"xe",
               "listUrl":"https://khanfishing.com/index.php?mid=bk&year={y}&month={m}&mode=list",
               "dayUrl":"https://khanfishing.com/index.php?mid=bk&year={y}&month={m}&day={d}&mode=list","enabled":true},
              {"id":"dy","name":"동양낚시","kind":"sunsang",
               "listUrl":"https://dyfishing.sunsang24.com/ship/schedule_fleet/{y}{m}",
               "dayUrl":"https://dyfishing.sunsang24.com/ship/schedule_fleet/{y}{m}","enabled":true},
              {"id":"jeil","name":"제일낚시","kind":"xe",
               "listUrl":"https://jnaksi.com/index.php?mid=bk&year={y}&month={m}&mode=list",
               "dayUrl":"https://jnaksi.com/index.php?mid=bk&year={y}&month={m}&day={d}&mode=list","enabled":true}
            ]
            """.trimIndent()
        )
    }
}
