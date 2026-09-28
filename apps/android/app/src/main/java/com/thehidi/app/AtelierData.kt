package com.thehidi.app

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.UUID

data class AtelierVariant(
    val id: String,
    val size: String,
    val color: String,
    val pricePaise: Int,
    val mrpPaise: Int,
    val available: Int,
)

data class AtelierProduct(
    val slug: String,
    val name: String,
    val description: String,
    val fabric: String,
    val care: String,
    val category: String,
    val collectionSlugs: List<String>,
    val images: List<String>,
    val variants: List<AtelierVariant>,
    val minPricePaise: Int,
    val maxPricePaise: Int,
    val inStock: Boolean,
) {
    val primaryImage: String
        get() = images.firstOrNull().orEmpty()
}

data class AtelierCartItem(
    val id: String,
    val quantity: Int,
    val lineTotalPaise: Int,
    val productSlug: String,
    val productName: String,
    val productImage: String,
    val variantId: String,
    val size: String,
    val color: String,
    val available: Int,
)

data class AtelierCart(
    val subtotalPaise: Int = 0,
    val itemCount: Int = 0,
    val items: List<AtelierCartItem> = emptyList(),
)

class AtelierStore(context: Context) {
    private val prefs = context.getSharedPreferences("hidi_atelier_v2", Context.MODE_PRIVATE)

    fun cartSession(): String {
        val existing = prefs.getString("cart_session", null)
        if (!existing.isNullOrBlank()) return existing
        val created = UUID.randomUUID().toString()
        prefs.edit().putString("cart_session", created).apply()
        return created
    }

    fun savedSlugs(): Set<String> =
        prefs.getStringSet("saved_slugs", emptySet())?.toSet().orEmpty()

    fun toggleSaved(slug: String): Set<String> {
        val next = savedSlugs().toMutableSet()
        if (!next.add(slug)) next.remove(slug)
        prefs.edit().putStringSet("saved_slugs", next).apply()
        return next
    }
}

class AtelierRepository {
    @Volatile
    private var cachedProducts: List<AtelierProduct> = emptyList()

    suspend fun products(force: Boolean = false): List<AtelierProduct> = withContext(Dispatchers.IO) {
        if (!force && cachedProducts.isNotEmpty()) return@withContext cachedProducts
        val response = request("GET", BuildConfig.HIDI_API_URL + "/products")
        if (response.code !in 200..299 || response.body.isBlank()) return@withContext cachedProducts
        val array = JSONArray(response.body)
        val parsed = buildList {
            for (index in 0 until array.length()) {
                parseProduct(array.optJSONObject(index))?.let(::add)
            }
        }
        if (parsed.isNotEmpty()) cachedProducts = parsed
        parsed
    }

    suspend fun featured(): List<AtelierProduct> = withContext(Dispatchers.IO) {
        val response = request("GET", BuildConfig.HIDI_API_URL + "/products/featured?limit=8")
        if (response.code in 200..299 && response.body.isNotBlank()) {
            val array = JSONArray(response.body)
            val parsed = buildList {
                for (index in 0 until array.length()) {
                    parseProduct(array.optJSONObject(index))?.let(::add)
                }
            }
            if (parsed.isNotEmpty()) return@withContext parsed
        }
        products().take(8)
    }

    suspend fun product(slug: String): AtelierProduct? = withContext(Dispatchers.IO) {
        cachedProducts.firstOrNull { it.slug == slug }?.let { return@withContext it }
        val response = request(
            "GET",
            BuildConfig.HIDI_API_URL + "/products/" + encode(slug),
        )
        if (response.code !in 200..299 || response.body.isBlank()) return@withContext null
        parseProduct(JSONObject(response.body))
    }

    suspend fun cart(sessionId: String): AtelierCart = withContext(Dispatchers.IO) {
        val response = request("GET", cartUrl(sessionId))
        if (response.code !in 200..299 || response.body.isBlank()) return@withContext AtelierCart()
        parseCart(JSONObject(response.body))
    }

    suspend fun addToCart(sessionId: String, variantId: String): AtelierCart =
        withContext(Dispatchers.IO) {
            val payload = JSONObject()
                .put("variantId", variantId)
                .put("quantity", 1)
                .toString()
            val response = request("POST", cartUrl(sessionId) + "/items", payload)
            if (response.code !in 200..299 || response.body.isBlank()) {
                throw IllegalStateException(response.message.ifBlank { "Unable to add this piece." })
            }
            parseCart(JSONObject(response.body))
        }

    suspend fun updateCart(
        sessionId: String,
        itemId: String,
        quantity: Int,
    ): AtelierCart = withContext(Dispatchers.IO) {
        val payload = JSONObject().put("quantity", quantity).toString()
        val response = request(
            "PATCH",
            cartUrl(sessionId) + "/items/" + encode(itemId),
            payload,
        )
        if (response.code !in 200..299 || response.body.isBlank()) {
            throw IllegalStateException(response.message.ifBlank { "Unable to update your bag." })
        }
        parseCart(JSONObject(response.body))
    }

    suspend fun removeFromCart(sessionId: String, itemId: String): AtelierCart =
        withContext(Dispatchers.IO) {
            val response = request(
                "DELETE",
                cartUrl(sessionId) + "/items/" + encode(itemId),
            )
            if (response.code !in 200..299 || response.body.isBlank()) {
                throw IllegalStateException(response.message.ifBlank { "Unable to update your bag." })
            }
            parseCart(JSONObject(response.body))
        }

    private fun cartUrl(sessionId: String): String =
        BuildConfig.HIDI_API_URL + "/carts/" + encode(sessionId)

    private fun parseProduct(item: JSONObject?): AtelierProduct? {
        item ?: return null
        val slug = item.optString("slug").trim()
        if (slug.isBlank()) return null

        val images = buildList {
            val array = item.optJSONArray("images") ?: JSONArray()
            for (index in 0 until array.length()) {
                val url = array.optJSONObject(index)?.optString("url").orEmpty()
                if (url.isNotBlank()) add(resolveImage(url))
            }
        }

        val variants = buildList {
            val array = item.optJSONArray("variants") ?: JSONArray()
            for (index in 0 until array.length()) {
                val value = array.optJSONObject(index) ?: continue
                val id = value.optString("id")
                if (id.isBlank()) continue
                add(
                    AtelierVariant(
                        id = id,
                        size = value.optString("size"),
                        color = value.optString("color"),
                        pricePaise = value.optInt("pricePaise", item.optInt("minPricePaise")),
                        mrpPaise = value.optInt("mrpPaise", value.optInt("pricePaise")),
                        available = value.optInt("available"),
                    ),
                )
            }
        }

        val collections = buildList {
            val array = item.optJSONArray("collections") ?: JSONArray()
            for (index in 0 until array.length()) {
                val collection = array.optJSONObject(index)?.optString("slug").orEmpty()
                if (collection.isNotBlank()) add(collection)
            }
        }

        return AtelierProduct(
            slug = slug,
            name = item.optString("name", "HIDI"),
            description = item.optString(
                "description",
                item.optString("shortDescription"),
            ),
            fabric = item.optString("fabric"),
            care = item.optString("care"),
            category = item.optJSONObject("category")?.optString("slug").orEmpty(),
            collectionSlugs = collections,
            images = images,
            variants = variants,
            minPricePaise = item.optInt("minPricePaise"),
            maxPricePaise = item.optInt("maxPricePaise"),
            inStock = item.optBoolean("inStock", variants.any { it.available > 0 }),
        )
    }

    private fun parseCart(root: JSONObject): AtelierCart {
        val items = buildList {
            val array = root.optJSONArray("items") ?: JSONArray()
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val product = item.optJSONObject("product") ?: JSONObject()
                val variant = item.optJSONObject("variant") ?: JSONObject()
                add(
                    AtelierCartItem(
                        id = item.optString("id"),
                        quantity = item.optInt("quantity", 1),
                        lineTotalPaise = item.optInt("lineTotalPaise"),
                        productSlug = product.optString("slug"),
                        productName = product.optString("name", "HIDI"),
                        productImage = resolveImage(product.optString("image")),
                        variantId = variant.optString("id"),
                        size = variant.optString("size"),
                        color = variant.optString("color"),
                        available = variant.optInt("available"),
                    ),
                )
            }
        }
        return AtelierCart(
            subtotalPaise = root.optInt("subtotalPaise"),
            itemCount = root.optInt("itemCount", items.sumOf { it.quantity }),
            items = items,
        )
    }

    private data class HttpResult(
        val code: Int,
        val body: String,
        val message: String,
    )

    private fun request(method: String, endpoint: String, payload: String? = null): HttpResult {
        var connection: HttpURLConnection? = null
        return try {
            connection = URL(endpoint).openConnection() as HttpURLConnection
            connection.requestMethod = method
            connection.connectTimeout = 7_000
            connection.readTimeout = 12_000
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", "HIDIAtelier/2.0")

            if (payload != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                val bytes = payload.toByteArray(StandardCharsets.UTF_8)
                connection.outputStream.use { output: OutputStream -> output.write(bytes) }
            }

            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val body = if (stream == null) {
                ""
            } else {
                BufferedReader(InputStreamReader(stream)).use { reader ->
                    buildString {
                        while (true) {
                            val line = reader.readLine() ?: break
                            append(line)
                        }
                    }
                }
            }
            val apiMessage = runCatching {
                JSONObject(body).optString("message")
            }.getOrDefault("")
            HttpResult(code, body, apiMessage)
        } catch (error: Exception) {
            HttpResult(0, "", error.message.orEmpty())
        } finally {
            connection?.disconnect()
        }
    }

    private fun encode(value: String): String =
        URLEncoder.encode(value, StandardCharsets.UTF_8.name())

    companion object {
        fun resolveImage(raw: String): String {
            if (raw.isBlank()) return ""
            if (raw.startsWith("https://") || raw.startsWith("http://")) return raw
            val base = BuildConfig.HIDI_START_URL.trimEnd('/')
            return if (raw.startsWith('/')) base + raw else base + "/" + raw
        }
    }
}
