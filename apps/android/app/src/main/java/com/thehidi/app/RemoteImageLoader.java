package com.thehidi.app;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.LruCache;
import android.widget.ImageView;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class RemoteImageLoader {
    private final Activity activity;
    private final ExecutorService executor = Executors.newFixedThreadPool(4);
    private final LruCache<String, Bitmap> memoryCache;

    RemoteImageLoader(Activity activity) {
        this.activity = activity;
        int cacheSizeKb = Math.max(8 * 1024, (int) (Runtime.getRuntime().maxMemory() / 1024L / 16L));
        memoryCache = new LruCache<String, Bitmap>(cacheSizeKb) {
            @Override
            protected int sizeOf(String key, Bitmap bitmap) {
                return bitmap.getByteCount() / 1024;
            }
        };
    }

    void load(ImageView target, String rawUrl, int placeholderColor) {
        final String url = resolve(rawUrl);
        target.setTag(url);
        target.setBackgroundColor(placeholderColor);

        Bitmap cached = memoryCache.get(url);
        if (cached != null) {
            target.setAlpha(1f);
            target.setImageBitmap(cached);
            return;
        }

        target.setAlpha(0.42f);
        executor.execute(() -> {
            Bitmap bitmap = download(url);
            if (bitmap == null) return;
            memoryCache.put(url, bitmap);

            activity.runOnUiThread(() -> {
                Object tag = target.getTag();
                if (tag == null || !url.equals(tag.toString())) return;
                target.setImageBitmap(bitmap);
                target.animate().alpha(1f).setDuration(220L).start();
            });
        });
    }

    private Bitmap download(String url) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(7000);
            connection.setReadTimeout(9000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("User-Agent", "HIDIAndroid/1.1");
            connection.connect();

            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) return null;

            try (InputStream input = connection.getInputStream()) {
                return BitmapFactory.decodeStream(input);
            }
        } catch (Exception ignored) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private String resolve(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) return BuildConfig.HIDI_START_URL;
        if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) return rawUrl;

        String root = BuildConfig.HIDI_START_URL;
        if (root.endsWith("/")) root = root.substring(0, root.length() - 1);
        return rawUrl.startsWith("/") ? root + rawUrl : root + "/" + rawUrl;
    }

    void shutdown() {
        executor.shutdownNow();
    }
}
