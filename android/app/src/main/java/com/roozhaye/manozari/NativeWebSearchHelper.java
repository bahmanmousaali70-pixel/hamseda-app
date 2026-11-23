package com.roozhaye.manozari;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Direct on-device web search helper for Android APK.
 * Uses the device's own Wi-Fi / Cellular / VPN internet (no CORS, no AI Studio auth cookies)
 * to fetch live Weather (Open-Meteo), Persian/English Wikipedia summaries, and DuckDuckGo web results.
 */
public final class NativeWebSearchHelper {
    private static final String USER_AGENT = "HamsedaAndroid/1.0 (+https://tapnfc.ir)";

    private NativeWebSearchHelper() {}

    public static JSONObject search(Context ctx, String rawQuery) {
        JSONObject out = new JSONObject();
        try {
            if (!CallAnnouncerService.isNetworkConnected(ctx)) {
                out.put("ok", false);
                out.put("offline", true);
                out.put("error", "گوشی به وای‌فای یا اینترنت همراه متصل نیست.");
                return out;
            }

            String query = stripSearchWrapper(rawQuery);
            if (query.isEmpty()) {
                out.put("ok", false);
                out.put("offline", false);
                out.put("needsQuery", true);
                out.put("error", "موضوع جستجو مشخص نشد.");
                return out;
            }

            JSONArray links = new JSONArray();
            Set<String> seenUrls = new LinkedHashSet<>();
            StringBuilder answerBuilder = new StringBuilder();

            // 1. Live weather via Open-Meteo if query mentions weather
            if (isWeatherQuery(query)) {
                String weatherText = fetchWeatherAnswer(query);
                if (weatherText != null && !weatherText.isEmpty()) {
                    answerBuilder.append(weatherText);
                    addLink(links, seenUrls, "پیش‌بینی هوا در Open-Meteo", "https://open-meteo.com/");
                }
            }

            // 2. Persian Wikipedia -> English Wikipedia factual summary
            if (answerBuilder.length() == 0) {
                JSONObject wikiFa = queryWikipedia("fa", query);
                if (wikiFa != null) {
                    answerBuilder.append(wikiFa.optString("summary", ""));
                    addLink(links, seenUrls, wikiFa.optString("title", "ویکی‌پدیا فارسی"), wikiFa.optString("url", ""));
                } else {
                    JSONObject wikiEn = queryWikipedia("en", query);
                    if (wikiEn != null) {
                        answerBuilder.append(wikiEn.optString("summary", ""));
                        addLink(links, seenUrls, wikiEn.optString("title", "Wikipedia"), wikiEn.optString("url", ""));
                    }
                }
            }

            // 3. DuckDuckGo Instant Answer + HTML results (provides clickable links and snippets)
            fetchDuckDuckGo(query, answerBuilder, links, seenUrls);

            // Always ensure Google search link is included for one-tap browser view
            String googleUrl = "https://www.google.com/search?q=" + URLEncoder.encode(query, "UTF-8");
            addLink(links, seenUrls, "مشاهده نتایج کامل در گوگل: " + query, googleUrl);

            String finalText = answerBuilder.toString().trim();
            if (finalText.isEmpty()) {
                finalText = "نتایج جستجوی اینترنتی برای «" + query + "» در لینک‌های زیر آماده شد. می‌توانید روی هر لینک بزنید تا باز شود.";
            }

            out.put("ok", true);
            out.put("offline", false);
            out.put("query", query);
            out.put("replyText", finalText);
            out.put("linksJson", links.toString());
            return out;
        } catch (Exception e) {
            try {
                out.put("ok", false);
                out.put("offline", false);
                out.put("error", e.getMessage() != null ? e.getMessage() : "خطا در جستجوی اینترنتی");
            } catch (Exception ignored) {
            }
            return out;
        }
    }

    private static String stripSearchWrapper(String raw) {
        if (raw == null) return "";
        String s = raw.trim()
                .replace('ي', 'ی')
                .replace('ك', 'ک');
        s = s.replaceAll("^(?:در|توی|تو)\\s*(?:اینترنت|وب|گوگل)\\s*(?:جستجو|جست‌وجو|جست و جو|سرچ|پیدا|بگرد)\\s*(?:کن|بکن)?\\s*(?:درباره|راجع به|در مورد|از|برای)?\\s*", "");
        s = s.replaceAll("^(?:جستجو|جست‌وجو|جست و جو|سرچ|پیدا)\\s*(?:کن|بکن)?\\s*(?:در|توی|تو)?\\s*(?:اینترنت|وب|گوگل)?\\s*(?:درباره|راجع به|در مورد)?\\s*", "");
        s = s.replaceAll("\\s+(?:در|توی|تو)\\s*(?:اینترنت|وب|گوگل)\\s*(?:جستجو|جست‌وجو|جست و جو|سرچ|پیدا)\\s*(?:کن|بکن)?$", "");
        return s.trim();
    }

    private static boolean isWeatherQuery(String q) {
        String lower = q.toLowerCase(Locale.ROOT);
        return lower.contains("آب و هوا")
                || lower.contains("اب و هوا")
                || lower.contains("آب‌وهوا")
                || lower.contains("هواشناسی")
                || lower.contains("دمای هوا")
                || lower.contains("وضعیت هوا")
                || lower.contains("هوای ");
    }

    private static String fetchWeatherAnswer(String q) {
        try {
            String city = q.replaceAll("(آب و هوای|آب و هوا|اب و هوا|آب‌وهوا|هواشناسی|وضعیت هوای|وضعیت هوا|دمای هوای|دمای هوا|هوای|امروز|الان|شهر)", " ")
                    .replaceAll("\\s+", " ")
                    .trim();
            if (city.isEmpty()) city = "تهران";

            String geoUrl = "https://geocoding-api.open-meteo.com/v1/search?name="
                    + URLEncoder.encode(city, "UTF-8")
                    + "&count=1&language=fa&format=json";
            String geoRaw = httpGet(geoUrl, 7000);
            JSONObject geoJson = (geoRaw != null && !geoRaw.isEmpty()) ? new JSONObject(geoRaw) : null;
            JSONArray results = geoJson != null ? geoJson.optJSONArray("results") : null;
            if (results == null || results.length() == 0) {
                String mappedCity = mapCommonPersianCity(city);
                geoUrl = "https://geocoding-api.open-meteo.com/v1/search?name="
                        + URLEncoder.encode(mappedCity, "UTF-8")
                        + "&count=1&format=json";
                geoRaw = httpGet(geoUrl, 7000);
                geoJson = (geoRaw != null && !geoRaw.isEmpty()) ? new JSONObject(geoRaw) : null;
                results = geoJson != null ? geoJson.optJSONArray("results") : null;
            }
            if (results == null || results.length() == 0) return null;

            JSONObject place = results.getJSONObject(0);
            double lat = place.getDouble("latitude");
            double lon = place.getDouble("longitude");
            String resolvedName = place.optString("name", city);

            String forecastUrl = String.format(
                    Locale.US,
                    "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1",
                    lat, lon
            );
            String forecastRaw = httpGet(forecastUrl, 7000);
            if (forecastRaw == null || forecastRaw.isEmpty()) return null;

            JSONObject forecast = new JSONObject(forecastRaw);
            JSONObject current = forecast.optJSONObject("current_weather");
            if (current == null) return null;

            double temp = current.optDouble("temperature", 0.0);
            double wind = current.optDouble("windspeed", 0.0);
            int code = current.optInt("weathercode", 0);
            String cond = describeWmoCode(code);

            String rangeText = "";
            JSONObject daily = forecast.optJSONObject("daily");
            if (daily != null) {
                JSONArray maxArr = daily.optJSONArray("temperature_2m_max");
                JSONArray minArr = daily.optJSONArray("temperature_2m_min");
                if (maxArr != null && minArr != null && maxArr.length() > 0 && minArr.length() > 0) {
                    rangeText = " (کمینه " + Math.round(minArr.getDouble(0)) + " تا بیشینه " + Math.round(maxArr.getDouble(0)) + " درجه)";
                }
            }

            return "هوای فعلی " + resolvedName + ": " + cond + "، دمای " + Math.round(temp) + " درجه سانتی‌گراد"
                    + rangeText + " با سرعت باد " + Math.round(wind) + " کیلومتر در ساعت.";
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String mapCommonPersianCity(String city) {
        if (city.contains("تهران")) return "Tehran";
        if (city.contains("مشهد")) return "Mashhad";
        if (city.contains("اصفهان")) return "Isfahan";
        if (city.contains("شیراز")) return "Shiraz";
        if (city.contains("تبریز")) return "Tabriz";
        if (city.contains("کرج")) return "Karaj";
        if (city.contains("قم")) return "Qom";
        if (city.contains("اهواز")) return "Ahvaz";
        if (city.contains("رشت")) return "Rasht";
        if (city.contains("کرمانشاه")) return "Kermanshah";
        if (city.contains("کرمان")) return "Kerman";
        if (city.contains("همدان")) return "Hamadan";
        if (city.contains("یزد")) return "Yazd";
        if (city.contains("بندرعباس")) return "Bandar Abbas";
        if (city.contains("ارومیه")) return "Urmia";
        if (city.contains("ساری")) return "Sari";
        if (city.contains("گرگان")) return "Gorgan";
        if (city.contains("قزوین")) return "Qazvin";
        if (city.contains("زنجان")) return "Zanjan";
        if (city.contains("سنندج")) return "Sanandaj";
        if (city.contains("اردبیل")) return "Ardabil";
        if (city.contains("بوشهر")) return "Bushehr";
        return city;
    }

    private static String describeWmoCode(int code) {
        if (code == 0) return "آفتابی و صاف";
        if (code <= 2) return "کمی ابری";
        if (code == 3) return "ابری";
        if (code == 45 || code == 48) return "مه‌آلود";
        if (code >= 51 && code <= 67) return "بارانی";
        if (code >= 71 && code <= 77) return "برفی";
        if (code >= 80 && code <= 82) return "رگبار باران";
        if (code >= 95) return "رعدوبرق";
        return "نیمه‌ابری";
    }

    private static JSONObject queryWikipedia(String lang, String query) {
        try {
            String searchUrl = "https://" + lang + ".wikipedia.org/w/api.php?action=query&list=search&srsearch="
                    + URLEncoder.encode(query, "UTF-8")
                    + "&srlimit=2&utf8=1&format=json";
            String raw = httpGet(searchUrl, 7000);
            if (raw == null || raw.isEmpty()) return null;

            JSONObject json = new JSONObject(raw);
            JSONObject qObj = json.optJSONObject("query");
            if (qObj == null) return null;
            JSONArray searchArr = qObj.optJSONArray("search");
            if (searchArr == null || searchArr.length() == 0) return null;

            String topTitle = searchArr.getJSONObject(0).optString("title", "").trim();
            if (topTitle.isEmpty()) return null;

            String extractUrl = "https://" + lang + ".wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exsentences=3&titles="
                    + URLEncoder.encode(topTitle, "UTF-8")
                    + "&utf8=1&format=json";
            String extRaw = httpGet(extractUrl, 7000);
            if (extRaw == null || extRaw.isEmpty()) return null;

            JSONObject extJson = new JSONObject(extRaw);
            JSONObject pages = extJson.getJSONObject("query").getJSONObject("pages");
            JSONArray pageIds = pages.names();
            if (pageIds == null || pageIds.length() == 0) return null;

            JSONObject page = pages.getJSONObject(pageIds.getString(0));
            String extract = page.optString("extract", "").replaceAll("\\s+", " ").trim();
            if (extract.isEmpty()) return null;
            if (extract.length() > 420) extract = extract.substring(0, 417) + "...";

            JSONObject result = new JSONObject();
            result.put("title", topTitle + " (ویکی‌پدیا)");
            result.put("summary", extract);
            result.put("url", "https://" + lang + ".wikipedia.org/wiki/" + URLEncoder.encode(topTitle.replace(' ', '_'), "UTF-8"));
            return result;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static void fetchDuckDuckGo(String query, StringBuilder answerBuilder, JSONArray links, Set<String> seenUrls) {
        try {
            String htmlUrl = "https://html.duckduckgo.com/html/?q=" + URLEncoder.encode(query, "UTF-8");
            String html = httpGet(htmlUrl, 7500);
            if (html != null && !html.isEmpty()) {
                Pattern itemPattern = Pattern.compile(
                        "<a[^>]*class=\"result__a\"[^>]*href=\"([^\"]+)\"[^>]*>(.*?)</a>",
                        Pattern.CASE_INSENSITIVE | Pattern.DOTALL
                );
                Pattern snippetPattern = Pattern.compile(
                        "<a[^>]*class=\"result__snippet\"[^>]*>(.*?)</a>",
                        Pattern.CASE_INSENSITIVE | Pattern.DOTALL
                );

                Matcher mLink = itemPattern.matcher(html);
                Matcher mSnip = snippetPattern.matcher(html);
                StringBuilder snippetsSummary = new StringBuilder();
                int count = 0;

                while (mLink.find() && count < 4) {
                    String rawHref = decodeHtmlEntities(mLink.group(1));
                    String cleanTitle = stripHtmlTags(decodeHtmlEntities(mLink.group(2))).trim();
                    String resolvedUrl = extractDuckDuckGoTarget(rawHref);
                    String snip = mSnip.find() ? stripHtmlTags(decodeHtmlEntities(mSnip.group(1))).trim() : "";

                    if (!cleanTitle.isEmpty() && resolvedUrl.startsWith("http")) {
                        addLink(links, seenUrls, cleanTitle, resolvedUrl);
                        if (answerBuilder.length() == 0 && !snip.isEmpty() && count < 2) {
                            if (snippetsSummary.length() > 0) snippetsSummary.append(" · ");
                            snippetsSummary.append(snip);
                        }
                        count++;
                    }
                }
                if (answerBuilder.length() == 0 && snippetsSummary.length() > 0) {
                    String s = snippetsSummary.toString();
                    if (s.length() > 420) s = s.substring(0, 417) + "...";
                    answerBuilder.append(s);
                }
            }
        } catch (Exception ignored) {
        }

        if (answerBuilder.length() == 0) {
            try {
                String apiUrl = "https://api.duckduckgo.com/?q=" + URLEncoder.encode(query, "UTF-8")
                        + "&format=json&no_html=1&skip_disambig=1";
                String raw = httpGet(apiUrl, 6000);
                if (raw != null && raw.startsWith("{")) {
                    JSONObject ddg = new JSONObject(raw);
                    String abs = ddg.optString("AbstractText", "").trim();
                    String absUrl = ddg.optString("AbstractURL", "").trim();
                    if (!abs.isEmpty()) {
                        answerBuilder.append(abs.length() > 400 ? abs.substring(0, 397) + "..." : abs);
                        if (absUrl.startsWith("http")) {
                            addLink(links, seenUrls, ddg.optString("Heading", query), absUrl);
                        }
                    }
                }
            } catch (Exception ignored) {
            }
        }
    }

    private static String extractDuckDuckGoTarget(String href) {
        if (href == null) return "";
        String clean = href.trim();
        if (clean.startsWith("//")) clean = "https:" + clean;
        int idx = clean.indexOf("uddg=");
        if (idx >= 0) {
            String sub = clean.substring(idx + 5);
            int amp = sub.indexOf('&');
            if (amp >= 0) sub = sub.substring(0, amp);
            try {
                return URLDecoder.decode(sub, "UTF-8");
            } catch (Exception ignored) {
            }
        }
        return clean;
    }

    private static void addLink(JSONArray links, Set<String> seenUrls, String title, String url) {
        if (url == null || url.trim().isEmpty()) return;
        String cleanUrl = url.trim();
        if (!(cleanUrl.startsWith("https://") || cleanUrl.startsWith("http://"))) return;
        if (seenUrls.contains(cleanUrl) || links.length() >= 6) return;
        seenUrls.add(cleanUrl);
        try {
            JSONObject obj = new JSONObject();
            String t = (title != null && !title.trim().isEmpty()) ? title.trim() : cleanUrl;
            obj.put("title", t.length() > 70 ? t.substring(0, 67) + "..." : t);
            obj.put("url", cleanUrl);
            links.put(obj);
        } catch (Exception ignored) {
        }
    }

    private static String stripHtmlTags(String html) {
        return html == null ? "" : html.replaceAll("<[^>]+>", " ").replaceAll("\\s+", " ").trim();
    }

    private static String decodeHtmlEntities(String s) {
        if (s == null) return "";
        return s.replace("&amp;", "&")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&nbsp;", " ");
    }

    private static String httpGet(String urlStr, int timeoutMs) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(timeoutMs);
            conn.setReadTimeout(timeoutMs);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("User-Agent", USER_AGENT);
            conn.setRequestProperty("Accept", "application/json,text/html,*/*");
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) return null;
            BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line).append('\n');
                if (sb.length() > 220_000) break;
            }
            br.close();
            return sb.toString();
        } catch (Exception ignored) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static JSONObject getNetworkSnapshot(Context ctx) {
        JSONObject out = new JSONObject();
        try {
            boolean connected = CallAnnouncerService.isNetworkConnected(ctx);
            boolean vpnActive = false;
            String networkType = "unknown";
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Network active = cm.getActiveNetwork();
                NetworkCapabilities caps = active != null ? cm.getNetworkCapabilities(active) : null;
                if (caps != null) {
                    vpnActive = caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN);
                    if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) networkType = "wifi";
                    else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) networkType = "cellular";
                    else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) networkType = "ethernet";
                    else if (vpnActive) networkType = "vpn";
                }
            }
            out.put("connected", connected);
            out.put("vpnActive", vpnActive);
            out.put("networkType", networkType);
        } catch (Exception ignored) {
            try { out.put("connected", false); out.put("vpnActive", false); out.put("networkType", "unknown"); }
            catch (Exception alsoIgnored) {}
        }
        return out;
    }

    public static JSONObject checkConnectivityAndServer(Context ctx, String serverBaseUrl) {
        JSONObject out = new JSONObject();
        try {
            JSONObject net = getNetworkSnapshot(ctx);
            boolean netConnected = net.optBoolean("connected", false);
            boolean vpnActive = net.optBoolean("vpnActive", false);
            String networkType = net.optString("networkType", "unknown");

            boolean serverOk = false;
            boolean aiReady = false;
            int httpCode = 0;
            boolean authRedirect = false;
            String error = "";
            boolean deviceOnline = netConnected;

            String base = serverBaseUrl != null ? serverBaseUrl.trim().replaceAll("/+$", "") : "";
            if (netConnected && !base.isEmpty()) {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL(base + "/api/health");
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(6000);
                    conn.setReadTimeout(6000);
                    conn.setInstanceFollowRedirects(false);
                    conn.setRequestProperty("User-Agent", USER_AGENT);
                    conn.setRequestProperty("Accept", "application/json");
                    httpCode = conn.getResponseCode();
                    if (httpCode >= 200 && httpCode < 300) {
                        deviceOnline = true;
                        BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                        StringBuilder sb = new StringBuilder();
                        String line;
                        while ((line = br.readLine()) != null) {
                            sb.append(line);
                            if (sb.length() > 16384) break;
                        }
                        br.close();
                        String body = sb.toString().trim();
                        if (body.startsWith("{")) {
                            JSONObject health = new JSONObject(body);
                            serverOk = health.optBoolean("ok", false);
                            aiReady = health.optBoolean("aiReady", false);
                        }
                    } else if (httpCode >= 300 && httpCode < 400) {
                        deviceOnline = true;
                        String loc = conn.getHeaderField("Location");
                        if (loc != null && (loc.contains("cookie_check") || loc.contains("accounts.google") || loc.contains("signin"))) {
                            authRedirect = true;
                        }
                    } else if (httpCode > 0) {
                        deviceOnline = true;
                    }
                } catch (Exception e) {
                    error = e.getMessage() != null ? e.getMessage() : "خطای شبکه";
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }

            out.put("ok", true);
            out.put("deviceOnline", deviceOnline);
            out.put("vpnActive", vpnActive);
            out.put("networkType", networkType);
            out.put("serverOk", serverOk);
            out.put("aiReady", aiReady);
            out.put("httpCode", httpCode);
            out.put("authRedirect", authRedirect);
            out.put("error", error);
        } catch (Exception e) {
            try {
                out.put("ok", false);
                out.put("deviceOnline", false);
                out.put("serverOk", false);
                out.put("error", e.getMessage() != null ? e.getMessage() : "خطا در بررسی شبکه");
            } catch (Exception ignored) {
            }
        }
        return out;
    }
}
