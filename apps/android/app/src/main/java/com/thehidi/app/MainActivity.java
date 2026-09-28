package com.thehidi.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.util.Locale;

public final class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 1001;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureSystemBars();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#F8EEE4"));
        setContentView(webView);

        configureWebView();

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else if (!loadDeepLink(getIntent())) {
            webView.loadUrl(BuildConfig.HIDI_START_URL);
        }
    }

    private void configureSystemBars() {
        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#591D20"));
        window.setNavigationBarColor(Color.parseColor("#F8EEE4"));
        window.getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " HIDIAndroid/1.0");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        settings.setSafeBrowsingEnabled(true);

        webView.setWebViewClient(new HidiWebViewClient());
        webView.setWebChromeClient(new HidiWebChromeClient());

        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) ->
                openExternal(Uri.parse(url)));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        loadDeepLink(intent);
    }

    private boolean loadDeepLink(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) {
            return false;
        }

        Uri data = intent.getData();
        if (data == null || !isHidiHost(data.getHost())) {
            return false;
        }

        if (webView != null) {
            webView.loadUrl(data.toString());
            return true;
        }
        return false;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) {
            webView.saveState(outState);
        }
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST && filePathCallback != null) {
            Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private boolean handleUri(Uri uri) {
        if (uri == null) {
            return false;
        }

        String scheme = lower(uri.getScheme());

        if ("hidi".equals(scheme) && "retry".equals(lower(uri.getHost()))) {
            webView.loadUrl(BuildConfig.HIDI_START_URL);
            return true;
        }

        if ("http".equals(scheme) || "https".equals(scheme)) {
            String host = lower(uri.getHost());
            if (isHidiHost(host) || isRazorpayHost(host)) {
                return false;
            }
            openExternal(uri);
            return true;
        }

        if ("intent".equals(scheme)) {
            openIntentUri(uri.toString());
            return true;
        }

        openExternal(uri);
        return true;
    }

    private void openIntentUri(String rawUri) {
        try {
            Intent intent = Intent.parseUri(rawUri, Intent.URI_INTENT_SCHEME);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.setComponent(null);
            intent.setSelector(null);
            startActivity(intent);
        } catch (Exception error) {
            try {
                Intent parsed = Intent.parseUri(rawUri, Intent.URI_INTENT_SCHEME);
                String fallback = parsed.getStringExtra("browser_fallback_url");
                if (fallback != null) {
                    Uri fallbackUri = Uri.parse(fallback);
                    if ("http".equals(lower(fallbackUri.getScheme())) ||
                            "https".equals(lower(fallbackUri.getScheme()))) {
                        webView.loadUrl(fallback);
                        return;
                    }
                }
            } catch (Exception ignored) {
                // The branded toast below is the final fallback.
            }
            Toast.makeText(this, R.string.no_compatible_app, Toast.LENGTH_SHORT).show();
        }
    }

    private void openExternal(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, R.string.no_compatible_app, Toast.LENGTH_SHORT).show();
        }
    }

    private static boolean isHidiHost(String host) {
        String normalized = lower(host);
        return "thehidi.com".equals(normalized) || normalized.endsWith(".thehidi.com");
    }

    private static boolean isRazorpayHost(String host) {
        String normalized = lower(host);
        return "razorpay.com".equals(normalized)
                || normalized.endsWith(".razorpay.com")
                || "rzp.io".equals(normalized)
                || normalized.endsWith(".rzp.io");
    }

    private static String lower(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }

    private void showErrorPage(String message) {
        String safeMessage = message == null || message.trim().isEmpty()
                ? getString(R.string.connection_error_detail)
                : message.replace("&", "&amp;")
                         .replace("<", "&lt;")
                         .replace(">", "&gt;");

        String html = "<!doctype html><html><head>"
                + "<meta name='viewport' content='width=device-width,initial-scale=1'>"
                + "<style>"
                + "body{margin:0;min-height:100vh;display:grid;place-items:center;padding:28px;"
                + "background:#F8EEE4;color:#241415;font-family:Arial,sans-serif;text-align:center}"
                + "main{max-width:420px}h1{margin:0 0 12px;color:#591D20;font-size:32px}"
                + "p{line-height:1.55;margin:0 0 22px}a{display:inline-block;padding:13px 22px;"
                + "background:#591D20;color:white;text-decoration:none;border-radius:3px;font-weight:700}"
                + "</style></head><body><main>"
                + "<h1>HIDI</h1><p>" + safeMessage + "</p>"
                + "<a href='hidi://retry'>Try again</a>"
                + "</main></body></html>";

        webView.loadDataWithBaseURL(BuildConfig.HIDI_START_URL, html, "text/html", "UTF-8", null);
    }

    private final class HidiWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleUri(request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleUri(Uri.parse(url));
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            CookieManager.getInstance().flush();
            super.onPageFinished(view, url);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                CharSequence description = error.getDescription();
                showErrorPage(description == null ? null : description.toString());
            }
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
            if (request.isForMainFrame() && errorResponse.getStatusCode() >= 500) {
                showErrorPage(getString(R.string.server_error_detail));
            }
        }
    }

    private final class HidiWebChromeClient extends WebChromeClient {
        @Override
        @SuppressWarnings("deprecation")
        public boolean onShowFileChooser(
                WebView webView,
                ValueCallback<Uri[]> filePathCallback,
                FileChooserParams fileChooserParams
        ) {
            if (MainActivity.this.filePathCallback != null) {
                MainActivity.this.filePathCallback.onReceiveValue(null);
            }

            MainActivity.this.filePathCallback = filePathCallback;
            try {
                Intent chooserIntent = fileChooserParams.createIntent();
                startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST);
                return true;
            } catch (ActivityNotFoundException error) {
                MainActivity.this.filePathCallback = null;
                Toast.makeText(MainActivity.this, R.string.no_file_picker, Toast.LENGTH_SHORT).show();
                return false;
            }
        }
    }
}
