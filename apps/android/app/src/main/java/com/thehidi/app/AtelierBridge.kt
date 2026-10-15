package com.thehidi.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import org.json.JSONObject

@Composable
fun AtelierBridgeScreen(
    path: String,
    title: String,
    cartSession: String,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val targetUrl = remember(path) { atelierResolveUrl(path) }
    var loading by remember(path) { mutableStateOf(true) }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AtelierCanvas),
    ) {
        AndroidView(
            factory = { viewContext ->
                WebView(viewContext).apply {
                    webViewRef = this
                    setBackgroundColor(android.graphics.Color.rgb(244, 240, 234))
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.databaseEnabled = true
                    settings.allowFileAccess = false
                    settings.allowContentAccess = true
                    settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    settings.setSupportZoom(false)
                    settings.builtInZoomControls = false
                    settings.displayZoomControls = false
                    settings.safeBrowsingEnabled = true
                    settings.userAgentString = settings.userAgentString + " HIDIAtelier/2.0"

                    CookieManager.getInstance().setAcceptCookie(true)
                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

                    webViewClient = object : WebViewClient() {
                        private var sessionInjected = false

                        override fun shouldOverrideUrlLoading(
                            view: WebView,
                            request: WebResourceRequest,
                        ): Boolean = handleBridgeUri(context, request.url)

                        @Suppress("DEPRECATION")
                        override fun shouldOverrideUrlLoading(
                            view: WebView,
                            url: String,
                        ): Boolean = handleBridgeUri(context, Uri.parse(url))

                        override fun onPageFinished(view: WebView, url: String) {
                            super.onPageFinished(view, url)
                            CookieManager.getInstance().flush()
                            injectAtelierChrome(view)

                            if (!sessionInjected) {
                                val safeSession = cartSession.replace("'", "")
                                val js = "try{localStorage.setItem('hidi_cart_session','" +
                                    safeSession +
                                    "');true}catch(e){false}"
                                view.evaluateJavascript(js) {
                                    sessionInjected = true
                                    if (view.url != targetUrl) view.loadUrl(targetUrl)
                                    else loading = false
                                }
                            } else {
                                loading = false
                            }
                        }
                    }

                    loadUrl(BuildConfig.HIDI_START_URL)
                }
            },
            modifier = Modifier
                .fillMaxSize()
                .padding(top = 74.dp),
        )

        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .background(AtelierCanvas),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.Outlined.ArrowBack,
                        contentDescription = "Back",
                        tint = AtelierInk,
                    )
                }
                Column(modifier = Modifier.padding(start = 8.dp)) {
                    Text(
                        "HIDI ATELIER",
                        style = MaterialTheme.typography.labelSmall,
                        color = AtelierGold,
                    )
                    Text(
                        title,
                        style = MaterialTheme.typography.titleLarge,
                        color = AtelierInk,
                    )
                }
            }

            if (loading) {
                LinearProgressIndicator(
                    color = AtelierGold,
                    trackColor = AtelierLine,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            webViewRef?.stopLoading()
            webViewRef?.destroy()
            webViewRef = null
        }
    }
}

private fun handleBridgeUri(
    context: android.content.Context,
    uri: Uri,
): Boolean {
    val scheme = uri.scheme?.lowercase().orEmpty()
    val host = uri.host?.lowercase().orEmpty()

    if (scheme == "http" || scheme == "https") {
        val internal = host == "thehidi.com" ||
            host.endsWith(".thehidi.com") ||
            host == "razorpay.com" ||
            host.endsWith(".razorpay.com") ||
            host == "rzp.io" ||
            host.endsWith(".rzp.io")
        if (internal) return false
    }

    return try {
        val intent = if (scheme == "intent") {
            Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME).apply {
                addCategory(Intent.CATEGORY_BROWSABLE)
                component = null
                selector = null
            }
        } else {
            Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)
        }
        context.startActivity(intent)
        true
    } catch (_: ActivityNotFoundException) {
        false
    } catch (_: Exception) {
        false
    }
}

private fun injectAtelierChrome(view: WebView) {
    val css = """
        header, footer, .mobile-menu, .mobile-menu-panel {
          display: none !important;
        }
        html, body {
          background: #F4F0EA !important;
        }
        body {
          padding-top: 0 !important;
        }
        main {
          padding-top: 8px !important;
        }
        .mobile-cart-checkout {
          bottom: 0 !important;
        }
    """.trimIndent()

    val js = "(function(){var i='hidi-atelier-native';var s=document.getElementById(i);" +
        "if(!s){s=document.createElement('style');s.id=i;document.head.appendChild(s);}" +
        "s.textContent=" + JSONObject.quote(css) + ";})();"
    view.evaluateJavascript(js, null)
}

private fun atelierResolveUrl(path: String): String {
    val base = Uri.parse(BuildConfig.HIDI_START_URL)
    val normalized = if (path.startsWith('/')) path else "/" + path
    val builder = Uri.Builder()
        .scheme(base.scheme)
        .encodedAuthority(base.encodedAuthority)

    val queryIndex = normalized.indexOf('?')
    if (queryIndex >= 0) {
        builder.encodedPath(normalized.substring(0, queryIndex))
        builder.encodedQuery(normalized.substring(queryIndex + 1))
    } else {
        builder.encodedPath(normalized)
    }
    return builder.build().toString()
}
