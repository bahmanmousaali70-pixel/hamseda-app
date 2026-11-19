package com.roozhaye.manozari

import java.text.Normalizer

/**
 * Clean-room Persian TTS front-end preprocessor for Sherpa-ONNX Piper models:
 * - Arabic-to-Persian character folding and ZWNJ cleanup
 * - Jalali date expansion (e.g. ۱۴۰۴/۳/۱۲) and time/currency/percent expansion
 * - Full Persian integer & decimal number-to-words conversion
 * - Optional spoken Tehran Persian ("Goftari") rewrite rules
 * - Short-vowel pronunciation hints for eSpeak-NG edge cases
 * - Clause/sentence chunking for low-latency streaming synthesis
 */
object PersianSpeechProcessor {

    private val PERSIAN_MONTHS = arrayOf(
        "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
        "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"
    )

    private val ONES = arrayOf("", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه")
    private val TEENS = arrayOf("ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده")
    private val TENS = arrayOf("", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود")
    private val HUNDREDS = arrayOf("", "صد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد")

    private val GOFTARI_PHRASES: List<Pair<Regex, String>> = listOf(
        Regex("\\bمی‌خواهم\\b|\\bمی خواهم\\b") to "میخوام",
        Regex("\\bمی‌خواهی\\b|\\bمی خواهی\\b") to "میخوای",
        Regex("\\bمی‌خواهد\\b|\\bمی خواهد\\b") to "میخواد",
        Regex("\\bمی‌خواهیم\\b|\\bمی خواهیم\\b") to "میخوایم",
        Regex("\\bمی‌خواهید\\b|\\bمی خواهید\\b") to "میخواین",
        Regex("\\bمی‌خواهند\\b|\\bمی خواهند\\b") to "میخوان",
        Regex("\\bنمی‌خواهم\\b|\\bنمی خواهم\\b") to "نمیخوام",
        Regex("\\bنمی‌دانم\\b|\\bنمی دانم\\b") to "نمیدونم",
        Regex("\\bمی‌دانم\\b|\\bمی دانم\\b") to "میدونم",
        Regex("\\bنمی‌توانم\\b|\\bنمی توانم\\b") to "نمیتونم",
        Regex("\\bمی‌توانم\\b|\\bمی توانم\\b") to "میتونم",
        Regex("\\bنمی‌شود\\b|\\bنمی شود\\b") to "نمیشه",
        Regex("\\bمی‌شود\\b|\\bمی شود\\b") to "میشه",
        Regex("\\bمی‌گویم\\b|\\bمی گویم\\b") to "میگم",
        Regex("\\bمی‌گوید\\b|\\bمی گوید\\b") to "میگه",
        Regex("\\bمی‌کند\\b|\\bمی کند\\b") to "میکنه",
        Regex("\\bنمی‌کند\\b|\\bنمی کند\\b") to "نمیکنه",
        Regex("\\bمی‌دهد\\b|\\bمی دهد\\b") to "میده",
        Regex("\\bدارد\\b") to "داره",
        Regex("\\bندارد\\b") to "نداره",
        Regex("\\bنیست\\b") to "نیس",
        Regex("\\bآنها\\b") to "اونا",
        Regex("\\bاینها\\b") to "اینا",
        Regex("\\bچطور است\\b") to "چطوره",
        Regex("\\bخوب است\\b") to "خوبه",
        Regex("\\bعالی است\\b") to "عالیه",
        Regex("\\bآماده است\\b") to "آماده‌اس",
        Regex("\\bبسیار خوب\\b") to "خیلی خب",
        Regex("\\bاگر\\b") to "اگه",
        Regex("\\bزیرا\\b") to "چون",
        Regex("\\bهم‌اکنون\\b|\\bاکنون\\b") to "الان"
    )

    private val LEXICON_FIXES: List<Pair<Regex, String>> = listOf(
        // Help eSpeak-NG read frequent Persian number/homograph words cleanly
        Regex("\\bنه\\b(?=[\\s،.؟!]|$)") to "نُه",
        Regex("\\bدرصد\\b") to "دَرصَد",
        Regex("\\bچطور\\b") to "چِطور"
    )

    @JvmStatic
    fun prepareForSynthesis(rawText: String, goftariMode: Boolean): String {
        if (rawText.isBlank()) return ""
        var t = Normalizer.normalize(rawText, Normalizer.Form.NFC)
        t = t.replace('ي', 'ی')
            .replace('ى', 'ی')
            .replace('ك', 'ک')
            .replace('ة', 'ه')
            .replace('أ', 'ا')
            .replace('إ', 'ا')
            .replace('ٱ', 'ا')
            .replace("ـ", "")

        t = toAsciiDigits(t)

        // Transliterate any embedded Latin fragments when sentence contains Persian
        if (Regex("[\\u0600-\\u06FF]").containsMatchIn(t) && Regex("[A-Za-z]").containsMatchIn(t)) {
            t = FinglishPhoneticHelper.transliterateToPersianPhonetic(t)
        }

        // Expand Jalali dates like 1404/9/15 or 1404-03-12
        t = Regex("\\b(1[34]\\d{2})[/\\-](\\d{1,2})[/\\-](\\d{1,2})\\b").replace(t) { m ->
            val year = m.groupValues[1].toLongOrNull() ?: return@replace m.value
            val month = m.groupValues[2].toIntOrNull() ?: return@replace m.value
            val day = m.groupValues[3].toIntOrNull() ?: return@replace m.value
            if (month in 1..12 && day in 1..31) {
                " ${numberToWords(day.toLong())} ${PERSIAN_MONTHS[month - 1]} ${numberToWords(year)} "
            } else {
                m.value
            }
        }

        // Expand clock times like 08:30 or 8:05
        t = Regex("\\b(\\d{1,2}):(\\d{2})\\b").replace(t) { m ->
            val hour = m.groupValues[1].toLongOrNull() ?: return@replace m.value
            val min = m.groupValues[2].toLongOrNull() ?: return@replace m.value
            if (hour in 0..23 && min in 0..59) {
                if (min == 0L) " ساعت ${numberToWords(hour)} "
                else " ساعت ${numberToWords(hour)} و ${numberToWords(min)} دقیقه "
            } else {
                m.value
            }
        }

        // Expand currency symbols attached to numbers
        t = Regex("(\\$|€|£)\\s*(\\d+(?:\\.\\d+)?)").replace(t) { m ->
            val unit = when (m.groupValues[1]) {
                "$" -> "دلار"
                "€" -> "یورو"
                "£" -> "پوند"
                else -> ""
            }
            " ${expandNumberToken(m.groupValues[2])} $unit "
        }

        // Expand percent symbols
        t = t.replace("٪", " درصد ").replace("%", " درصد ")

        // Expand decimal and integer numbers
        t = Regex("(\\d+)(?:[.,٫](\\d+))?").replace(t) { m ->
            val whole = m.groupValues[1]
            val frac = m.groupValues[2]
            if (frac.isNotEmpty()) {
                " ${expandDecimal(whole, frac)} "
            } else {
                " ${expandNumberToken(whole)} "
            }
        }

        if (goftariMode) {
            for ((regex, replacement) in GOFTARI_PHRASES) {
                t = regex.replace(t, replacement)
            }
        }

        for ((regex, replacement) in LEXICON_FIXES) {
            t = regex.replace(t, replacement)
        }

        t = t.replace(Regex("\\s+"), " ").trim()
        return t
    }

    @JvmStatic
    fun splitSentences(text: String): List<String> {
        if (text.isBlank()) return emptyList()
        val rawChunks = text.split(Regex("(?<=[.!؟؛\\n])\\s+"))
        val out = ArrayList<String>()
        for (chunk in rawChunks) {
            val clean = chunk.trim()
            if (clean.isEmpty()) continue
            if (clean.length <= 130) {
                out.add(clean)
            } else {
                // Split long sentence gently on Persian comma or conjunctions for faster streaming TTFB
                val sub = clean.split(Regex("(?<=[،:])\\s+"))
                for (s in sub) {
                    val trimmed = s.trim()
                    if (trimmed.isNotEmpty()) out.add(trimmed)
                }
            }
        }
        return if (out.isEmpty()) listOf(text.trim()) else out
    }

    private fun toAsciiDigits(input: String): String {
        val sb = StringBuilder(input.length)
        for (ch in input) {
            when (ch) {
                in '۰'..'۹' -> sb.append(('0'.code + (ch.code - '۰'.code)).toChar())
                in '٠'..'٩' -> sb.append(('0'.code + (ch.code - '٠'.code)).toChar())
                else -> sb.append(ch)
            }
        }
        return sb.toString()
    }

    private fun expandDecimal(whole: String, frac: String): String {
        val w = whole.toLongOrNull()?.let { numberToWords(it) } ?: whole
        val trimmedFrac = frac.trimEnd('0')
        if (trimmedFrac.isEmpty()) return w
        val fNum = trimmedFrac.toLongOrNull() ?: return "$w ممیز $trimmedFrac"
        val unit = when (trimmedFrac.length) {
            1 -> "دهم"
            2 -> "صدم"
            3 -> "هزارم"
            else -> ""
        }
        val fWords = numberToWords(fNum)
        return if (unit.isNotEmpty()) "$w ممیز $fWords $unit" else "$w ممیز $fWords"
    }

    private fun expandNumberToken(raw: String): String {
        if (raw.length > 12) {
            return raw.map { ch ->
                val d = ch.digitToIntOrNull() ?: -1
                if (d == 0) "صفر" else if (d in 1..9) ONES[d] else ""
            }.filter { it.isNotEmpty() }.joinToString(" ")
        }
        val value = raw.toLongOrNull() ?: return raw
        return numberToWords(value)
    }

    private fun underThousand(n: Int): String {
        if (n == 0) return ""
        var rem = n
        val parts = ArrayList<String>(3)
        if (rem >= 100) {
            parts.add(HUNDREDS[rem / 100])
            rem %= 100
        }
        if (rem >= 20) {
            parts.add(TENS[rem / 10])
            rem %= 10
        }
        if (rem in 10..19) {
            parts.add(TEENS[rem - 10])
            rem = 0
        }
        if (rem > 0) {
            parts.add(ONES[rem])
        }
        return parts.joinToString(" و ")
    }

    private fun numberToWords(nInput: Long): String {
        if (nInput == 0L) return "صفر"
        var n = nInput
        val parts = ArrayList<String>()
        val scales = listOf(
            1_000_000_000_000L to "تریلیون",
            1_000_000_000L to "میلیارد",
            1_000_000L to "میلیون",
            1_000L to "هزار"
        )
        for ((scale, name) in scales) {
            if (n >= scale) {
                val count = (n / scale).toInt()
                n %= scale
                val head = if (count == 1 && scale == 1000L) "" else "${underThousand(count)} "
                parts.add("$head$name".trim())
            }
        }
        if (n > 0) {
            parts.add(underThousand(n.toInt()))
        }
        return parts.joinToString(" و ")
    }
}
