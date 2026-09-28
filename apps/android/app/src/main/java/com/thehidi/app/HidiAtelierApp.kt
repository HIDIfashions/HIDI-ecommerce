package com.thehidi.app

import android.content.Intent
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ArrowForward
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Explore
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.PersonOutline
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateSet
import androidx.compose.runtime.toMutableStateList
import androidx.compose.runtime.toMutableStateSet
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

private const val HERO = "https://thidigk.thehidi.com/brand/hidi-hero-green-garden-fullbody.webp"
private const val ANANYA = "https://thidigk.thehidi.com/brand/hidi-manifesto-ananya.webp"

private sealed interface AtelierScreen {
    data object Home : AtelierScreen
    data object Discover : AtelierScreen
    data object Saved : AtelierScreen
    data object You : AtelierScreen
    data object Bag : AtelierScreen
    data class Product(val product: HidiProduct) : AtelierScreen
    data class Bridge(val path: String) : AtelierScreen
}

@Composable
fun HidiAtelierApp(initialPath: String = "") {
    val context = LocalContext.current
    val store = remember { HidiStore(context) }
    val repository = remember { HidiRepository(store) }
    val scope = rememberCoroutineScope()

    var screen by remember { mutableStateOf<AtelierScreen>(AtelierScreen.Home) }
    var previousTab by remember { mutableStateOf<AtelierScreen>(AtelierScreen.Home) }
    var products by remember { mutableStateOf<List<HidiProduct>>(emptyList()) }
    var featured by remember { mutableStateOf<List<HidiProduct>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    val saved = remember { store.saved().toMutableStateSet() }

    LaunchedEffect(Unit) {
        products = repository.products()
        featured = repository.featured().ifEmpty { products.take(8) }
        loading = false
    }

    LaunchedEffect(products, initialPath) {
        if (products.isEmpty() || initialPath.isBlank()) return@LaunchedEffect
        when {
            initialPath.startsWith("/products/") -> {
                val slug = initialPath.removePrefix("/products/").substringBefore("/")
                products.firstOrNull { it.slug == slug }?.let { screen = AtelierScreen.Product(it) }
            }
            initialPath.startsWith("/collections") -> screen = AtelierScreen.Discover
            initialPath.startsWith("/wishlist") -> screen = AtelierScreen.Saved
            initialPath.startsWith("/cart") -> screen = AtelierScreen.Bag
        }
    }

    fun setTab(tab: AtelierScreen) {
        previousTab = tab
        screen = tab
    }

    fun openProduct(product: HidiProduct) {
        if (screen is AtelierScreen.Home || screen is AtelierScreen.Discover || screen is AtelierScreen.Saved) {
            previousTab = screen
        }
        screen = AtelierScreen.Product(product)
    }

    fun toggleSaved(slug: String) {
        val now = store.toggleSaved(slug)
        if (now) saved.add(slug) else saved.remove(slug)
    }

    BackHandler(enabled = screen !is AtelierScreen.Home) {
        screen = when (screen) {
            is AtelierScreen.Product, AtelierScreen.Bag, is AtelierScreen.Bridge -> previousTab
            AtelierScreen.Discover, AtelierScreen.Saved, AtelierScreen.You -> AtelierScreen.Home
            AtelierScreen.Home -> AtelierScreen.Home
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AtelierColors.Canvas)
    ) {
        AnimatedContent(
            targetState = screen,
            transitionSpec = { (fadeIn() + scaleIn(initialScale = .99f)) togetherWith fadeOut() },
            label = "atelier-screen",
            modifier = Modifier.fillMaxSize()
        ) { target ->
            when (target) {
                AtelierScreen.Home -> HomeScreen(
                    featured = featured,
                    loading = loading,
                    saved = saved,
                    onDiscover = { setTab(AtelierScreen.Discover) },
                    onProduct = ::openProduct,
                    onSavedToggle = ::toggleSaved,
                    onBag = { screen = AtelierScreen.Bag },
                )
                AtelierScreen.Discover -> DiscoverScreen(
                    products = products,
                    saved = saved,
                    onProduct = ::openProduct,
                    onSavedToggle = ::toggleSaved,
                    onBag = { screen = AtelierScreen.Bag },
                )
                AtelierScreen.Saved -> SavedScreen(
                    products = products.filter { it.slug in saved },
                    saved = saved,
                    onProduct = ::openProduct,
                    onSavedToggle = ::toggleSaved,
                    onDiscover = { setTab(AtelierScreen.Discover) },
                    onBag = { screen = AtelierScreen.Bag },
                )
                AtelierScreen.You -> YouScreen(
                    onBag = { screen = AtelierScreen.Bag },
                    onOpen = { path -> screen = AtelierScreen.Bridge(path) },
                )
                AtelierScreen.Bag -> BagScreen(
                    repository = repository,
                    onBack = { screen = previousTab },
                    onDiscover = { setTab(AtelierScreen.Discover) },
                    onCheckout = { screen = AtelierScreen.Bridge("/checkout") },
                )
                is AtelierScreen.Product -> ProductScreen(
                    product = target.product,
                    saved = target.product.slug in saved,
                    repository = repository,
                    onBack = { screen = previousTab },
                    onBag = { screen = AtelierScreen.Bag },
                    onSavedToggle = { toggleSaved(target.product.slug) },
                )
                is AtelierScreen.Bridge -> BridgeScreen(
                    path = target.path,
                    cartSession = store.cartSession(),
                    onClose = { screen = previousTab },
                )
            }
        }

        if (screen is AtelierScreen.Home || screen is AtelierScreen.Discover ||
            screen is AtelierScreen.Saved || screen is AtelierScreen.You
        ) {
            AtelierDock(
                current = screen,
                onHome = { setTab(AtelierScreen.Home) },
                onDiscover = { setTab(AtelierScreen.Discover) },
                onSaved = { setTab(AtelierScreen.Saved) },
                onYou = { setTab(AtelierScreen.You) },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(
                        bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + 12.dp
                    )
            )
        }
    }
}

@Composable
private fun HomeScreen(
    featured: List<HidiProduct>,
    loading: Boolean,
    saved: Set<String>,
    onDiscover: () -> Unit,
    onProduct: (HidiProduct) -> Unit,
    onSavedToggle: (String) -> Unit,
    onBag: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 126.dp),
    ) {
        item {
            EditorialHero(
                image = HERO,
                eyebrow = "HIDI / ATELIER 01",
                title = "Made for\nyour kind of day.",
                cta = "Enter the new edit",
                onCta = onDiscover,
                onBag = onBag,
            )
        }

        item {
            EditorialHeading(
                eyebrow = "A QUIETER WAY TO SHOP",
                title = "Dress by feeling,\nnot by category.",
                modifier = Modifier.padding(top = 42.dp)
            )
        }

        item {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 18.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                val stories = listOf(
                    Triple("01", "WORK", featured.getOrNull(0)?.primaryImage.orEmpty()),
                    Triple("02", "EVERYDAY", featured.getOrNull(1)?.primaryImage.orEmpty()),
                    Triple("03", "OCCASION", featured.getOrNull(2)?.primaryImage.orEmpty()),
                    Triple("04", "ANANYA", ANANYA),
                )
                items(stories) { story ->
                    StoryCard(story.first, story.second, story.third, onDiscover)
                }
            }
        }

        item {
            SectionTitle(
                eyebrow = "NEW NOW",
                title = "Freshly arrived.",
                action = "SEE ALL",
                onAction = onDiscover,
            )
        }

        item {
            if (loading) {
                Box(Modifier.fillMaxWidth().height(300.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(
                        color = AtelierColors.Wine,
                        strokeWidth = 1.5.dp,
                        modifier = Modifier.size(26.dp),
                    )
                }
            } else {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 18.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    items(featured.take(6), key = { it.slug }) { product ->
                        EditorialProduct(
                            product = product,
                            width = 218.dp,
                            saved = product.slug in saved,
                            onClick = { onProduct(product) },
                            onSaved = { onSavedToggle(product.slug) },
                        )
                    }
                }
            }
        }

        item {
            Spacer(Modifier.height(48.dp))
            EditorialPanel(
                image = ANANYA,
                eyebrow = "ANANYA / 01",
                title = "The pieces I would\nactually wear.",
                action = "SEE HER EDIT",
                onClick = onDiscover,
            )
        }

        item {
            Column(Modifier.padding(horizontal = 22.dp, vertical = 48.dp)) {
                SmallCaps("THE HIDI POINT OF VIEW")
                Text(
                    "Less noise. Better pieces.",
                    color = AtelierColors.Ink,
                    fontFamily = FontFamily.Serif,
                    fontSize = 34.sp,
                    lineHeight = 37.sp,
                    modifier = Modifier.padding(top = 10.dp),
                )
                Text(
                    "Indian wear with proportion, comfort and presence at the centre.",
                    color = AtelierColors.Muted,
                    fontSize = 14.sp,
                    lineHeight = 21.sp,
                    modifier = Modifier.padding(top = 12.dp, end = 36.dp),
                )
            }
        }
    }
}

@Composable
private fun EditorialHero(
    image: String,
    eyebrow: String,
    title: String,
    cta: String,
    onCta: () -> Unit,
    onBag: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(720.dp)
            .background(AtelierColors.Sage)
    ) {
        AtelierImage(image, Modifier.fillMaxSize())
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0f to Color.Transparent,
                        .55f to Color.Transparent,
                        1f to Color(0xD9211717)
                    )
                )
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 14.dp,
                    start = 20.dp,
                    end = 14.dp,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "HIDI",
                color = Color.White,
                fontSize = 21.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 5.sp,
                modifier = Modifier.weight(1f),
            )
            FloatingIcon(Icons.Outlined.ShoppingBag, "Bag", onBag, dark = true)
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(horizontal = 22.dp, vertical = 34.dp)
        ) {
            Text(
                eyebrow,
                color = AtelierColors.Gold,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 2.sp,
            )
            Text(
                title,
                color = Color.White,
                fontFamily = FontFamily.Serif,
                fontSize = 44.sp,
                lineHeight = 45.sp,
                modifier = Modifier.padding(top = 10.dp, bottom = 22.dp),
            )
            Row(
                modifier = Modifier.clickable(onClick = onCta),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    cta,
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Icon(
                    Icons.Outlined.ArrowForward,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.padding(start = 10.dp).size(18.dp),
                )
            }
        }
    }
}

@Composable
private fun EditorialHeading(
    eyebrow: String,
    title: String,
    modifier: Modifier = Modifier,
) {
    Column(modifier.padding(horizontal = 22.dp, vertical = 20.dp)) {
        SmallCaps(eyebrow)
        Text(
            title,
            color = AtelierColors.Ink,
            fontFamily = FontFamily.Serif,
            fontSize = 31.sp,
            lineHeight = 34.sp,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

@Composable
private fun StoryCard(index: String, title: String, image: String, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .width(118.dp)
            .clickable(onClick = onClick)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(164.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(AtelierColors.Sage)
        ) {
            AtelierImage(image, Modifier.fillMaxSize())
            Text(
                index,
                color = Color.White,
                fontSize = 9.sp,
                letterSpacing = 1.sp,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(10.dp),
            )
        }
        Text(
            title,
            color = AtelierColors.Ink,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.4.sp,
            modifier = Modifier.padding(top = 9.dp),
        )
    }
}

@Composable
private fun SectionTitle(
    eyebrow: String,
    title: String,
    action: String,
    onAction: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 22.dp, end = 18.dp, top = 46.dp, bottom = 18.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        Column(Modifier.weight(1f)) {
            SmallCaps(eyebrow)
            Text(
                title,
                color = AtelierColors.Ink,
                fontFamily = FontFamily.Serif,
                fontSize = 27.sp,
                modifier = Modifier.padding(top = 5.dp),
            )
        }
        Text(
            action,
            color = AtelierColors.Wine,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.1.sp,
            modifier = Modifier
                .clickable(onClick = onAction)
                .padding(10.dp),
        )
    }
}

@Composable
private fun EditorialProduct(
    product: HidiProduct,
    width: androidx.compose.ui.unit.Dp,
    saved: Boolean,
    onClick: () -> Unit,
    onSaved: () -> Unit,
) {
    Column(
        modifier = Modifier
            .width(width)
            .clickable(onClick = onClick)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(width * 1.4f)
                .background(AtelierColors.Sage)
        ) {
            AtelierImage(product.primaryImage, Modifier.fillMaxSize())
            IconButton(
                onClick = onSaved,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(7.dp)
                    .size(40.dp)
                    .background(Color.White.copy(alpha = .86f), CircleShape)
            ) {
                Icon(
                    if (saved) Icons.Outlined.Favorite else Icons.Outlined.FavoriteBorder,
                    contentDescription = "Save",
                    tint = if (saved) AtelierColors.Wine else AtelierColors.Ink,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
        Text(
            product.name,
            color = AtelierColors.Ink,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 11.dp),
        )
        Text(
            money(product.minPricePaise),
            color = AtelierColors.Muted,
            fontSize = 12.sp,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

@Composable
private fun EditorialPanel(
    image: String,
    eyebrow: String,
    title: String,
    action: String,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(510.dp)
            .clickable(onClick = onClick)
    ) {
        AtelierImage(image, Modifier.fillMaxSize())
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(Color.Transparent, Color.Transparent, Color(0xC8211717))
                    )
                )
        )
        Column(
            Modifier
                .align(Alignment.BottomStart)
                .padding(22.dp, 26.dp)
        ) {
            Text(eyebrow, color = AtelierColors.Gold, fontSize = 10.sp, letterSpacing = 1.8.sp)
            Text(
                title,
                color = Color.White,
                fontFamily = FontFamily.Serif,
                fontSize = 31.sp,
                lineHeight = 34.sp,
                modifier = Modifier.padding(top = 8.dp, bottom = 15.dp),
            )
            Text(
                action,
                color = Color.White,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.4.sp,
            )
        }
    }
}

@Composable
private fun DiscoverScreen(
    products: List<HidiProduct>,
    saved: Set<String>,
    onProduct: (HidiProduct) -> Unit,
    onSavedToggle: (String) -> Unit,
    onBag: () -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf("ALL") }

    val filtered = remember(products, query, filter) {
        products.filter { product ->
            val filterMatch = filter == "ALL" || when (filter) {
                "NEW" -> product.inStock
                "WORK" -> "work-edit" in product.collections
                "EVERYDAY" -> "everyday" in product.collections
                "OCCASION" -> "occasion" in product.collections
                else -> true
            }
            val q = query.trim().lowercase()
            val searchMatch = q.isBlank() ||
                product.name.lowercase().contains(q) ||
                product.description.lowercase().contains(q) ||
                product.variants.any { it.color.lowercase().contains(q) }
            filterMatch && searchMatch
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding())
    ) {
        AtelierHeader(title = "DISCOVER", onBag = onBag)

        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 14.dp, end = 14.dp, bottom = 124.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(22.dp),
        ) {
            item(span = { GridItemSpan(2) }) {
                Column(Modifier.padding(horizontal = 8.dp, vertical = 22.dp)) {
                    Text(
                        "What are you\nin the mood for?",
                        color = AtelierColors.Ink,
                        fontFamily = FontFamily.Serif,
                        fontSize = 34.sp,
                        lineHeight = 36.sp,
                    )
                    SearchLine(
                        value = query,
                        onValueChange = { query = it },
                        modifier = Modifier.padding(top = 24.dp),
                    )
                }
            }

            item(span = { GridItemSpan(2) }) {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(20.dp),
                ) {
                    items(listOf("ALL", "NEW", "WORK", "EVERYDAY", "OCCASION")) { value ->
                        Text(
                            value,
                            color = if (filter == value) AtelierColors.Ink else AtelierColors.Muted,
                            fontSize = 10.sp,
                            fontWeight = if (filter == value) FontWeight.Bold else FontWeight.Medium,
                            letterSpacing = 1.4.sp,
                            modifier = Modifier
                                .clickable { filter = value }
                                .padding(vertical = 12.dp)
                                .drawWithContent {
                                    drawContent()
                                    if (filter == value) {
                                        drawLine(
                                            color = AtelierColors.Wine,
                                            start = Offset(0f, size.height),
                                            end = Offset(size.width, size.height),
                                            strokeWidth = 2.dp.toPx(),
                                        )
                                    }
                                }
                        )
                    }
                }
            }

            item(span = { GridItemSpan(2) }) {
                Text(
                    "${filtered.size} PIECES",
                    color = AtelierColors.Muted,
                    fontSize = 9.sp,
                    letterSpacing = 1.5.sp,
                    modifier = Modifier.padding(start = 8.dp, top = 10.dp, bottom = 4.dp),
                )
            }

            items(filtered, key = { it.slug }) { product ->
                EditorialProduct(
                    product = product,
                    width = 180.dp,
                    saved = product.slug in saved,
                    onClick = { onProduct(product) },
                    onSaved = { onSavedToggle(product.slug) },
                )
            }
        }
    }
}

@Composable
private fun SavedScreen(
    products: List<HidiProduct>,
    saved: Set<String>,
    onProduct: (HidiProduct) -> Unit,
    onSavedToggle: (String) -> Unit,
    onDiscover: () -> Unit,
    onBag: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding())
    ) {
        AtelierHeader(title = "YOUR EDIT", onBag = onBag)
        if (products.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(horizontal = 42.dp)
                ) {
                    Text("♡", fontSize = 34.sp, color = AtelierColors.Wine)
                    Text(
                        "Keep only what\nyou really love.",
                        color = AtelierColors.Ink,
                        fontFamily = FontFamily.Serif,
                        fontSize = 30.sp,
                        lineHeight = 33.sp,
                        modifier = Modifier.padding(top = 14.dp),
                    )
                    Text(
                        "Your private shortlist lives here.",
                        color = AtelierColors.Muted,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(top = 12.dp, bottom = 24.dp),
                    )
                    AtelierTextAction("DISCOVER HIDI", onDiscover)
                }
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 28.dp, bottom = 124.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(24.dp),
            ) {
                item(span = { GridItemSpan(2) }) {
                    EditorialHeading(
                        eyebrow = "YOUR PRIVATE SHORTLIST",
                        title = "Pieces worth\ncoming back to.",
                    )
                }
                items(products, key = { it.slug }) { product ->
                    EditorialProduct(
                        product = product,
                        width = 180.dp,
                        saved = product.slug in saved,
                        onClick = { onProduct(product) },
                        onSaved = { onSavedToggle(product.slug) },
                    )
                }
            }
        }
    }
}

@Composable
private fun YouScreen(onBag: () -> Unit, onOpen: (String) -> Unit) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()),
        contentPadding = PaddingValues(bottom = 126.dp),
    ) {
        item { AtelierHeader(title = "YOU", onBag = onBag) }
        item {
            Column(Modifier.padding(horizontal = 22.dp, vertical = 26.dp)) {
                SmallCaps("HIDI PRIVÉ")
                Text(
                    "Your HIDI,\nin one quiet place.",
                    color = AtelierColors.Ink,
                    fontFamily = FontFamily.Serif,
                    fontSize = 35.sp,
                    lineHeight = 37.sp,
                    modifier = Modifier.padding(top = 8.dp),
                )
                Text(
                    "Sign in for orders, wallet, rewards, returns and preferences.",
                    color = AtelierColors.Muted,
                    fontSize = 13.sp,
                    lineHeight = 20.sp,
                    modifier = Modifier.padding(top = 12.dp, bottom = 22.dp),
                )
                AtelierTextAction("SIGN IN / CONTINUE") { onOpen("/account") }
            }
        }

        item {
            Column(Modifier.padding(horizontal = 22.dp, vertical = 16.dp)) {
                listOf(
                    "Orders" to "/account",
                    "Returns & exchanges" to "/account",
                    "Wallet & rewards" to "/account",
                    "Shipping & delivery" to "/shipping",
                    "About HIDI" to "/about",
                ).forEachIndexed { index, (label, path) ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onOpen(path) }
                            .padding(vertical = 18.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            label,
                            color = AtelierColors.Ink,
                            fontSize = 14.sp,
                            modifier = Modifier.weight(1f),
                        )
                        Icon(
                            Icons.Outlined.ArrowForward,
                            contentDescription = null,
                            tint = AtelierColors.Muted,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                    if (index < 4) HorizontalDivider(color = AtelierColors.Line, thickness = .7.dp)
                }
            }
        }
    }
}

@Composable
private fun ProductScreen(
    product: HidiProduct,
    saved: Boolean,
    repository: HidiRepository,
    onBack: () -> Unit,
    onBag: () -> Unit,
    onSavedToggle: () -> Unit,
) {
    var color by remember(product.slug) { mutableStateOf(product.variants.firstOrNull()?.color.orEmpty()) }
    var selected by remember(product.slug) { mutableStateOf<HidiVariant?>(null) }
    var adding by remember { mutableStateOf(false) }
    var added by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val images = product.images.ifEmpty { listOf(product.primaryImage) }.filter { it.isNotBlank() }
    val pager = rememberPagerState(pageCount = { maxOf(images.size, 1) })
    val colors = product.variants.map { it.color }.filter { it.isNotBlank() }.distinct()
    val sizes = product.variants.filter { color.isBlank() || it.color == color }

    Box(Modifier.fillMaxSize().background(AtelierColors.Canvas)) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 104.dp),
        ) {
            item {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(610.dp)
                        .background(AtelierColors.Sage)
                ) {
                    if (images.isNotEmpty()) {
                        HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
                            AtelierImage(images[page], Modifier.fillMaxSize())
                        }
                    }

                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(
                                top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 12.dp,
                                start = 12.dp,
                                end = 12.dp,
                            ),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        FloatingIcon(Icons.Outlined.ArrowBack, "Back", onBack)
                        Spacer(Modifier.weight(1f))
                        FloatingIcon(
                            if (saved) Icons.Outlined.Favorite else Icons.Outlined.FavoriteBorder,
                            "Save",
                            onSavedToggle,
                        )
                        Spacer(Modifier.width(8.dp))
                        FloatingIcon(Icons.Outlined.ShoppingBag, "Bag", onBag)
                    }

                    if (images.size > 1) {
                        Row(
                            Modifier
                                .align(Alignment.BottomCenter)
                                .padding(bottom = 16.dp),
                            horizontalArrangement = Arrangement.spacedBy(5.dp),
                        ) {
                            repeat(images.size) { index ->
                                Box(
                                    Modifier
                                        .width(if (pager.currentPage == index) 20.dp else 5.dp)
                                        .height(3.dp)
                                        .background(
                                            if (pager.currentPage == index) AtelierColors.Ink else Color.White.copy(.72f),
                                            CircleShape
                                        )
                                )
                            }
                        }
                    }
                }
            }

            item {
                Column(Modifier.padding(horizontal = 22.dp, vertical = 28.dp)) {
                    SmallCaps("HIDI / ATELIER")
                    Text(
                        product.name,
                        color = AtelierColors.Ink,
                        fontFamily = FontFamily.Serif,
                        fontSize = 31.sp,
                        lineHeight = 34.sp,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    Text(
                        money(selected?.pricePaise ?: product.minPricePaise),
                        color = AtelierColors.Ink,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(top = 10.dp),
                    )
                    if (product.description.isNotBlank()) {
                        Text(
                            product.description,
                            color = AtelierColors.Muted,
                            fontSize = 13.sp,
                            lineHeight = 20.sp,
                            modifier = Modifier.padding(top = 18.dp),
                        )
                    }
                }
            }

            if (colors.size > 1) {
                item {
                    ChoiceStrip(
                        label = "COLOUR",
                        values = colors,
                        selected = color,
                        onSelected = {
                            color = it
                            selected = null
                        }
                    )
                }
            }

            item {
                Column(Modifier.padding(horizontal = 22.dp, vertical = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        SmallCaps("CHOOSE SIZE")
                        Spacer(Modifier.weight(1f))
                        Text("HIDI FIT", color = AtelierColors.Wine, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.padding(top = 13.dp),
                    ) {
                        items(sizes) { variant ->
                            val active = selected?.id == variant.id
                            Text(
                                variant.size,
                                color = if (active) Color.White else AtelierColors.Ink,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier
                                    .background(
                                        if (active) AtelierColors.Ink else Color.Transparent,
                                        RoundedCornerShape(50)
                                    )
                                    .clickable(enabled = variant.available > 0) {
                                        selected = if (active) null else variant
                                        added = false
                                    }
                                    .alpha(if (variant.available > 0) 1f else .3f)
                                    .padding(horizontal = 17.dp, vertical = 11.dp)
                            )
                        }
                    }
                }
            }

            item {
                Column(Modifier.padding(horizontal = 22.dp, vertical = 32.dp)) {
                    HorizontalDivider(color = AtelierColors.Line, thickness = .7.dp)
                    DetailLine("FABRIC", product.fabric.ifBlank { "See product care instructions" })
                    HorizontalDivider(color = AtelierColors.Line, thickness = .7.dp)
                    DetailLine("DELIVERY", "Complimentary shipping on ₹1,499+")
                    HorizontalDivider(color = AtelierColors.Line, thickness = .7.dp)
                    DetailLine("EXCHANGE", "Eligible exchanges within 7 days")
                }
            }
        }

        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(AtelierColors.Paper)
                .padding(
                    start = 14.dp,
                    end = 14.dp,
                    top = 10.dp,
                    bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + 10.dp
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                when {
                    added -> "ADDED · VIEW BAG"
                    adding -> "ADDING…"
                    selected == null -> "CHOOSE A SIZE"
                    else -> "ADD TO BAG · ${money(selected!!.pricePaise)}"
                },
                color = Color.White,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        if (selected != null || added) AtelierColors.Ink else AtelierColors.Ink.copy(.38f),
                        RoundedCornerShape(2.dp)
                    )
                    .clickable(enabled = selected != null && !adding) {
                        if (added) {
                            onBag()
                        } else {
                            scope.launch {
                                adding = true
                                repository.addToCart(selected!!.id)
                                adding = false
                                added = true
                            }
                        }
                    }
                    .padding(vertical = 18.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
    }
}

@Composable
private fun BagScreen(
    repository: HidiRepository,
    onBack: () -> Unit,
    onDiscover: () -> Unit,
    onCheckout: () -> Unit,
) {
    var cart by remember { mutableStateOf<HidiCart?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    suspend fun reload() {
        busy = true
        cart = repository.cart()
        busy = false
    }

    LaunchedEffect(Unit) { reload() }

    Column(
        Modifier
            .fillMaxSize()
            .background(AtelierColors.Canvas)
            .padding(top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding())
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FloatingIcon(Icons.Outlined.ArrowBack, "Back", onBack)
            Text(
                "YOUR BAG",
                color = AtelierColors.Ink,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 2.sp,
                modifier = Modifier.weight(1f),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            Spacer(Modifier.size(44.dp))
        }

        when {
            cart == null || busy -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = AtelierColors.Wine, strokeWidth = 1.5.dp)
            }
            cart!!.items.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        "Your bag is\nbeautifully empty.",
                        color = AtelierColors.Ink,
                        fontFamily = FontFamily.Serif,
                        fontSize = 30.sp,
                        lineHeight = 33.sp,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                    Text(
                        "Keep it intentional.",
                        color = AtelierColors.Muted,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(top = 10.dp, bottom = 22.dp),
                    )
                    AtelierTextAction("DISCOVER HIDI", onDiscover)
                }
            }
            else -> Box(Modifier.fillMaxSize()) {
                LazyColumn(
                    contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 10.dp, bottom = 130.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    items(cart!!.items, key = { it.id }) { item ->
                        BagItem(
                            item = item,
                            onMinus = {
                                scope.launch {
                                    cart = if (item.quantity <= 1) repository.removeCart(item.id)
                                    else repository.updateCart(item.id, item.quantity - 1)
                                }
                            },
                            onPlus = {
                                scope.launch { cart = repository.updateCart(item.id, item.quantity + 1) }
                            },
                            onRemove = {
                                scope.launch { cart = repository.removeCart(item.id) }
                            },
                        )
                    }
                    item {
                        Column(Modifier.padding(top = 20.dp)) {
                            HorizontalDivider(color = AtelierColors.Line, thickness = .7.dp)
                            Row(
                                Modifier.fillMaxWidth().padding(vertical = 18.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text("Subtotal", color = AtelierColors.Muted, fontSize = 12.sp, modifier = Modifier.weight(1f))
                                Text(money(cart!!.subtotalPaise), color = AtelierColors.Ink, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                            }
                            Text(
                                if (cart!!.subtotalPaise >= 149900) "Complimentary shipping unlocked"
                                else "Shipping calculated at checkout",
                                color = AtelierColors.Muted,
                                fontSize = 11.sp,
                            )
                        }
                    }
                }

                Text(
                    "SECURE CHECKOUT · ${money(cart!!.subtotalPaise)}",
                    color = Color.White,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .background(AtelierColors.Ink)
                        .clickable(onClick = onCheckout)
                        .padding(
                            top = 19.dp,
                            bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + 19.dp
                        ),
                )
            }
        }
    }
}

@Composable
private fun BagItem(
    item: HidiCartItem,
    onMinus: () -> Unit,
    onPlus: () -> Unit,
    onRemove: () -> Unit,
) {
    Row(Modifier.fillMaxWidth()) {
        AtelierImage(
            item.productImage,
            Modifier
                .width(104.dp)
                .height(138.dp)
                .background(AtelierColors.Sage)
        )
        Column(Modifier.padding(start = 15.dp).weight(1f)) {
            Text(item.productName, color = AtelierColors.Ink, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 2)
            Text(
                "${item.color} · Size ${item.size}",
                color = AtelierColors.Muted,
                fontSize = 11.sp,
                modifier = Modifier.padding(top = 5.dp),
            )
            Text(
                money(item.lineTotalPaise),
                color = AtelierColors.Ink,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 8.dp),
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(top = 15.dp),
            ) {
                IconButton(onClick = onMinus, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Outlined.Remove, null, tint = AtelierColors.Ink, modifier = Modifier.size(16.dp))
                }
                Text(item.quantity.toString(), color = AtelierColors.Ink, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 8.dp))
                IconButton(onClick = onPlus, modifier = Modifier.size(32.dp), enabled = item.available <= 0 || item.quantity < item.available) {
                    Icon(Icons.Outlined.Add, null, tint = AtelierColors.Ink, modifier = Modifier.size(16.dp))
                }
                Text(
                    "REMOVE",
                    color = AtelierColors.Wine,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp,
                    modifier = Modifier.clickable(onClick = onRemove).padding(start = 17.dp, top = 8.dp, bottom = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun BridgeScreen(path: String, cartSession: String, onClose: () -> Unit) {
    val context = LocalContext.current
    val url = remember(path) {
        BuildConfig.HIDI_START_URL.trimEnd('/') + if (path.startsWith("/")) path else "/$path"
    }

    Box(Modifier.fillMaxSize().background(AtelierColors.Canvas)) {
        AndroidView(
            factory = {
                WebView(it).apply {
                    setBackgroundColor(android.graphics.Color.rgb(245, 241, 235))
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.databaseEnabled = true
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
                            if (scheme == "http" || scheme == "https") return false
                            runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, target)) }
                            return true
                        }

                        override fun onPageFinished(view: WebView, url: String) {
                            val safeSession = cartSession.replace("'", "")
                            view.evaluateJavascript(
                                "try{localStorage.setItem('hidi_cart_session','$safeSession')}catch(e){}",
                                null
                            )
                            val css = "header,footer{display:none!important}body{padding-top:0!important;background:#f5f1eb!important}main{padding-top:8px!important}"
                            view.evaluateJavascript(
                                "(function(){var s=document.getElementById('hidi-app');if(!s){s=document.createElement('style');s.id='hidi-app';document.head.appendChild(s)}s.textContent=${org.json.JSONObject.quote(css)}})()",
                                null
                            )
                        }
                    }
                    loadUrl(url)
                }
            },
            modifier = Modifier.fillMaxSize(),
        )

        FloatingIcon(
            Icons.Outlined.Close,
            "Close",
            onClose,
            modifier = Modifier
                .padding(
                    top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 10.dp,
                    start = 12.dp
                )
                .align(Alignment.TopStart)
        )
    }
}

@Composable
private fun AtelierDock(
    current: AtelierScreen,
    onHome: () -> Unit,
    onDiscover: () -> Unit,
    onSaved: () -> Unit,
    onYou: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .shadow(20.dp, RoundedCornerShape(28.dp), ambientColor = Color.Black.copy(.12f))
            .background(AtelierColors.Paper.copy(alpha = .97f), RoundedCornerShape(28.dp))
            .padding(horizontal = 8.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        DockItem(Icons.Outlined.Home, "Home", current is AtelierScreen.Home, onHome)
        DockItem(Icons.Outlined.Explore, "Discover", current is AtelierScreen.Discover, onDiscover)
        DockItem(
            if (current is AtelierScreen.Saved) Icons.Outlined.Favorite else Icons.Outlined.FavoriteBorder,
            "Saved",
            current is AtelierScreen.Saved,
            onSaved
        )
        DockItem(Icons.Outlined.PersonOutline, "You", current is AtelierScreen.You, onYou)
    }
}

@Composable
private fun DockItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clip(RoundedCornerShape(22.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 17.dp, vertical = 8.dp),
    ) {
        Icon(
            icon,
            contentDescription = label,
            tint = if (selected) AtelierColors.Wine else AtelierColors.Muted,
            modifier = Modifier.size(20.dp),
        )
        Text(
            label,
            color = if (selected) AtelierColors.Wine else AtelierColors.Muted,
            fontSize = 8.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(top = 3.dp),
        )
    }
}

@Composable
private fun AtelierHeader(title: String, onBag: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "HIDI",
            color = AtelierColors.Ink,
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 4.sp,
            modifier = Modifier.weight(1f),
        )
        Text(
            title,
            color = AtelierColors.Muted,
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.8.sp,
            modifier = Modifier.padding(end = 10.dp),
        )
        FloatingIcon(Icons.Outlined.ShoppingBag, "Bag", onBag)
    }
}

@Composable
private fun FloatingIcon(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
    dark: Boolean = false,
    modifier: Modifier = Modifier,
) {
    IconButton(
        onClick = onClick,
        modifier = modifier
            .size(44.dp)
            .background(
                if (dark) Color.Black.copy(alpha = .18f) else AtelierColors.Paper.copy(alpha = .94f),
                CircleShape
            )
    ) {
        Icon(
            icon,
            contentDescription = label,
            tint = if (dark) Color.White else AtelierColors.Ink,
            modifier = Modifier.size(19.dp),
        )
    }
}

@Composable
private fun SearchLine(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier
            .fillMaxWidth()
            .padding(bottom = 7.dp)
            .drawWithContent {
                drawContent()
                drawLine(
                    color = AtelierColors.Line,
                    start = Offset(0f, size.height),
                    end = Offset(size.width, size.height),
                    strokeWidth = 1.dp.toPx()
                )
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.Search, null, tint = AtelierColors.Muted, modifier = Modifier.size(19.dp))
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            cursorBrush = SolidColor(AtelierColors.Wine),
            textStyle = TextStyle(color = AtelierColors.Ink, fontSize = 14.sp),
            decorationBox = { inner ->
                Box(Modifier.padding(horizontal = 11.dp, vertical = 13.dp)) {
                    if (value.isBlank()) {
                        Text("Search style, colour or mood", color = AtelierColors.Muted, fontSize = 14.sp)
                    }
                    inner()
                }
            },
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun ChoiceStrip(
    label: String,
    values: List<String>,
    selected: String,
    onSelected: (String) -> Unit,
) {
    Column(Modifier.padding(horizontal = 22.dp, vertical = 12.dp)) {
        SmallCaps(label)
        LazyRow(
            modifier = Modifier.padding(top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            items(values) { value ->
                Text(
                    value,
                    color = if (value == selected) AtelierColors.Ink else AtelierColors.Muted,
                    fontSize = 12.sp,
                    fontWeight = if (value == selected) FontWeight.Bold else FontWeight.Normal,
                    modifier = Modifier.clickable { onSelected(value) }.padding(vertical = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun DetailLine(label: String, value: String) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 17.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text(label, color = AtelierColors.Ink, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.width(90.dp))
        Text(value, color = AtelierColors.Muted, fontSize = 12.sp, lineHeight = 18.sp, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun SmallCaps(text: String) {
    Text(
        text,
        color = AtelierColors.Gold,
        fontSize = 9.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 1.7.sp,
    )
}

@Composable
private fun AtelierTextAction(label: String, onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.clickable(onClick = onClick).padding(vertical = 8.dp),
    ) {
        Text(label, color = AtelierColors.Wine, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.3.sp)
        Icon(Icons.Outlined.ArrowForward, null, tint = AtelierColors.Wine, modifier = Modifier.padding(start = 9.dp).size(15.dp))
    }
}

@Composable
private fun AtelierImage(url: String, modifier: Modifier) {
    val context = LocalContext.current
    AsyncImage(
        model = ImageRequest.Builder(context)
            .data(url)
            .crossfade(220)
            .build(),
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier,
    )
}

private fun money(paise: Int): String =
    NumberFormat.getCurrencyInstance(Locale("en", "IN")).apply {
        maximumFractionDigits = 0
    }.format(paise / 100.0)
