package com.thehidi.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class HidiCatalog {
    interface ProductsCallback {
        void onResult(List<Product> products);
    }

    interface ProductCallback {
        void onResult(Product product);
    }

    static final class Variant {
        final String id;
        final String size;
        final String color;
        final int pricePaise;
        final int available;

        Variant(String id, String size, String color, int pricePaise, int available) {
            this.id = id;
            this.size = size;
            this.color = color;
            this.pricePaise = pricePaise;
            this.available = available;
        }
    }

    static final class Product {
        final String slug;
        final String name;
        final String description;
        final String fabric;
        final String care;
        final String category;
        final int minPricePaise;
        final int maxPricePaise;
        final boolean inStock;
        final List<String> images;
        final List<Variant> variants;
        final List<String> collections;

        Product(
                String slug,
                String name,
                String description,
                String fabric,
                String care,
                String category,
                int minPricePaise,
                int maxPricePaise,
                boolean inStock,
                List<String> images,
                List<Variant> variants,
                List<String> collections
        ) {
            this.slug = slug;
            this.name = name;
            this.description = description;
            this.fabric = fabric;
            this.care = care;
            this.category = category;
            this.minPricePaise = minPricePaise;
            this.maxPricePaise = maxPricePaise;
            this.inStock = inStock;
            this.images = images;
            this.variants = variants;
            this.collections = collections;
        }

        String primaryImage() {
            return images.isEmpty() ? "" : images.get(0);
        }
    }

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newFixedThreadPool(3);
    private volatile List<Product> cached = Collections.emptyList();

    void products(ProductsCallback callback) {
        if (!cached.isEmpty()) {
            callback.onResult(cached);
            return;
        }

        executor.execute(() -> {
            List<Product> result = fetchList(BuildConfig.HIDI_API_URL + "/products");
            if (!result.isEmpty()) cached = result;
            main.post(() -> callback.onResult(result));
        });
    }

    void featured(ProductsCallback callback) {
        executor.execute(() -> {
            List<Product> result = fetchList(BuildConfig.HIDI_API_URL + "/products/featured?limit=8");
            if (result.isEmpty() && !cached.isEmpty()) {
                result = new ArrayList<>(cached.subList(0, Math.min(cached.size(), 8)));
            }
            List<Product> finalResult = result;
            main.post(() -> callback.onResult(finalResult));
        });
    }

    void product(String slug, ProductCallback callback) {
        executor.execute(() -> {
            Product product = fetchOne(BuildConfig.HIDI_API_URL + "/products/" + encode(slug));
            main.post(() -> callback.onResult(product));
        });
    }

    private List<Product> fetchList(String endpoint) {
        try {
            String body = get(endpoint);
            if (body == null) return Collections.emptyList();
            JSONArray array = new JSONArray(body);
            List<Product> products = new ArrayList<>();
            for (int i = 0; i < array.length(); i++) {
                Product product = parseProduct(array.optJSONObject(i));
                if (product != null) products.add(product);
            }
            return products;
        } catch (Exception ignored) {
            return Collections.emptyList();
        }
    }

    private Product fetchOne(String endpoint) {
        try {
            String body = get(endpoint);
            if (body == null) return null;
            return parseProduct(new JSONObject(body));
        } catch (Exception ignored) {
            return null;
        }
    }

    private String get(String endpoint) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setConnectTimeout(7000);
            connection.setReadTimeout(10000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "HIDIAndroid/1.2");
            int code = connection.getResponseCode();
            if (code < 200 || code >= 300) return null;

            StringBuilder body = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
            }
            return body.toString();
        } catch (Exception ignored) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private Product parseProduct(JSONObject item) {
        if (item == null) return null;

        String slug = item.optString("slug", "");
        if (slug.isEmpty()) return null;

        List<String> images = new ArrayList<>();
        JSONArray imageArray = item.optJSONArray("images");
        if (imageArray != null) {
            for (int i = 0; i < imageArray.length(); i++) {
                JSONObject image = imageArray.optJSONObject(i);
                String url = image == null ? "" : image.optString("url", "");
                if (!url.isEmpty()) images.add(url);
            }
        }

        List<Variant> variants = new ArrayList<>();
        JSONArray variantArray = item.optJSONArray("variants");
        if (variantArray != null) {
            for (int i = 0; i < variantArray.length(); i++) {
                JSONObject variant = variantArray.optJSONObject(i);
                if (variant == null) continue;
                variants.add(new Variant(
                        variant.optString("id", ""),
                        variant.optString("size", ""),
                        variant.optString("color", ""),
                        variant.optInt("pricePaise", item.optInt("minPricePaise", 0)),
                        variant.optInt("available", 0)
                ));
            }
        }

        List<String> collections = new ArrayList<>();
        JSONArray collectionArray = item.optJSONArray("collections");
        if (collectionArray != null) {
            for (int i = 0; i < collectionArray.length(); i++) {
                JSONObject collection = collectionArray.optJSONObject(i);
                String value = collection == null ? "" : collection.optString("slug", "");
                if (!value.isEmpty()) collections.add(value);
            }
        }

        JSONObject category = item.optJSONObject("category");

        return new Product(
                slug,
                item.optString("name", "HIDI"),
                item.optString("description", item.optString("shortDescription", "")),
                item.optString("fabric", ""),
                item.optString("care", ""),
                category == null ? "" : category.optString("slug", ""),
                item.optInt("minPricePaise", 0),
                item.optInt("maxPricePaise", 0),
                item.optBoolean("inStock", true),
                images,
                variants,
                collections
        );
    }

    private String encode(String value) {
        try {
            return java.net.URLEncoder.encode(value, "UTF-8");
        } catch (Exception ignored) {
            return value;
        }
    }

    void shutdown() {
        executor.shutdownNow();
    }
}

final class HidiAppStore {
    private static final String PREFS = "hidi_app";
    private static final String SAVED = "saved_slugs";
    private static final String CART = "cart_session";

    private final SharedPreferences prefs;

    HidiAppStore(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    String cartSession() {
        String value = prefs.getString(CART, "");
        if (value == null || value.isEmpty()) {
            value = UUID.randomUUID().toString();
            prefs.edit().putString(CART, value).apply();
        }
        return value;
    }

    Set<String> saved() {
        return new LinkedHashSet<>(prefs.getStringSet(SAVED, Collections.emptySet()));
    }

    boolean isSaved(String slug) {
        return saved().contains(slug);
    }

    boolean toggleSaved(String slug) {
        Set<String> values = saved();
        boolean nowSaved;
        if (values.contains(slug)) {
            values.remove(slug);
            nowSaved = false;
        } else {
            values.add(slug);
            nowSaved = true;
        }
        prefs.edit().putStringSet(SAVED, values).apply();
        return nowSaved;
    }
}
