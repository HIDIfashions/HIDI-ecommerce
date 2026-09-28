package com.thehidi.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final String STATE_NATIVE_HOME = "hidi.native.home";

    private static final int IVORY = Color.rgb(248, 238, 228);
    private static final int CREAM = Color.rgb(255, 250, 245);
    private static final int MULBERRY = Color.rgb(89, 29, 32);
    private static final int GOLD = Color.rgb(213, 162, 77);
    private static final int MUTED = Color.rgb(112, 91, 86);

    private FrameLayout shell;
    private FrameLayout contentFrame;
    private WebView webView;
    private HidiHomeView homeView;
    private RemoteImageLoader imageLoader;
    private ProgressBar pageProgress;
    private ValueCallback<Uri[]> filePathCallback;
    private final List<NavItem> navItems = new ArrayList<>();
    private int selectedNav = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureSystemBars();
        buildAppShell();
        configureWebView();

        boolean restoredNativeHome = savedInstanceState == null
                || savedInstanceState.getBoolean(STATE_NATIVE_HOME, true);

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        }

        if (!loadDeepLink(getIntent())) {
            if (restoredNativeHome) {
                showHome();
            } else {
                showWeb(false);
            }
        }
    }

    private void configureSystemBars() {
        Window window = getWindow();
        window.setStatusBarColor(MULBERRY);
        window.setNavigationBarColor(IVORY);
        window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
    }

    private void buildAppShell() {
        imageLoader = new RemoteImageLoader(this);

        shell = new FrameLayout(this);
        shell.setBackgroundColor(IVORY);

        contentFrame = new FrameLayout(this);
        FrameLayout.LayoutParams contentParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        );
        contentParams.bottomMargin = dp(72);
        shell.addView(contentFrame, contentParams);

        homeView = new HidiHomeView(this, this::openWebPath, imageLoader);
        contentFrame.addView(homeView, matchFrame());

        webView = new WebView(this);
        webView.setBackgroundColor(IVORY);
        webView.setVisibility(View.GONE);
        contentFrame.addView(webView, matchFrame());

        pageProgress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        pageProgress.setMax(100);
        pageProgress.setProgressTintList(ColorStateList.valueOf(GOLD));
        pageProgress.setProgressBackgroundTintList(ColorStateList.valueOf(0x22591D20));
        pageProgress.setVisibility(View.GONE);

        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(2),
                Gravity.TOP
        );
        shell.addView(pageProgress, progressParams);

        LinearLayout bottomNav = createBottomNav();
        FrameLayout.LayoutParams navParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(72),
                Gravity.BOTTOM
        );
        shell.addView(bottomNav, navParams);

        shell.setOnApplyWindowInsetsListener((view, insets) -> {
            int top;
            int bottom;
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets status = insets.getInsets(WindowInsets.Type.statusBars());
                android.graphics.Insets navigation = insets.getInsets(WindowInsets.Type.navigationBars());
                top = status.top;
                bottom = navigation.bottom;
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
            }
            view.setPadding(0, top, 0, bottom);
            return insets;
        });

        setContentView(shell);
        shell.requestApplyInsets();
    }

    private LinearLayout createBottomNav() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER);
        bar.setPadding(dp(6), dp(6), dp(6), dp(5));

        GradientDrawable background = new GradientDrawable();
        background.setColor(CREAM);
        background.setStroke(dp(1), 0x22591D20);
        bar.setBackground(background);
        bar.setElevation(dp(12));

        addNavItem(bar, R.drawable.ic_home, "Home", 0, this::showHome);
        addNavItem(bar, R.drawable.ic_grid, "Shop", 1, () -> openWebPath("/collections/all"));
        addNavItem(bar, R.drawable.ic_search, "Search", 2, () -> openWebPath("/search"));
        addNavItem(bar, R.drawable.ic_heart, "Wishlist", 3, () -> openWebPath("/wishlist"));
        addNavItem(bar, R.drawable.ic_account, "Account", 4, () -> openWebPath("/account"));

        selectNav(0);
        return bar;
    }

    private void addNavItem(
            LinearLayout bar,
            int iconRes,
            String label,
            int index,
            Runnable action
    ) {
        LinearLayout item = new LinearLayout(this);
        item.setOrientation(LinearLayout.VERTICAL);
        item.setGravity(Gravity.CENTER);
        item.setPadding(dp(6), dp(4), dp(6), dp(2));
        item.setContentDescription(label);

        ImageView icon = new ImageView(this);
        icon.setImageResource(iconRes);
        icon.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        item.addView(icon, new LinearLayout.LayoutParams(dp(25), dp(25)));

        TextView text = new TextView(this);
        text.setText(label);
        text.setTextSize(9);
        text.setTypeface(Typeface.create("sans", Typeface.BOLD));
        text.setIncludeFontPadding(false);
        text.setPadding(0, dp(4), 0, 0);
        item.addView(text);

        item.setOnClickListener(v -> {
            selectNav(index);
            action.run();
        });
        item.setOnTouchListener((v, event) -> {
            switch (event.getActionMasked()) {
                case android.view.MotionEvent.ACTION_DOWN:
                    v.animate().alpha(0.58f).setDuration(70L).start();
                    break;
                case android.view.MotionEvent.ACTION_UP:
                case android.view.MotionEvent.ACTION_CANCEL:
                    v.animate().alpha(1f).setDuration(100L).start();
                    break;
                default:
                    break;
            }
            return false;
        });

        bar.addView(item, new LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.MATCH_PARENT,
                1f
        ));

        navItems.add(new NavItem(icon, text));
    }

    private void selectNav(int index) {
        selectedNav = index;
        for (int i = 0; i < navItems.size(); i++) {
            NavItem item = navItems.get(i);
            boolean selected = i == index;
            item.icon.setColorFilter(selected ? MULBERRY : MUTED);
            item.label.setTextColor(selected ? MULBERRY : MUTED);
            item.label.setAlpha(selected ? 1f : 0.72f);
            item.icon.setAlpha(selected ? 1f : 0.68f);
        }
    }

    private void showHome() {
        homeView.setVisibility(View.VISIBLE);
        webView.setVisibility(View.GONE);
        pageProgress.setVisibility(View.GONE);
        selectNav(0);
        homeView.scrollTo(0, 0);
    }

    private void showWeb(boolean animate) {
        homeView.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        if (animate) {
            webView.setAlpha(0f);
            webView.animate().alpha(1f).setDuration(170L).start();
        } else {
            webView.setAlpha(1f);
        }
    }

    private void openWebPath(String path) {
        showWeb(true);
        selectNavForPath(path);

        String target = resolveAppUrl(path);
        String current = webView.getUrl();
        if (current == null || !current.equals(target)) {
            pageProgress.setProgress(6);
            pageProgress.setVisibility(View.VISIBLE);
            webView.loadUrl(target);
        }
    }

    private void openWebUrl(String url) {
        showWeb(true);
        selectNavForPath(Uri.parse(url).getPath());
        pageProgress.setProgress(6);
        pageProgress.setVisibility(View.VISIBLE);
        webView.loadUrl(url);
    }

    private void selectNavForPath(String path) {
        String normalized = path == null ? "" : path;
        if (normalized.startsWith("/wishlist")) selectNav(3);
        else if (normalized.startsWith("/account")) selectNav(4);
        else if (normalized.startsWith("/search")) selectNav(2);
        else if (normalized.startsWith("/collections") || normalized.startsWith("/products")) selectNav(1);
    }

    private String resolveAppUrl(String path) {
        Uri base = Uri.parse(BuildConfig.HIDI_START_URL);
        Uri.Builder builder = new Uri.Builder()
                .scheme(base.getScheme())
                .encodedAuthority(base.getEncodedAuthority());

        String normalized = path == null || path.isEmpty() ? "/" : path;
        if (!normalized.startsWith("/")) normalized = "/" + normalized;

        int queryIndex = normalized.indexOf('?');
        if (queryIndex >= 0) {
            String rawPath = normalized.substring(0, queryIndex);
            String rawQuery = normalized.substring(queryIndex + 1);
            builder.encodedPath(rawPath);
            builder.encodedQuery(rawQuery);
        } else {
            builder.encodedPath(normalized);
        }
        return builder.build().toString();
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
        settings.setSafeBrowsingEnabled(true);
        settings.setUserAgentString(settings.getUserAgentString() + " HIDIAndroid/1.1");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

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

        String path = data.getPath();
        if (path == null || path.isEmpty() || "/".equals(path)) {
            showHome();
        } else {
            openWebUrl(data.toString());
        }
        return true;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        outState.putBoolean(STATE_NATIVE_HOME, homeView.getVisibility() == View.VISIBLE);
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        if (homeView != null) homeView.dispose();
        if (imageLoader != null) imageLoader.shutdown();

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
        if (homeView.getVisibility() == View.VISIBLE) {
            super.onBackPressed();
            return;
        }

        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            showHome();
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
            webView.reload();
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
            pageProgress.setVisibility(View.GONE);
            selectNavForPath(Uri.parse(url).getPath());
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
        public void onProgressChanged(WebView view, int newProgress) {
            if (webView.getVisibility() == View.VISIBLE && newProgress < 100) {
                pageProgress.setVisibility(View.VISIBLE);
                pageProgress.setProgress(Math.max(6, newProgress));
            } else {
                pageProgress.setVisibility(View.GONE);
            }
        }

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

    private FrameLayout.LayoutParams matchFrame() {
        return new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        );
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static final class NavItem {
        final ImageView icon;
        final TextView label;

        NavItem(ImageView icon, TextView label) {
            this.icon = icon;
            this.label = label;
        }
    }
}
