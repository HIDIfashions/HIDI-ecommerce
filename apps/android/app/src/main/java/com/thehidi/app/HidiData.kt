package com.thehidi.app

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.UUID

data class HidiVariant(
    val id: String,
    val size: String,
    val color: String,
    val pricePaise: Int,
    val available: Int,
    val bustMm: Int? = null,
    val waistMm: Int? = null,
    val hipMm: Int? = null,
    val shoulderMm: Int? = null,
    val sleeveLengthMm: Int? = null,
    val garmentLengthMm: Int? = null,
)

data class HidiProduct(
    val id: String,
    val slug: String,
    val name: String,
    val description: String,
    val fabric: String,
    val care: String,
    val category: String,
    val minPricePaise: Int,
    val maxPricePaise: Int,
    val inStock: Boolean,
    val soldQuantity: Int,
    val averageRating: Double,
    val reviewCount: Int,
    val images: List<String>,
    val variants: List<HidiVariant>,
    val collections: List<String>,
) {
    val primaryImage: String get() = images.firstOrNull().orEmpty()
    val colours: List<String> get() = variants.map { it.color }.filter { it.isNotBlank() }.distinct()
    val sizes: List<String> get() = variants.map { it.size }.filter { it.isNotBlank() }.distinct()
}

data class HidiCartItem(
    val id: String,
    val quantity: Int,
    val lineTotalPaise: Int,
    val productSlug: String,
    val productName: String,
    val productImage: String,
    val size: String,
    val color: String,
    val available: Int,
)

data class HidiCart(
    val subtotalPaise: Int = 0,
    val itemCount: Int = 0,
    val items: List<HidiCartItem> = emptyList(),
)

class HidiStore(context: Context) {
    private val prefs = context.getSharedPreferences("hidi_v3", Context.MODE_PRIVATE)

    fun cartSession(): String {
        val existing = prefs.getString("cart_session", null)
        if (!existing.isNullOrBlank()) return existing
        return UUID.randomUUID().toString().also {
            prefs.edit().putString("cart_session", it).apply()
        }
    }

    fun saved(): Set<String> = prefs.getStringSet("saved", emptySet())?.toSet().orEmpty()

    fun toggleSaved(slug: String): Boolean {
        val values = saved().toMutableSet()
        val nowSaved = if (slug in values) {
            values.remove(slug)
            false
        } else {
            values.add(slug)
            true
        }
        prefs.edit().putStringSet("saved", values).apply()
        return nowSaved
    }

    fun recentSearches(): List<String> =
        prefs.getString("recent_searches", "")
            .orEmpty()
            .split("|||")
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .take(6)

    fun saveSearch(value: String) {
        val clean = value.trim()
        if (clean.length < 2) return
        val next = (listOf(clean) + recentSearches().filterNot { it.equals(clean, true) }).take(6)
        prefs.edit().putString("recent_searches", next.joinToString("|||")).apply()
    }
}

class HidiRepository(private val store: HidiStore) {
    suspend fun products(): List<HidiProduct> = withContext(Dispatchers.IO) {
        val body = request("GET", "${BuildConfig.HIDI_API_URL}/products") ?: return@withContext emptyList()
        parseProductList(body)
    }

    suspend fun featured(): List<HidiProduct> = withContext(Dispatchers.IO) {
        val body = request("GET", "${BuildConfig.HIDI_API_URL}/products/featured?limit=8")
            ?: return@withContext emptyList()
        parseProductList(body)
    }

    suspend fun bestSellers(): List<HidiProduct> = withContext(Dispatchers.IO) {
        val body = request("GET", "${BuildConfig.HIDI_API_URL}/products/best-sellers?limit=8")
            ?: return@withContext emptyList()
        parseProductList(body)
    }

    suspend fun related(slug: String): List<HidiProduct> = withContext(Dispatchers.IO) {
        val body = request("GET", "${BuildConfig.HIDI_API_URL}/products/${encode(slug)}/related?limit=6")
            ?: return@withContext emptyList()
        parseProductList(body)
    }

    suspend fun cart(): HidiCart = withContext(Dispatchers.IO) {
        val body = request("GET", cartUrl()) ?: return@withContext HidiCart()
        parseCart(body)
    }

    suspend fun addToCart(variantId: String): HidiCart = withContext(Dispatchers.IO) {
        val payload = JSONObject().put("variantId", variantId).put("quantity", 1).toString()
        val body = request("POST", "${cartUrl()}/items", payload) ?: return@withContext cart()
        parseCart(body)
    }

    suspend fun updateCart(itemId: String, quantity: Int): HidiCart = withContext(Dispatchers.IO) {
        val payload = JSONObject().put("quantity", quantity).toString()
        val body = request("PATCH", "${cartUrl()}/items/${encode(itemId)}", payload)
            ?: return@withContext cart()
        parseCart(body)
    }

    suspend fun removeCart(itemId: String): HidiCart = withContext(Dispatchers.IO) {
        val body = request("DELETE", "${cartUrl()}/items/${encode(itemId)}")
            ?: return@withContext cart()
        parseCart(body)
    }

    private fun cartUrl() = "${BuildConfig.HIDI_API_URL}/carts/${encode(store.cartSession())}"

    private fun parseProductList(body: String): List<HidiProduct> = runCatching {
        val array = JSONArray(body)
        buildList {
            for (i in 0 until array.length()) parseProduct(array.optJSONObject(i))?.let(::add)
        }
    }.getOrDefault(emptyList())

    private fun parseProduct(item: JSONObject?): HidiProduct? {
        item ?: return null
        val slug = item.optString("slug")
        if (slug.isBlank()) return null

        val images = buildList {
            val array = item.optJSONArray("images")
            if (array != null) {
                for (i in 0 until array.length()) {
                    val url = array.optJSONObject(i)?.optString("url").orEmpty()
                    if (url.isNotBlank()) add(url)
                }
            }
        }

        val variants = buildList {
            val array = item.optJSONArray("variants")
            if (array != null) {
                for (i in 0 until array.length()) {
                    val v = array.optJSONObject(i) ?: continue
                    fun optionalInt(key: String): Int? =
                        if (v.has(key) && !v.isNull(key)) v.optInt(key) else null
                    add(
                        HidiVariant(
                            id = v.optString("id"),
                            size = v.optString("size"),
                            color = v.optString("color"),
                            pricePaise = v.optInt("pricePaise", item.optInt("minPricePaise")),
                            available = v.optInt("available"),
                            bustMm = optionalInt("bustMm"),
                            waistMm = optionalInt("waistMm"),
                            hipMm = optionalInt("hipMm"),
                            shoulderMm = optionalInt("shoulderMm"),
                            sleeveLengthMm = optionalInt("sleeveLengthMm"),
                            garmentLengthMm = optionalInt("garmentLengthMm"),
                        )
                    )
                }
            }
        }

        val collections = buildList {
            val array = item.optJSONArray("collections")
            if (array != null) {
                for (i in 0 until array.length()) {
                    val c = array.optJSONObject(i)?.optString("slug").orEmpty()
                    if (c.isNotBlank()) add(c)
                }
            }
        }

        val category = item.optJSONObject("category")?.optString("slug").orEmpty()

        return HidiProduct(
            id = item.optString("id"),
            slug = slug,
            name = item.optString("name", "HIDI"),
            description = item.optString("description", item.optString("shortDescription", "")),
            fabric = item.optString("fabric"),
            care = item.optString("care"),
            category = category,
            minPricePaise = item.optInt("minPricePaise"),
            maxPricePaise = item.optInt("maxPricePaise", item.optInt("minPricePaise")),
            inStock = item.optBoolean("inStock", true),
            soldQuantity = item.optInt("soldQuantity"),
            averageRating = item.optDouble("averageRating"),
            reviewCount = item.optInt("reviewCount"),
            images = images,
            variants = variants,
            collections = collections,
        )
    }

    private fun parseCart(body: String): HidiCart = runCatching {
        val root = JSONObject(body)
        val array = root.optJSONArray("items")
        val items = buildList {
            if (array != null) {
                for (i in 0 until array.length()) {
                    val item = array.optJSONObject(i) ?: continue
                    val product = item.optJSONObject("product")
                    val variant = item.optJSONObject("variant")
                    add(
                        HidiCartItem(
                            id = item.optString("id"),
                            quantity = item.optInt("quantity", 1),
                            lineTotalPaise = item.optInt("lineTotalPaise"),
                            productSlug = product?.optString("slug").orEmpty(),
                            productName = product?.optString("name", "HIDI") ?: "HIDI",
                            productImage = product?.optString("image").orEmpty(),
                            size = variant?.optString("size").orEmpty(),
                            color = variant?.optString("color").orEmpty(),
                            available = variant?.optInt("available") ?: 0,
                        )
                    )
                }
            }
        }
        HidiCart(
            subtotalPaise = root.optInt("subtotalPaise"),
            itemCount = root.optInt("itemCount", items.sumOf { it.quantity }),
            items = items,
        )
    }.getOrDefault(HidiCart())

    private fun request(method: String, endpoint: String, payload: String? = null): String? {
        val connection = (URL(endpoint).openConnection() as HttpURLConnection)
        return try {
            connection.requestMethod = method
            connection.connectTimeout = 7_000
            connection.readTimeout = 10_000
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", "HIDIAndroid/3.0")
            if (payload != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(payload.toByteArray(StandardCharsets.UTF_8)) }
            }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }
            if (code in 200..299) text else null
        } catch (_: Exception) {
            null
        } finally {
            connection.disconnect()
        }
    }

    private fun encode(value: String): String =
        runCatching { java.net.URLEncoder.encode(value, "UTF-8") }.getOrDefault(value)
}
