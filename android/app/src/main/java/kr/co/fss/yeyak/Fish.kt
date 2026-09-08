package kr.co.fss.yeyak

/** server/scrape/http.js detectFish 포팅. 공지사항 + 낚시종류 텍스트에서 대상 어종 추출. */
object Fish {
    private val TABLE: List<Pair<String, Regex>> = listOf(
        "주꾸미" to Regex("주꾸미|쭈꾸미|쭈갑"),
        "갑오징어" to Regex("갑오징어|갑오징|무늬오징어"),
        "한치" to Regex("한치"),
        "오징어" to Regex("물오징어|(?<![갑한늬])오징어"),
        "광어" to Regex("광어|넙치"),
        "우럭" to Regex("우럭|조피볼락"),
        "참돔" to Regex("참돔"),
        "돌돔" to Regex("돌돔"),
        "감성돔" to Regex("감성돔"),
        "농어" to Regex("농어"),
        "삼치" to Regex("삼치"),
        "부시리" to Regex("부시리"),
        "방어" to Regex("방어"),
        "대구" to Regex("대구"),
        "열기" to Regex("열기|불볼락"),
        "가자미" to Regex("가자미|도다리"),
        "학꽁치" to Regex("학꽁치|꽁치"),
        "문어" to Regex("문어"),
        "볼락" to Regex("볼락"),
        "쥐노래미" to Regex("쥐노래미|노래미"),
        "망상어" to Regex("망상어"),
        "숭어" to Regex("숭어"),
    )

    fun detect(text: String?, hint: String? = null): String {
        val src = "${hint ?: ""} ${Http.stripTags(text ?: "")}"
        val found = ArrayList<String>(3)
        for ((name, re) in TABLE) {
            if (re.containsMatchIn(src) && !found.contains(name)) found.add(name)
            if (found.size >= 3) break
        }
        return found.joinToString("·")
    }
}
