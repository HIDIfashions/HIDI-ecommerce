package com.thehidi.app

import android.content.Intent
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.Locale

@Composable
fun HidiCommerceProductScreen(
    product: HidiProduct,
    allProducts: List<HidiProduct>,
    saved: Boolean,
    repository: HidiRepository,
    onBack: () -> Unit,
    onBag: () -> Unit,
    onSaved: () -> Unit,
    onProduct: (HidiProduct) -> Unit,
    onCartChanged: (Int) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var selectedColour by remember(product.slug) { mutableStateOf(product.colours.firstOrNull().orEmpty()) }
    var selectedVariant by remember(product.slug) { mutableStateOf<HidiVariant?>(null) }
    var adding by remember(product.slug) { mutableStateOf(false) }
    var added by remember(product.slug) { mutableStateOf(false) }
    var fitGuide by remember(product.slug) { mutableStateOf(false) }

    val images = product.images.filter { it.isNotBlank() }
    val pager = rememberPagerState(pageCount = { maxOf(1, images.size) })
    val variants = product.variants.filter { selectedColour.isBlank() || it.color == selectedColour }
    val related = remember(product.slug, allProducts) {
        allProducts
            .filter { it.slug != product.slug && (it.collections.any(product.collections::contains) || it.category == product.category) }
            .take(6)
            .ifEmpty { allProducts.filter { it.slug != product.slug }.take(6) }
    }

    Box(Modifier.fillMaxSize().background(CommerceColors.Canvas)) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 98.dp + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()),
        ) {
            item {
                Box(
                    Modifier.fillMaxWidth().height(540.dp).background(CommerceColors.Sage)
                ) {
                    if (images.isNotEmpty()) {
                        HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
                            CommerceImage(images[page], Modifier.fillMaxSize())
                        }
                    }

                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(
                                top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 8.dp,
                                start = 8.dp,
                                end = 8.dp,
                            ),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        FloatingPdpButton(Icons.Outlined.ArrowBack, "Back", onBack)
                        Spacer(Modifier.weight(1f))
                        FloatingPdpButton(
                            if (saved) Icons.Outlined.Favorite else Icons.Outlined.FavoriteBorder,
                            "Wishlist",
                            onSaved,
                        )
                        Spacer(Modifier.width(6.dp))
                        FloatingPdpButton(Icons.Outlined.ShoppingBag, "Bag", onBag)
                    }

                    if (images.size > 1) {
                        Row(
                            Modifier.align(Alignment.BottomCenter).padding(bottom = 14.dp),
                            horizontalArrangement = Arrangement.spacedBy(5.dp),
                        ) {
                            repeat(images.size) { index ->
                                Box(
                                    Modifier
                                        .width(if (pager.currentPage == index) 18.dp else 5.dp)
                                        .height(4.dp)
                                        .background(
                                            if (pager.currentPage == index) CommerceColors.Ink else Color.White.copy(.72f),
                                            CircleShape,
                                        )
                                )
                            }
                        }
                    }
                }
            }

            item {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 18.dp)) {
                    if (product.reviewCount > 0 && product.averageRating > 0) {
                        Text(
                            "★ ${String.format(Locale.US, "%.1f", product.averageRating)}  ·  ${product.reviewCount} reviews",
                            color = CommerceColors.Gold,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Text(
                        product.name,
                        color = CommerceColors.Ink,
                        fontFamily = FontFamily.Serif,
                        fontSize = 27.sp,
                        lineHeight = 30.sp,
                        modifier = Modifier.padding(top = 5.dp),
                    )
                    Text(
                        money(selectedVariant?.pricePaise ?: product.minPricePaise),
                        color = CommerceColors.Ink,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    Text(
                        "Inclusive of all taxes",
                        color = CommerceColors.Muted,
                        fontSize = 9.sp,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                    if (product.description.isNotBlank()) {
                        Text(
                            product.description,
                            color = CommerceColors.Muted,
                            fontSize = 12.sp,
                            lineHeight = 19.sp,
                            modifier = Modifier.padding(top = 15.dp),
                        )
                    }
                }
            }

            if (product.colours.size > 1) {
                item {
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
                        Text("COLOUR  ·  $selectedColour", color = CommerceColors.Ink, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = .8.sp)
                        LazyRow(
                            modifier = Modifier.padding(top = 10.dp),
                            horizontalArrangement = Arrangement.spacedBy(7.dp),
                        ) {
                            items(product.colours) { colour ->
                                Pill(colour, selected = colour == selectedColour) {
                                    selectedColour = colour
                                    selectedVariant = null
                                    added = false
                                }
                            }
                        }
                    }
                }
            }

            item {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("SELECT SIZE", color = CommerceColors.Ink, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = .8.sp)
                        Spacer(Modifier.weight(1f))
                        Text(
                            "SIZE & FIT GUIDE",
                            color = CommerceColors.Wine,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.clickable { fitGuide = true }.padding(7.dp),
                        )
                    }
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
                        modifier = Modifier.padding(top = 8.dp),
                    ) {
                        items(variants) { variant ->
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Pill(
                                    variant.size,
                                    selected = selectedVariant?.id == variant.id,
                                ) {
                                    if (variant.available > 0) {
                                        selectedVariant = if (selectedVariant?.id == variant.id) null else variant
                                        added = false
                                    }
                                }
                                when {
                                    variant.available <= 0 -> Text("Sold out", color = CommerceColors.Muted, fontSize = 7.sp, modifier = Modifier.padding(top = 3.dp))
                                    variant.available <= 3 -> Text("Only ${variant.available} left", color = CommerceColors.Red, fontSize = 7.sp, modifier = Modifier.padding(top = 3.dp))
                                }
                            }
                        }
                    }
                    if (selectedVariant == null) {
                        Text("Select a size to continue", color = CommerceColors.Muted, fontSize = 10.sp, modifier = Modifier.padding(top = 11.dp))
                    }
                }
            }

            item {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp)
                        .background(CommerceColors.Surface)
                        .padding(horizontal = 16.dp)
                ) {
                    ProductInfoRow("FABRIC", product.fabric.ifBlank { "Product fabric information" })
                    HorizontalDivider(color = CommerceColors.Line, thickness = .6.dp)
                    ProductInfoRow("CARE", product.care.ifBlank { "Follow garment care instructions" })
                    HorizontalDivider(color = CommerceColors.Line, thickness = .6.dp)
                    ProductInfoRow("DELIVERY", "Complimentary shipping on orders of ₹1,499 and above")
                    HorizontalDivider(color = CommerceColors.Line, thickness = .6.dp)
                    ProductInfoRow("RETURNS & EXCHANGE", "Eligible exchanges within 7 days")
                }
            }

            if (related.isNotEmpty()) {
                item {
                    CommerceSectionHeader(
                        title = "You may also like",
                        subtitle = "More HIDI styles for the same mood",
                    )
                }
                item {
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 14.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        items(related, key = { it.slug }) { item ->
                            CommerceProductCard(
                                product = item,
                                saved = false,
                                width = 172.dp,
                                onOpen = { onProduct(item) },
                                onToggleSaved = {},
                                showBadge = false,
                            )
                        }
                    }
                }
            }
        }

        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(CommerceColors.Surface)
                .padding(
                    start = 12.dp,
                    end = 12.dp,
                    top = 9.dp,
                    bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + 9.dp,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                when {
                    added -> "ADDED · VIEW BAG"
                    adding -> "ADDING…"
                    !product.inStock -> "COMING SOON"
                    selectedVariant == null -> "SELECT A SIZE"
                    else -> "ADD TO BAG · ${money(selectedVariant!!.pricePaise)}"
                },
                color = Color.White,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = .8.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        if ((selectedVariant != null && product.inStock) || added) CommerceColors.Wine else CommerceColors.Ink.copy(.35f),
                        RoundedCornerShape(12.dp),
                    )
                    .clickable(enabled = (selectedVariant != null && product.inStock && !adding) || added) {
                        if (added) {
                            onBag()
                        } else {
                            scope.launch {
                                adding = true
                                val cart = repository.addToCart(selectedVariant!!.id)
                                onCartChanged(cart.itemCount)
                                adding = false
                                added = true
                            }
                        }
                    }
                    .padding(vertical = 17.dp),
            )
        }
    }

    if (fitGuide) {
        FitGuideSheet(
            variants = variants,
            onDismiss = { fitGuide = false },
        )
    }
}

@Composable
private fun FloatingPdpButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
) {
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(42.dp)
            .background(Color.White.copy(.9f), CircleShape),
    ) {
        Icon(icon, label, tint = CommerceColors.Ink, modifier = Modifier.size(19.dp))
    }
}

@Composable
private fun ProductInfoRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 15.dp), verticalAlignment = Alignment.Top) {
        Text(label, color = CommerceColors.Ink, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = .8.sp, modifier = Modifier.width(110.dp))
        Text(value, color = CommerceColors.Muted, fontSize = 11.sp, lineHeight = 17.sp, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun FitGuideSheet(variants: List<HidiVariant>, onDismiss: () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = CommerceColors.Surface,
    ) {
        Column(Modifier.padding(horizontal = 18.dp, vertical = 8.dp)) {
            Text("HIDI Fit", color = CommerceColors.Ink, fontFamily = FontFamily.Serif, fontSize = 26.sp)
            Text(
                "Finished-garment measurements. Compare with a garment you already own.",
                color = CommerceColors.Muted,
                fontSize = 11.sp,
                lineHeight = 17.sp,
                modifier = Modifier.padding(top = 5.dp, bottom = 18.dp),
            )
            val hasMeasurements = variants.any { it.bustMm != null || it.waistMm != null || it.garmentLengthMm != null }
            if (!hasMeasurements) {
                Text(
                    "Verified garment measurements are not published for this style yet.",
                    color = CommerceColors.Ink,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(vertical = 28.dp),
                )
            } else {
                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                    FitCell("SIZE", .7f)
                    FitCell("BUST", 1f)
                    FitCell("WAIST", 1f)
                    FitCell("LENGTH", 1f)
                }
                HorizontalDivider(color = CommerceColors.Line)
                variants.distinctBy { it.size }.forEach { v ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 11.dp)) {
                        FitCell(v.size, .7f, bold = true)
                        FitCell(mmToCm(v.bustMm), 1f)
                        FitCell(mmToCm(v.waistMm), 1f)
                        FitCell(mmToCm(v.garmentLengthMm), 1f)
                    }
                    HorizontalDivider(color = CommerceColors.Line, thickness = .5.dp)
                }
            }
            Spacer(Modifier.height(28.dp))
        }
    }
}

@Composable
private fun RowScopeFitCell(text: String, weight: Float, bold: Boolean = false) {
    Text(text, color = CommerceColors.Ink, fontSize = 10.sp, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal, modifier = Modifier.weight(weight))
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.FitCell(text: String, weight: Float, bold: Boolean = false) {
    Text(text, color = CommerceColors.Ink, fontSize = 10.sp, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal, modifier = Modifier.weight(weight))
}

private fun mmToCm(value: Int?): String =
    value?.let { if (it % 10 == 0) "${it / 10} cm" else String.format(Locale.US, "%.1f cm", it / 10.0) } ?: "—"

@Composable
fun HidiCommerceBagScreen(
    repository: HidiRepository,
    onBack: () -> Unit,
    onShop: () -> Unit,
    onCheckout: () -> Unit,
    onCartChanged: (Int) -> Unit,
) {
    var cart by remember { mutableStateOf<HidiCart?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val freeShippingAt = 149900

    suspend fun refresh() {
        busy = true
        cart = repository.cart()
        onCartChanged(cart?.itemCount ?: 0)
        busy = false
    }

    LaunchedEffect(Unit) { refresh() }

    Box(
        Modifier
            .fillMaxSize()
            .background(CommerceColors.Canvas)
            .padding(top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding())
    ) {
        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier.fillMaxWidth().background(CommerceColors.Surface).padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) { Icon(Icons.Outlined.ArrowBack, "Back", tint = CommerceColors.Ink) }
                Text("YOUR BAG", color = CommerceColors.Ink, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.6.sp, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
                Spacer(Modifier.size(48.dp))
            }

            when {
                cart == null || busy -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = CommerceColors.Wine, strokeWidth = 2.dp)
                }
                cart!!.items.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(38.dp)) {
                        Text("Your bag is empty.", color = CommerceColors.Ink, fontFamily = FontFamily.Serif, fontSize = 28.sp)
                        Text("Find something you love from the latest HIDI edit.", color = CommerceColors.Muted, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 7.dp, bottom = 20.dp))
                        Text("SHOP HIDI", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.background(CommerceColors.Wine, RoundedCornerShape(12.dp)).clickable(onClick = onShop).padding(horizontal = 24.dp, vertical = 14.dp))
                    }
                }
                else -> {
                    val current = cart!!
                    val progress = (current.subtotalPaise.toFloat() / freeShippingAt).coerceIn(0f, 1f)

                    Column(Modifier.background(CommerceColors.Surface).padding(horizontal = 14.dp, vertical = 12.dp)) {
                        Text(
                            if (current.subtotalPaise >= freeShippingAt) "You unlocked complimentary shipping"
                            else "Add ${money(freeShippingAt - current.subtotalPaise)} more for complimentary shipping",
                            color = CommerceColors.Ink,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                        LinearProgressIndicator(
                            progress = { progress },
                            color = CommerceColors.Wine,
                            trackColor = CommerceColors.Line,
                            modifier = Modifier.fillMaxWidth().padding(top = 8.dp).height(3.dp),
                        )
                    }

                    LazyColumn(
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        modifier = Modifier.weight(1f),
                    ) {
                        items(current.items, key = { it.id }) { item ->
                            BagLine(
                                item = item,
                                onMinus = {
                                    scope.launch {
                                        cart = if (item.quantity <= 1) repository.removeCart(item.id)
                                        else repository.updateCart(item.id, item.quantity - 1)
                                        onCartChanged(cart?.itemCount ?: 0)
                                    }
                                },
                                onPlus = {
                                    scope.launch {
                                        cart = repository.updateCart(item.id, item.quantity + 1)
                                        onCartChanged(cart?.itemCount ?: 0)
                                    }
                                },
                                onRemove = {
                                    scope.launch {
                                        cart = repository.removeCart(item.id)
                                        onCartChanged(cart?.itemCount ?: 0)
                                    }
                                },
                            )
                        }

                        item { RewardsStrip(title = "HIDI Rewards", copy = "Eligible rewards are calculated with your order") }

                        item {
                            Column(Modifier.background(CommerceColors.Surface, RoundedCornerShape(14.dp)).padding(14.dp)) {
                                Row(Modifier.fillMaxWidth()) {
                                    Text("Subtotal", color = CommerceColors.Muted, fontSize = 11.sp, modifier = Modifier.weight(1f))
                                    Text(money(current.subtotalPaise), color = CommerceColors.Ink, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                }
                                Text(
                                    if (current.subtotalPaise >= freeShippingAt) "Shipping · Complimentary" else "Shipping · Calculated at checkout",
                                    color = CommerceColors.Muted,
                                    fontSize = 10.sp,
                                    modifier = Modifier.padding(top = 7.dp),
                                )
                            }
                        }

                        item { Spacer(Modifier.height(86.dp)) }
                    }
                }
            }
        }

        val current = cart
        if (current != null && current.items.isNotEmpty()) {
            Text(
                "CHECKOUT · ${money(current.subtotalPaise)}",
                color = Color.White,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = .8.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .background(CommerceColors.Wine)
                    .clickable(onClick = onCheckout)
                    .padding(
                        top = 18.dp,
                        bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + 18.dp,
                    ),
            )
        }
    }
}

@Composable
private fun BagLine(
    item: HidiCartItem,
    onMinus: () -> Unit,
    onPlus: () -> Unit,
    onRemove: () -> Unit,
) {
    Row(Modifier.fillMaxWidth().background(CommerceColors.Surface, RoundedCornerShape(12.dp)).padding(10.dp)) {
        CommerceImage(
            item.productImage,
            Modifier.width(96.dp).height(126.dp).clip(RoundedCornerShape(8.dp)).background(CommerceColors.Sage),
        )
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Text(item.productName, color = CommerceColors.Ink, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 2)
            Text("${item.color} · Size ${item.size}", color = CommerceColors.Muted, fontSize = 10.sp, modifier = Modifier.padding(top = 4.dp))
            Text(money(item.lineTotalPaise), color = CommerceColors.Ink, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 7.dp))
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 13.dp)) {
                IconButton(onClick = onMinus, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Outlined.Remove, null, tint = CommerceColors.Ink, modifier = Modifier.size(16.dp))
                }
                Text(item.quantity.toString(), color = CommerceColors.Ink, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 7.dp))
                IconButton(onClick = onPlus, modifier = Modifier.size(32.dp), enabled = item.available <= 0 || item.quantity < item.available) {
                    Icon(Icons.Outlined.Add, null, tint = CommerceColors.Ink, modifier = Modifier.size(16.dp))
                }
                Text("REMOVE", color = CommerceColors.Wine, fontSize = 8.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clickable(onClick = onRemove).padding(start = 12.dp, top = 8.dp, bottom = 8.dp))
            }
        }
    }
}

@Composable
fun HidiCommerceBridge(path: String, cartSession: String, onClose: () -> Unit) {
    val context = LocalContext.current
    val url = remember(path) {
        BuildConfig.HIDI_START_URL.trimEnd('/') + if (path.startsWith("/")) path else "/$path"
    }

    Box(Modifier.fillMaxSize().background(CommerceColors.Canvas)) {
        AndroidView(
            factory = {
                WebView(it).apply {
                    setBackgroundColor(android.graphics.Color.rgb(248, 245, 240))
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    CookieManager.getInstance().setAcceptCookie(true)
                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                            val target = request.url
                            val scheme = target.scheme.orEmpty()
                            if (scheme == "intent" || scheme == "upi") {
                                runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, target)) }
                                return true
                            }
                            return false
                        }

                        override fun onPageFinished(view: WebView, url: String) {
                            val safeSession = cartSession.replace("'", "")
                            view.evaluateJavascript(
                                "try{localStorage.setItem('hidi_cart_session','$safeSession')}catch(e){}",
                                null,
                            )
                            val css = "header,footer{display:none!important}body{padding-top:0!important;background:#f8f5f0!important}main{padding-top:8px!important}"
                            view.evaluateJavascript(
                                "(function(){var s=document.getElementById('hidi-app-v3');if(!s){s=document.createElement('style');s.id='hidi-app-v3';document.head.appendChild(s)}s.textContent=${JSONObject.quote(css)}})()",
                                null,
                            )
                        }
                    }
                    loadUrl(url)
                }
            },
            modifier = Modifier.fillMaxSize(),
        )
        IconButton(
            onClick = onClose,
            modifier = Modifier
                .padding(
                    top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 8.dp,
                    start = 8.dp,
                )
                .background(Color.White.copy(.92f), CircleShape),
        ) {
            Icon(Icons.Outlined.Close, "Close", tint = CommerceColors.Ink)
        }
    }
}
