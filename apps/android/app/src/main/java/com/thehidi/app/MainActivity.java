package com.thehidi.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.ColorStateList;
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

    private FrameLayout shell;
    private FrameLayout nativeContainer;
    private WebView webView;
    private LinearLayout bottomNav;
    private ProgressBar pageProgress;

    private RemoteImageLoader imageLoader;
    private HidiCatalog catalog;
    private HidiAppStore store;
    private HidiCartClient cart;

    private ValueCallback<Uri[]> filePathCallback;
    private final List<NavItem> navItems = new ArrayList<>();

    private int currentTab = 0;
    private int returnTab = 0;
    private boolean bridgeReady = false;
    private String pendingCommercePath;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        store = new HidiAppStore(this);
        catalog = new HidiCatalog();
        cart = new HidiCartClient(store);
        imageLoader = new RemoteImageLoader(this);

        configureSystemBars();
        buildShell();
        configureWebView();
        prewarmCommerceBridge();

        if (!loadDeepLink(getIntent())) {
            showHome();
        }
    }

    private void configureSystemBars() {
        Window window = getWindow();
        window.setStatusBarColor(HidiUi.CANVAS);
        window.setNavigationBarColor(HidiUi.CANVAS);
        window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        );
    }

    private void buildShell() {
        shell = new FrameLayout(this);
        shell.setBackgroundColor(HidiUi.CANVAS);

        nativeContainer = new FrameLayout(this);
        FrameLayout.LayoutParams nativeParams = HidiUi.match();
        nativeParams.bottomMargin = HidiUi.dp(this, 92);
        shell.addView(nativeContainer, nativeParams);

        webView = new WebView(this);
        webView.setBackgroundColor(HidiUi.CANVAS);
        webView.setVisibility(View.GONE);
        shell.addView(webView, HidiUi.match());

        pageProgress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        pageProgress.setMax(100);
        pageProgress.setProgressTintList(ColorStateList.valueOf(HidiUi.GOLD));
        pageProgress.setProgressBackgroundTintList(ColorStateList.valueOf(0x1A5D252D));
        pageProgress.setVisibility(View.GONE);

        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                HidiUi.dp(this, 2),
                Gravity.TOP
        );
        shell.addView(pageProgress, progressParams);

        bottomNav = createBottomNav();
        FrameLayout.LayoutParams navParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                HidiUi.dp(this, 72),
                Gravity.BOTTOM
        );
        navParams.setMargins(
                HidiUi.dp(this, 14),
                0,
                HidiUi.dp(this, 14),
                HidiUi.dp(this, 10)
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
        bar.setPadding(HidiUi.dp(this, 6), HidiUi.dp(this, 6), HidiUi.dp(this, 6), HidiUi.dp(this, 6));
        bar.setBackground(HidiUi.rounded(HidiUi.SURFACE, 24, this));
        bar.setElevation(HidiUi.dp(this, 16));

        addNavItem(bar, R.drawable.ic_home, "Home", 0, this::showHome);
        addNavItem(bar, R.drawable.ic_grid, "Shop", 1, () -> showShop("all"));
        addNavItem(bar, R.drawable.ic_search, "Search", 2, this::showSearch);
        addNavItem(bar, R.drawable.ic_heart, "Saved", 3, this::showSaved);
        addNavItem(bar, R.drawable.ic_account, "You", 4, this::showAccount);

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
        item.setPadding(HidiUi.dp(this, 5), HidiUi.dp(this, 5), HidiUi.dp(this, 5), HidiUi.dp(this, 3));
        item.setBackground(HidiUi.rounded(android.graphics.Color.TRANSPARENT, 18, this));

        ImageView icon = new ImageView(this);
        icon.setImageResource(iconRes);
        icon.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        item.addView(icon, new LinearLayout.LayoutParams(HidiUi.dp(this, 23), HidiUi.dp(this, 23)));

        TextView text = HidiUi.text(this, label, 9, HidiUi.MUTED, Typeface.BOLD);
        text.setPadding(0, HidiUi.dp(this, 4), 0, 0);
        item.addView(text);

        item.setOnClickListener(v -> {
            selectNav(index);
            action.run();
        });
        HidiUi.press(item);

        bar.addView(item, new LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.MATCH_PARENT,
                1f
        ));
        navItems.add(new NavItem(item, icon, text));
    }

    private void selectNav(int index) {
        currentTab = index;
        for (int i = 0; i < navItems.size(); i++) {
            NavItem item = navItems.get(i);
            boolean selected = i == index;
            item.icon.setColorFilter(selected ? HidiUi.WINE : HidiUi.MUTED);
            item.label.setTextColor(selected ? HidiUi.WINE : HidiUi.MUTED);
            item.container.setBackground(selected
                    ? HidiUi.rounded(0x0D5D252D, 18, this)
                    : HidiUi.rounded(android.graphics.Color.TRANSPARENT, 18, this));
            item.icon.setAlpha(selected ? 1f : 0.68f);
            item.label.setAlpha(selected ? 1f : 0.68f);
        }
    }

    private void showHome() {
        showNative(
                new HidiHomeView(
                        this,
                        new HidiHomeView.Navigator() {
                            @Override public void openShop(String collection) { showShop(collection); }
                            @Override public void openSearch() { showSearch(); }
                            @Override public void openBag() { showBag(); }
                            @Override public void openProduct(HidiCatalog.Product product) { showProduct(product); }
                            @Override public void openSaved() { showSaved(); }
                        },
                        imageLoader,
                        catalog,
                        store
                ),
                true,
                0
        );
    }

    private void showShop(String filter) {
        showNative(
                new HidiShopView(
                        this,
                        filter,
                        new HidiShopView.Navigator() {
                            @Override public void openSearch() { showSearch(); }
                            @Override public void openBag() { showBag(); }
                            @Override public void openProduct(HidiCatalog.Product product) { showProduct(product); }
                        },
                        imageLoader,
                        catalog,
                        store
                ),
                true,
                1
        );
    }

    private void showSearch() {
        showNative(
                new HidiSearchView(
                        this,
                        new HidiSearchView.Navigator() {
                            @Override public void openBag() { showBag(); }
                            @Override public void openProduct(HidiCatalog.Product product) { showProduct(product); }
                            @Override public void openShop(String filter) { showShop(filter); }
                        },
                        imageLoader,
                        catalog,
                        store
                ),
                true,
                2
        );
    }

    private void showSaved() {
        showNative(
                new HidiSavedView(
                        this,
                        new HidiSavedView.Navigator() {
                            @Override public void openBag() { showBag(); }
                            @Override public void openShop() { showShop("all"); }
                            @Override public void openProduct(HidiCatalog.Product product) { showProduct(product); }
                        },
                        imageLoader,
                        catalog,
                        store
                ),
                true,
                3
        );
    }

    private void showAccount() {
        showNative(
                new HidiAccountView(
                        this,
                        new HidiAccountView.Navigator() {
                            @Override public void openBag() { showBag(); }
                            @Override public void openCommerce(String path) { openCommerce(path); }
                        }
                ),
                true,
                4
        );
    }

    private void showProduct(HidiCatalog.Product product) {
        returnTab = currentTab;
        showNative(
                new HidiProductView(
                        this,
                        product,
                        new HidiProductView.Navigator() {
                            @Override public void back() { showCurrentTab(); }
                            @Override public void openBag() { showBag(); }
                            @Override public void cartChanged(int itemCount) { syncCartSessionIntoWeb(); }
                        },
                        imageLoader,
                        store,
                        cart
                ),
                false,
                currentTab
        );
    }

    private void showProductBySlug(String slug) {
        catalog.product(slug, product -> {
            if (product != null) showProduct(product);
            else showShop("all");
        });
    }

    private void showBag() {
        returnTab = currentTab;
        showNative(
                new HidiBagView(
                        this,
                        new HidiBagView.Navigator() {
                            @Override public void back() { showCurrentTab(); }
                            @Override public void browse() { showShop("all"); }
                            @Override public void checkout() { openCommerce("/checkout"); }
                            @Override public void cartChanged(int itemCount) { syncCartSessionIntoWeb(); }
                        },
                        imageLoader,
                        cart
                ),
                false,
                currentTab
        );
    }

    private void showCurrentTab() {
        switch (returnTab) {
            case 1: showShop("all"); break;
            case 2: showSearch(); break;
            case 3: showSaved(); break;
            case 4: showAccount(); break;
            default: showHome(); break;
        }
    }

    private void showNative(View view, boolean showNav, int selectedTab) {
        webView.setVisibility(View.GONE);
        pageProgress.setVisibility(View.GONE);
        nativeContainer.setVisibility(View.VISIBLE);
        nativeContainer.removeAllViews();
        nativeContainer.addView(view, HidiUi.match());

        setBottomNavVisible(showNav);
        if (showNav) selectNav(selectedTab);

        view.setAlpha(0f);
        view.setTranslationY(HidiUi.dp(this, 5));
        view.animate().alpha(1f).translationY(0f).setDuration(180L).start();
    }

    private void setBottomNavVisible(boolean visible) {
        bottomNav.setVisibility(visible ? View.VISIBLE : View.GONE);
        FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) nativeContainer.getLayoutParams();
        params.bottomMargin = visible ? HidiUi.dp(this, 92) : 0;
        nativeContainer.setLayoutParams(params);
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
        settings.setUserAgentString(settings.getUserAgentString() + " HIDIAndroid/1.2 Native");

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.setWebViewClient(new HidiWebViewClient());
        webView.setWebChromeClient(new HidiWebChromeClient());
        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) ->
                openExternal(Uri.parse(url)));
    }

    private void prewarmCommerceBridge() {
        webView.loadUrl(BuildConfig.HIDI_START_URL);
    }

    private void openCommerce(String path) {
        pendingCommercePath = path;
        pageProgress.setProgress(8);
        pageProgress.setVisibility(View.VISIBLE);

        if (bridgeReady) {
            String target = resolveAppUrl(path);
            pendingCommercePath = null;
            nativeContainer.setVisibility(View.GONE);
            setBottomNavVisible(false);
            webView.setVisibility(View.VISIBLE);
            webView.loadUrl(target);
        } else if (webView.getUrl() == null) {
            prewarmCommerceBridge();
        }
    }

    private void syncCartSessionIntoWeb() {
        if (webView == null) return;
        String session = store.cartSession().replace("'", "");
        String js = "try{localStorage.setItem('hidi_cart_session','" + session + "');true}catch(e){false}";
        webView.evaluateJavascript(js, value -> {
            bridgeReady = true;
            if (pendingCommercePath != null) {
                String path = pendingCommercePath;
                pendingCommercePath = null;
                nativeContainer.setVisibility(View.GONE);
                setBottomNavVisible(false);
                webView.setVisibility(View.VISIBLE);
                webView.loadUrl(resolveAppUrl(path));
            }
        });
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
            builder.encodedPath(normalized.substring(0, queryIndex));
            builder.encodedQuery(normalized.substring(queryIndex + 1));
        } else {
            builder.encodedPath(normalized);
        }
        return builder.build().toString();
    }

    private void injectBridgePolish() {
        String css = "header,footer{display:none!important}"
                + "body{padding-top:0!important;background:#f7f3ee!important}"
                + "main{padding-top:12px!important}"
                + ".mobile-cart-checkout{bottom:0!important}"
                + ".site-shell{min-height:100vh!important}";
        String js = "(function(){var id='hidi-native-style';var s=document.getElementById(id);"
                + "if(!s){s=document.createElement('style');s.id=id;document.head.appendChild(s);}s.textContent="
                + JSONObjectString.quote(css) + ";})();";
        webView.evaluateJavascript(js, null);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        loadDeepLink(intent);
    }

    private boolean loadDeepLink(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return false;

        Uri data = intent.getData();
        if (data == null || !isHidiHost(data.getHost())) return false;

        routeHidiPath(data);
        return true;
    }

    private boolean routeHidiPath(Uri uri) {
        String path = uri.getPath() == null ? "/" : uri.getPath();

        if ("/".equals(path)) {
            showHome();
            return true;
        }
        if (path.startsWith("/collections")) {
            String[] parts = path.split("/");
            String filter = parts.length > 2 && !parts[2].isEmpty() ? parts[2] : "all";
            showShop(filter);
            return true;
        }
        if (path.startsWith("/products/")) {
            String slug = path.substring("/products/".length());
            if (!slug.isEmpty()) {
                showProductBySlug(slug);
                return true;
            }
        }
        if (path.startsWith("/search")) {
            showSearch();
            return true;
        }
        if (path.startsWith("/wishlist")) {
            showSaved();
            return true;
        }
        if (path.startsWith("/cart")) {
            showBag();
            return true;
        }
        return false;
    }

    @Override
    protected void onDestroy() {
        if (catalog != null) catalog.shutdown();
        if (cart != null) cart.shutdown();
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
        if (webView.getVisibility() == View.VISIBLE) {
            String path = "";
            try {
                path = Uri.parse(webView.getUrl()).getPath();
            } catch (Exception ignored) {}

            if (path != null && (path.startsWith("/checkout") || path.startsWith("/account")
                    || path.startsWith("/returns") || path.startsWith("/order-confirmed"))) {
                showCurrentTab();
                return;
            }

            if (webView.canGoBack()) {
                webView.goBack();
            } else {
                showCurrentTab();
            }
            return;
        }

        if (bottomNav.getVisibility() == View.GONE) {
            showCurrentTab();
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
        if (uri == null) return false;

        String scheme = lower(uri.getScheme());

        if ("hidi".equals(scheme) && "retry".equals(lower(uri.getHost()))) {
            webView.reload();
            return true;
        }

        if ("http".equals(scheme) || "https".equals(scheme)) {
            String host = lower(uri.getHost());
            if (isHidiHost(host)) {
                if (routeHidiPath(uri)) return true;
                return false;
            }
            if (isRazorpayHost(host)) return false;
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
                    if ("http".equals(lower(fallbackUri.getScheme()))
                            || "https".equals(lower(fallbackUri.getScheme()))) {
                        webView.loadUrl(fallback);
                        return;
                    }
                }
            } catch (Exception ignored) {}
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
            syncCartSessionIntoWeb();
            injectBridgePolish();
            pageProgress.setVisibility(View.GONE);
            super.onPageFinished(view, url);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame() && webView.getVisibility() == View.VISIBLE) {
                Toast.makeText(MainActivity.this, R.string.connection_error_detail, Toast.LENGTH_SHORT).show();
            }
        }

        @Override
        public void onReceivedHttpError(
                WebView view,
                WebResourceRequest request,
                WebResourceResponse errorResponse
        ) {
            if (request.isForMainFrame()
                    && errorResponse.getStatusCode() >= 500
                    && webView.getVisibility() == View.VISIBLE) {
                Toast.makeText(MainActivity.this, R.string.server_error_detail, Toast.LENGTH_SHORT).show();
            }
        }
    }

    private final class HidiWebChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            if (webView.getVisibility() == View.VISIBLE && newProgress < 100) {
                pageProgress.setVisibility(View.VISIBLE);
                pageProgress.setProgress(Math.max(8, newProgress));
            } else if (newProgress >= 100) {
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

    private static final class NavItem {
        final LinearLayout container;
        final ImageView icon;
        final TextView label;

        NavItem(LinearLayout container, ImageView icon, TextView label) {
            this.container = container;
            this.icon = icon;
            this.label = label;
        }
    }

    private static final class JSONObjectString {
        static String quote(String value) {
            if (value == null) return "null";
            StringBuilder out = new StringBuilder(""");
            for (int i = 0; i < value.length(); i++) {
                char c = value.charAt(i);
                switch (c) {
                    case '\\': out.append("\\\\"); break;
                    case '"': out.append("\\\""); break;
                    case '\n': out.append("\\n"); break;
                    case '\r': out.append("\\r"); break;
                    case '\t': out.append("\\t"); break;
                    default:
                        if (c < 32) out.append(String.format("\\u%04x", (int) c));
                        else out.append(c);
                }
            }
            return out.append('"').toString();
        }
    }
}
