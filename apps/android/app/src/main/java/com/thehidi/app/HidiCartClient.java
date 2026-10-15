package com.thehidi.app;

import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class HidiCartClient {
    interface CartCallback {
        void onResult(Cart cart, String error);
    }

    static final class Item {
        final String id;
        final int quantity;
        final int lineTotalPaise;
        final String productSlug;
        final String productName;
        final String productImage;
        final String variantId;
        final String size;
        final String color;
        final int available;

        Item(
                String id,
                int quantity,
                int lineTotalPaise,
                String productSlug,
                String productName,
                String productImage,
                String variantId,
                String size,
                String color,
                int available
        ) {
            this.id = id;
            this.quantity = quantity;
            this.lineTotalPaise = lineTotalPaise;
            this.productSlug = productSlug;
            this.productName = productName;
            this.productImage = productImage;
            this.variantId = variantId;
            this.size = size;
            this.color = color;
            this.available = available;
        }
    }

    static final class Cart {
        final int subtotalPaise;
        final int itemCount;
        final List<Item> items;

        Cart(int subtotalPaise, int itemCount, List<Item> items) {
            this.subtotalPaise = subtotalPaise;
            this.itemCount = itemCount;
            this.items = items;
        }
    }

    private final HidiAppStore store;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newFixedThreadPool(2);

    HidiCartClient(HidiAppStore store) {
        this.store = store;
    }

    String sessionId() {
        return store.cartSession();
    }

    void load(CartCallback callback) {
        executor.execute(() -> {
            Response response = request("GET", cartUrl(), null);
            Cart cart = response.body == null ? null : parseCart(response.body);
            main.post(() -> callback.onResult(cart, response.error));
        });
    }

    void add(String variantId, CartCallback callback) {
        JSONObject body = new JSONObject();
        try {
            body.put("variantId", variantId);
            body.put("quantity", 1);
        } catch (Exception ignored) {}

        executor.execute(() -> {
            Response response = request("POST", cartUrl() + "/items", body.toString());
            Cart cart = response.body == null ? null : parseCart(response.body);
            main.post(() -> callback.onResult(cart, response.error));
        });
    }

    void update(String itemId, int quantity, CartCallback callback) {
        JSONObject body = new JSONObject();
        try {
            body.put("quantity", quantity);
        } catch (Exception ignored) {}

        executor.execute(() -> {
            Response response = request("PATCH", cartUrl() + "/items/" + encode(itemId), body.toString());
            Cart cart = response.body == null ? null : parseCart(response.body);
            main.post(() -> callback.onResult(cart, response.error));
        });
    }

    void remove(String itemId, CartCallback callback) {
        executor.execute(() -> {
            Response response = request("DELETE", cartUrl() + "/items/" + encode(itemId), null);
            Cart cart = response.body == null ? null : parseCart(response.body);
            main.post(() -> callback.onResult(cart, response.error));
        });
    }

    private String cartUrl() {
        return BuildConfig.HIDI_API_URL + "/carts/" + encode(sessionId());
    }

    private Response request(String method, String endpoint, String payload) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(7000);
            connection.setReadTimeout(10000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "HIDIAndroid/1.2");

            if (payload != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(bytes);
                }
            }

            int code = connection.getResponseCode();
            java.io.InputStream stream = code >= 200 && code < 300
                    ? connection.getInputStream()
                    : connection.getErrorStream();

            StringBuilder body = new StringBuilder();
            if (stream != null) {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream))) {
                    String line;
                    while ((line = reader.readLine()) != null) body.append(line);
                }
            }

            if (code < 200 || code >= 300) {
                String message = "Unable to update your bag.";
                try {
                    JSONObject error = new JSONObject(body.toString());
                    String apiMessage = error.optString("message", "");
                    if (!apiMessage.isEmpty()) message = apiMessage;
                } catch (Exception ignored) {}
                return new Response(null, message);
            }

            return new Response(body.toString(), null);
        } catch (Exception ignored) {
            return new Response(null, "We could not reach HIDI. Please try again.");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private Cart parseCart(String body) {
        try {
            JSONObject root = new JSONObject(body);
            List<Item> items = new ArrayList<>();
            JSONArray array = root.optJSONArray("items");
            if (array != null) {
                for (int i = 0; i < array.length(); i++) {
                    JSONObject item = array.optJSONObject(i);
                    if (item == null) continue;

                    JSONObject product = item.optJSONObject("product");
                    JSONObject variant = item.optJSONObject("variant");

                    items.add(new Item(
                            item.optString("id", ""),
                            item.optInt("quantity", 1),
                            item.optInt("lineTotalPaise", 0),
                            product == null ? "" : product.optString("slug", ""),
                            product == null ? "HIDI" : product.optString("name", "HIDI"),
                            product == null ? "" : product.optString("image", ""),
                            variant == null ? "" : variant.optString("id", ""),
                            variant == null ? "" : variant.optString("size", ""),
                            variant == null ? "" : variant.optString("color", ""),
                            variant == null ? 0 : variant.optInt("available", 0)
                    ));
                }
            }

            return new Cart(
                    root.optInt("subtotalPaise", 0),
                    root.optInt("itemCount", items.size()),
                    items
            );
        } catch (Exception ignored) {
            return new Cart(0, 0, Collections.emptyList());
        }
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

    private static final class Response {
        final String body;
        final String error;

        Response(String body, String error) {
            this.body = body;
            this.error = error;
        }
    }
}
