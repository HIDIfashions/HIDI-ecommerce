package com.thehidi.app

import android.net.Uri
import android.widget.VideoView
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ArrowForward
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Sort
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.launch

private const val HERO = "https://thidigk.thehidi.com/brand/hidi-hero-green-garden-fullbody.webp"
private const val ANANYA = "https://thidigk.thehidi.com/brand/hidi-manifesto-ananya.webp"

private sealed interface CommerceRoute {
    data class Tab(val tab: CommerceTab) : CommerceRoute
    data object Search : CommerceRoute
    data object Bag : CommerceRoute
    data class Product(val product: HidiProduct) : CommerceRoute
    data class Bridge(val path: String) : CommerceRoute
}

enum class ProductSort { RECOMMENDED, NEWEST, PRICE_LOW, PRICE_HIGH }

@Composable
fun HidiCommerceApp(initialPath: String = "") {
    val context = androidx.compose.ui.platform.LocalContext.current
    val store = remember { HidiStore(context) }
    val repo = remember { HidiRepository(store) }
    val scope = rememberCoroutineScope()

    var route by remember { mutableStateOf<CommerceRoute>(CommerceRoute.Tab(CommerceTab.HOME)) }
    var previousTab by remember { mutableStateOf(CommerceTab.HOME) }
    var products by remember { mutableStateOf<List<HidiProduct>>(emptyList()) }
    var featured by remember { mutableStateOf<List<HidiProduct>>(emptyList()) }
    var bestSellers by remember { mutableStateOf<List<HidiProduct>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var saved by remember { mutableStateOf(store.saved()) }
    var cartCount by remember { mutableStateOf(0) }

    var shopCollection by rememberSaveable { mutableStateOf("ALL") }
    var shopSort by rememberSaveable { mutableStateOf(ProductSort.RECOMMENDED) }
    var shopSizes by rememberSaveable { mutableStateOf(setOf<String>()) }
    var shopPriceMax by rememberSaveable { mutableStateOf<Int?>(null) }
    val shopGridState = rememberLazyGridState()

    fun openTab(tab: CommerceTab) {
        previousTab = tab
        route = CommerceRoute.Tab(tab)
    }
    fun openProduct(product: HidiProduct) {
        (route as? CommerceRoute.Tab)?.let { previousTab = it.tab }
        route = CommerceRoute.Product(product)
    }
    fun toggleSaved(slug: String) {
        store.toggleSaved(slug)
        saved = store.saved()
    }

    LaunchedEffect(Unit) {
        products = repo.products()
        featured = repo.featured().ifEmpty { products.take(8) }
        bestSellers = repo.bestSellers().ifEmpty { products.sortedByDescending { it.soldQuantity }.take(8) }
        cartCount = repo.cart().itemCount
        loading = false
    }

    LaunchedEffect(products, initialPath) {
        if (products.isEmpty() || initialPath.isBlank()) return@LaunchedEffect
        when {
            initialPath.startsWith("/products/") -> {
                val slug = initialPath.removePrefix("/products/").substringBefore("/")
                products.firstOrNull { it.slug == slug }?.let { route = CommerceRoute.Product(it) }
            }
            initialPath.startsWith("/cart") -> route = CommerceRoute.Bag
            initialPath.startsWith("/wishlist") -> openTab(CommerceTab.WISHLIST)
            initialPath.startsWith("/collections") -> openTab(CommerceTab.SHOP)
        }
    }

    BackHandler(enabled = route !is CommerceRoute.Tab || (route as? CommerceRoute.Tab)?.tab != CommerceTab.HOME) {
        route = when (val r = route) {
            is CommerceRoute.Product, CommerceRoute.Bag, is CommerceRoute.Bridge, CommerceRoute.Search ->
                CommerceRoute.Tab(previousTab)
            is CommerceRoute.Tab -> CommerceRoute.Tab(CommerceTab.HOME)
        }
    }

    Box(Modifier.fillMaxSize().background(CommerceColors.Canvas)) {
        AnimatedContent(
            targetState = route,
            transitionSpec = { fadeIn() togetherWith fadeOut() },
            label = "commerce-route",
            modifier = Modifier.fillMaxSize(),
        ) { target ->
            when (target) {
                is CommerceRoute.Tab -> when (target.tab) {
                    CommerceTab.HOME -> CommerceHomeScreen(
                        featured = featured,
                        bestSellers = bestSellers,
                        loading = loading,
                        saved = saved,
                        cartCount = cartCount,
                        onSearch = { route = CommerceRoute.Search },
                        onBag = { route = CommerceRoute.Bag },
                        onOpenProduct = ::openProduct,
                        onToggleSaved = ::toggleSaved,
                        onOpenShop = { collection ->
                            shopCollection = collection
                            openTab(CommerceTab.SHOP)
                        },
                        onTv = { openTab(CommerceTab.TV) },
                    )
                    CommerceTab.SHOP -> CommerceShopScreen(
                        products = products,
                        saved = saved,
                        cartCount = cartCount,
                        collection = shopCollection,
                        sort = shopSort,
                        selectedSizes = shopSizes,
                        priceMax = shopPriceMax,
                        gridState = shopGridState,
                        onCollection = { shopCollection = it },
                        onSort = { shopSort = it },
                        onSizes = { shopSizes = it },
                        onPriceMax = { shopPriceMax = it },
                        onSearch = { route = CommerceRoute.Search },
                        onBag = { route = CommerceRoute.Bag },
                        onProduct = ::openProduct,
                        onSaved = ::toggleSaved,
                    )
                    CommerceTab.TV -> HidiTvScreen(
                        products = featured.ifEmpty { products.take(6) },
                        cartCount = cartCount,
                        onSearch = { route = CommerceRoute.Search },
                        onBag = { route = CommerceRoute.Bag },
                        onProduct = ::openProduct,
                    )
                    CommerceTab.WISHLIST -> CommerceWishlistScreen(
                        products = products.filter { it.slug in saved },
                        saved = saved,
                        cartCount = cartCount,
                        onSearch = { route = CommerceRoute.Search },
                        onBag = { route = CommerceRoute.Bag },
                        onShop = { openTab(CommerceTab.SHOP) },
                        onProduct = ::openProduct,
                        onSaved = ::toggleSaved,
                    )
                    CommerceTab.ACCOUNT -> CommerceAccountScreen(
                        cartCount = cartCount,
                        onSearch = { route = CommerceRoute.Search },
                        onBag = { route = CommerceRoute.Bag },
                        onBridge = { route = CommerceRoute.Bridge(it) },
                    )
                }
                CommerceRoute.Search -> CommerceSearchScreen(
                    allProducts = products,
                    saved = saved,
                    recent = store.recentSearches(),
                    onBack = { route = CommerceRoute.Tab(previousTab) },
                    onProduct = ::openProduct,
                    onSaved = ::toggleSaved,
                    onSearchSubmitted = { store.saveSearch(it) },
                    onOpenShop = { label ->
                        shopCollection = label
                        openTab(CommerceTab.SHOP)
                    },
                )
                CommerceRoute.Bag -> HidiCommerceBagScreen(
                    repository = repo,
                    onBack = { route = CommerceRoute.Tab(previousTab) },
                    onShop = { openTab(CommerceTab.SHOP) },
                    onCheckout = { route = CommerceRoute.Bridge("/checkout") },
                    onCartChanged = { cartCount = it },
                )
                is CommerceRoute.Product -> HidiCommerceProductScreen(
                    product = target.product,
                    allProducts = products,
                    saved = target.product.slug in saved,
                    repository = repo,
                    onBack = { route = CommerceRoute.Tab(previousTab) },
                    onBag = { route = CommerceRoute.Bag },
                    onSaved = { toggleSaved(target.product.slug) },
                    onProduct = ::openProduct,
                    onCartChanged = { cartCount = it },
                )
                is CommerceRoute.Bridge -> HidiCommerceBridge(
                    path = target.path,
                    cartSession = store.cartSession(),
                    onClose = { route = CommerceRoute.Tab(previousTab) },
                )
            }
        }

        val tab = (route as? CommerceRoute.Tab)?.tab
        if (tab != null) {
            CommerceBottomNav(
                current = tab,
                modifier = Modifier.align(Alignment.BottomCenter),
                wishlistCount = saved.size,
                onSelect = ::openTab,
            )
        }
    }
}

@Composable
private fun CommerceHomeScreen(
    featured: List<HidiProduct>,
    bestSellers: List<HidiProduct>,
    loading: Boolean,
    saved: Set<String>,
    cartCount: Int,
    onSearch: () -> Unit,
    onBag: () -> Unit,
    onOpenProduct: (HidiProduct) -> Unit,
    onToggleSaved: (String) -> Unit,
    onOpenShop: (String) -> Unit,
    onTv: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 96.dp + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()),
    ) {
        item { CommerceAppBar(title = "Indian wear, reimagined", cartCount = cartCount, onSearch = onSearch, onBag = onBag) }
        item { SearchEntry(onSearch) }

        item {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                val cats = listOf(
                    Triple("New In", featured.getOrNull(0)?.primaryImage.orEmpty(), "NEW"),
                    Triple("Work", featured.getOrNull(1)?.primaryImage.orEmpty(), "WORK"),
                    Triple("Everyday", featured.getOrNull(2)?.primaryImage.orEmpty(), "EVERYDAY"),
                    Triple("Occasion", featured.getOrNull(3)?.primaryImage.orEmpty(), "OCCASION"),
                    Triple("Under ₹1999", featured.getOrNull(4)?.primaryImage.orEmpty(), "UNDER1999"),
                    Triple("Ananya", ANANYA, "ANANYA"),
                )
                items(cats) { (title, image, key) ->
                    CategoryCircle(title, image) { onOpenShop(key) }
                }
            }
        }

        item {
            HomeHeroPager(
                featured = featured,
                onShop = onOpenShop,
            )
        }

        item { RewardsStrip(onClick = null) }

        item {
            CommerceSectionHeader(
                title = "Trending now",
                subtitle = "Styles HIDI customers are discovering",
                action = "View all",
                onAction = { onOpenShop("ALL") },
            )
        }
        item {
            ProductRail(
                products = bestSellers.ifEmpty { featured },
                saved = saved,
                onOpen = onOpenProduct,
                onSaved = onToggleSaved,
            )
        }

        item {
            CommerceSectionHeader(
                title = "Shop by occasion",
                subtitle = "Workdays, easy days and celebrations",
            )
        }
        item {
            OccasionRow(
                products = featured,
                onWork = { onOpenShop("WORK") },
                onEveryday = { onOpenShop("EVERYDAY") },
                onOccasion = { onOpenShop("OCCASION") },
            )
        }

        item {
            CommerceSectionHeader(
                title = "HIDI TV",
                subtitle = "Watch the look. Shop it instantly.",
                action = "Watch all",
                onAction = onTv,
            )
        }
        item {
            HidiTvPreview(
                products = featured.take(4),
                onOpen = onOpenProduct,
                onAll = onTv,
            )
        }

        item {
            Box(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 28.dp)
                    .height(380.dp)
                    .clickable { onOpenShop("ANANYA") }
            ) {
                CommerceImage(ANANYA, Modifier.fillMaxSize())
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Transparent, Color(0xC2181012))))
                )
                Column(
                    Modifier
                        .align(Alignment.BottomStart)
                        .padding(18.dp, 22.dp)
                ) {
                    Text("ANANYA'S PICKS", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp)
                    Text(
                        "The edit she would\nwear herself.",
                        color = Color.White,
                        fontFamily = FontFamily.Serif,
                        fontSize = 28.sp,
                        lineHeight = 31.sp,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                    Text("SHOP THE EDIT  →", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 14.dp))
                }
            }
        }

        item {
            CommerceSectionHeader(
                title = "Under ₹1,999",
                subtitle = "Easy HIDI favourites",
                action = "Shop",
                onAction = { onOpenShop("UNDER1999") },
            )
        }
        item {
            ProductRail(
                products = (featured + bestSellers).distinctBy { it.slug }.filter { it.minPricePaise <= 199900 }.take(8),
                saved = saved,
                onOpen = onOpenProduct,
                onSaved = onToggleSaved,
            )
        }

        if (loading) {
            item {
                Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = CommerceColors.Wine, strokeWidth = 2.dp)
                }
            }
        }
    }
}

@Composable
private fun HomeHeroPager(featured: List<HidiProduct>, onShop: (String) -> Unit) {
    val pages = listOf(
        Triple(HERO, "NEW SEASON", "Everyday Indian wear,\nmade less ordinary."),
        Triple(featured.getOrNull(0)?.primaryImage.orEmpty(), "THE WORK EDIT", "Quiet confidence\nfor 9 to 9."),
        Triple(ANANYA, "ANANYA'S EDIT", "Selected by the\nface of HIDI."),
    )
    val pager = rememberPagerState(pageCount = { pages.size })
    Column(Modifier.padding(top = 4.dp)) {
        HorizontalPager(state = pager, contentPadding = PaddingValues(horizontal = 14.dp), pageSpacing = 10.dp) { page ->
            val item = pages[page]
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(350.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .clickable {
                        onShop(if (page == 1) "WORK" else if (page == 2) "ANANYA" else "NEW")
                    }
            ) {
                CommerceImage(item.first, Modifier.fillMaxSize())
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Transparent, Color(0xB9171011)))))
                Column(Modifier.align(Alignment.BottomStart).padding(18.dp)) {
                    Text(item.second, color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp)
                    Text(item.third, color = Color.White, fontFamily = FontFamily.Serif, fontSize = 28.sp, lineHeight = 30.sp, modifier = Modifier.padding(top = 5.dp))
                    Text("SHOP NOW  →", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 12.dp))
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.Center) {
            repeat(pages.size) { i ->
                Box(
                    Modifier
                        .padding(horizontal = 3.dp)
                        .width(if (pager.currentPage == i) 18.dp else 5.dp)
                        .height(4.dp)
                        .background(if (pager.currentPage == i) CommerceColors.Wine else CommerceColors.Line, CircleShape)
                )
            }
        }
    }
}

@Composable
private fun ProductRail(
    products: List<HidiProduct>,
    saved: Set<String>,
    onOpen: (HidiProduct) -> Unit,
    onSaved: (String) -> Unit,
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(products, key = { it.slug }) { product ->
            CommerceProductCard(
                product = product,
                saved = product.slug in saved,
                width = 178.dp,
                onOpen = { onOpen(product) },
                onToggleSaved = { onSaved(product.slug) },
            )
        }
    }
}

@Composable
private fun OccasionRow(
    products: List<HidiProduct>,
    onWork: () -> Unit,
    onEveryday: () -> Unit,
    onOccasion: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OccasionTile("WORK", products.getOrNull(0)?.primaryImage.orEmpty(), Modifier.weight(1f), onWork)
        OccasionTile("EVERYDAY", products.getOrNull(1)?.primaryImage.orEmpty(), Modifier.weight(1f), onEveryday)
        OccasionTile("OCCASION", products.getOrNull(2)?.primaryImage.orEmpty(), Modifier.weight(1f), onOccasion)
    }
}

@Composable
private fun OccasionTile(title: String, image: String, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .height(180.dp)
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
    ) {
        CommerceImage(image, Modifier.fillMaxSize())
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color(0x80000000)))))
        Text(
            title,
            color = Color.White,
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.sp,
            modifier = Modifier.align(Alignment.BottomStart).padding(10.dp),
        )
    }
}

@Composable
private fun HidiTvPreview(products: List<HidiProduct>, onOpen: (HidiProduct) -> Unit, onAll: () -> Unit) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(products) { product ->
            Box(
                Modifier
                    .width(150.dp)
                    .height(245.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .clickable { onOpen(product) }
            ) {
                CommerceImage(product.primaryImage, Modifier.fillMaxSize())
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Transparent, Color(0xA0000000)))))
                Box(Modifier.align(Alignment.Center).size(42.dp).background(Color.White.copy(.88f), CircleShape), contentAlignment = Alignment.Center) {
                    Icon(Icons.Outlined.PlayArrow, null, tint = CommerceColors.Wine)
                }
                Text(product.name, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, modifier = Modifier.align(Alignment.BottomStart).padding(10.dp))
            }
        }
    }
}

@Composable
private fun CommerceShopScreen(
    products: List<HidiProduct>,
    saved: Set<String>,
    cartCount: Int,
    collection: String,
    sort: ProductSort,
    selectedSizes: Set<String>,
    priceMax: Int?,
    gridState: androidx.compose.foundation.lazy.grid.LazyGridState,
    onCollection: (String) -> Unit,
    onSort: (ProductSort) -> Unit,
    onSizes: (Set<String>) -> Unit,
    onPriceMax: (Int?) -> Unit,
    onSearch: () -> Unit,
    onBag: () -> Unit,
    onProduct: (HidiProduct) -> Unit,
    onSaved: (String) -> Unit,
) {
    var showFilters by remember { mutableStateOf(false) }
    var showSort by remember { mutableStateOf(false) }

    val filtered = remember(products, collection, selectedSizes, priceMax, sort) {
        val base = products.filter { p ->
            val collectionMatch = when (collection) {
                "ALL" -> true
                "NEW" -> p.inStock
                "WORK" -> "work-edit" in p.collections
                "EVERYDAY" -> "everyday" in p.collections
                "OCCASION" -> "occasion" in p.collections
                "ANANYA" -> true
                "UNDER1999" -> p.minPricePaise <= 199900
                else -> true
            }
            val sizeMatch = selectedSizes.isEmpty() || p.variants.any { it.available > 0 && it.size in selectedSizes }
            val priceMatch = priceMax == null || p.minPricePaise <= priceMax
            collectionMatch && sizeMatch && priceMatch
        }
        when (sort) {
            ProductSort.RECOMMENDED -> base.sortedByDescending { it.soldQuantity + it.reviewCount }
            ProductSort.NEWEST -> base
            ProductSort.PRICE_LOW -> base.sortedBy { it.minPricePaise }
            ProductSort.PRICE_HIGH -> base.sortedByDescending { it.minPricePaise }
        }
    }

    Column(Modifier.fillMaxSize().padding(bottom = 66.dp + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding())) {
        CommerceAppBar(title = "Shop", cartCount = cartCount, onSearch = onSearch, onBag = onBag)
        SearchEntry(onSearch)
        LazyRow(
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 7.dp),
            horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            items(listOf("ALL", "NEW", "WORK", "EVERYDAY", "OCCASION", "UNDER1999")) { value ->
                Pill(
                    text = if (value == "UNDER1999") "Under ₹1,999" else value.lowercase().replaceFirstChar { it.titlecase() },
                    selected = collection == value,
                ) { onCollection(value) }
            }
        }

        Row(
            Modifier.fillMaxWidth().background(CommerceColors.Surface).padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("${filtered.size} styles", color = CommerceColors.Muted, fontSize = 10.sp, modifier = Modifier.weight(1f))
            Row(Modifier.clickable { showSort = true }.padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Sort, null, tint = CommerceColors.Ink, modifier = Modifier.size(17.dp))
                Text("Sort", color = CommerceColors.Ink, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 5.dp))
            }
            Row(Modifier.clickable { showFilters = true }.padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.FilterList, null, tint = CommerceColors.Ink, modifier = Modifier.size(17.dp))
                Text(
                    if (selectedSizes.isNotEmpty() || priceMax != null) "Filter •" else "Filter",
                    color = CommerceColors.Ink,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = 5.dp),
                )
            }
        }

        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            state = gridState,
            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(9.dp),
            verticalArrangement = Arrangement.spacedBy(22.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            items(filtered, key = { it.slug }) { product ->
                CommerceProductCard(
                    product = product,
                    saved = product.slug in saved,
                    width = 186.dp,
                    onOpen = { onProduct(product) },
                    onToggleSaved = { onSaved(product.slug) },
                    showBadge = false,
                )
            }
            if (filtered.isEmpty()) {
                item(span = { GridItemSpan(2) }) {
                    Column(
                        Modifier.fillMaxWidth().padding(50.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text("No styles match these filters.", color = CommerceColors.Ink, fontFamily = FontFamily.Serif, fontSize = 22.sp, textAlign = TextAlign.Center)
                        Text("RESET FILTERS", color = CommerceColors.Wine, fontSize = 9.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clickable {
                            onSizes(emptySet()); onPriceMax(null)
                        }.padding(18.dp))
                    }
                }
            }
        }
    }

    if (showSort) {
        SortSheet(sort = sort, onDismiss = { showSort = false }) {
            onSort(it); showSort = false
        }
    }
    if (showFilters) {
        FilterSheet(
            sizes = products.flatMap { it.sizes }.distinct(),
            selectedSizes = selectedSizes,
            priceMax = priceMax,
            onDismiss = { showFilters = false },
            onApply = { sizes, price ->
                onSizes(sizes); onPriceMax(price); showFilters = false
            },
        )
    }
}

@Composable
private fun SortSheet(sort: ProductSort, onDismiss: () -> Unit, onSelected: (ProductSort) -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = CommerceColors.Surface,
    ) {
        Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
            Text("Sort by", color = CommerceColors.Ink, fontFamily = FontFamily.Serif, fontSize = 24.sp, modifier = Modifier.padding(bottom = 12.dp))
            listOf(
                ProductSort.RECOMMENDED to "Recommended",
                ProductSort.NEWEST to "Newest",
                ProductSort.PRICE_LOW to "Price: Low to High",
                ProductSort.PRICE_HIGH to "Price: High to Low",
            ).forEach { (key, label) ->
                Text(
                    label,
                    color = if (sort == key) CommerceColors.Wine else CommerceColors.Ink,
                    fontSize = 14.sp,
                    fontWeight = if (sort == key) FontWeight.Bold else FontWeight.Normal,
                    modifier = Modifier.fillMaxWidth().clickable { onSelected(key) }.padding(vertical = 15.dp),
                )
                HorizontalDivider(color = CommerceColors.Line, thickness = .6.dp)
            }
            Spacer(Modifier.height(28.dp))
        }
    }
}

@Composable
private fun FilterSheet(
    sizes: List<String>,
    selectedSizes: Set<String>,
    priceMax: Int?,
    onDismiss: () -> Unit,
    onApply: (Set<String>, Int?) -> Unit,
) {
    var tempSizes by remember(selectedSizes) { mutableStateOf(selectedSizes) }
    var tempPrice by remember(priceMax) { mutableStateOf(priceMax) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = CommerceColors.Surface,
    ) {
        Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Filters", color = CommerceColors.Ink, fontFamily = FontFamily.Serif, fontSize = 24.sp, modifier = Modifier.weight(1f))
                Text("CLEAR", color = CommerceColors.Wine, fontSize = 9.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clickable {
                    tempSizes = emptySet(); tempPrice = null
                }.padding(10.dp))
            }
            Text("SIZE", color = CommerceColors.Muted, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(top = 22.dp, bottom = 10.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                items(sizes) { size ->
                    Pill(size, selected = size in tempSizes) {
                        tempSizes = if (size in tempSizes) tempSizes - size else tempSizes + size
                    }
                }
            }
            Text("PRICE", color = CommerceColors.Muted, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(top = 24.dp, bottom = 10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                listOf(null to "Any", 149900 to "≤ ₹1,499", 199900 to "≤ ₹1,999", 249900 to "≤ ₹2,499").forEach { (value, label) ->
                    Pill(label, selected = tempPrice == value) { tempPrice = value }
                }
            }
            Text(
                "APPLY FILTERS",
                color = Color.White,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 30.dp, bottom = 26.dp)
                    .background(CommerceColors.Ink, RoundedCornerShape(12.dp))
                    .clickable { onApply(tempSizes, tempPrice) }
                    .padding(vertical = 17.dp),
            )
        }
    }
}

@Composable
private fun CommerceSearchScreen(
    allProducts: List<HidiProduct>,
    saved: Set<String>,
    recent: List<String>,
    onBack: () -> Unit,
    onProduct: (HidiProduct) -> Unit,
    onSaved: (String) -> Unit,
    onSearchSubmitted: (String) -> Unit,
    onOpenShop: (String) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    val results = remember(query, allProducts) {
        val q = query.trim().lowercase()
        if (q.length < 2) emptyList() else allProducts.filter { p ->
            buildString {
                append(p.name); append(' '); append(p.description); append(' ')
                append(p.fabric); append(' '); append(p.collections.joinToString(" ")); append(' ')
                append(p.colours.joinToString(" "))
            }.lowercase().contains(q)
        }
    }

    Column(
        Modifier.fillMaxSize().background(CommerceColors.Canvas).padding(top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding())
    ) {
        Row(Modifier.fillMaxWidth().background(CommerceColors.Surface).padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Outlined.ArrowBack, "Back", tint = CommerceColors.Ink) }
            Row(
                Modifier.weight(1f).background(CommerceColors.Canvas, RoundedCornerShape(15.dp)).padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Outlined.Search, null, tint = CommerceColors.Muted, modifier = Modifier.size(19.dp))
                BasicTextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    cursorBrush = SolidColor(CommerceColors.Wine),
                    textStyle = TextStyle(color = CommerceColors.Ink, fontSize = 14.sp),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { onSearchSubmitted(query) }),
                    decorationBox = { inner ->
                        Box(Modifier.padding(horizontal = 9.dp, vertical = 13.dp)) {
                            if (query.isBlank()) Text("Search HIDI", color = CommerceColors.Muted, fontSize = 14.sp)
                            inner()
                        }
                    },
                    modifier = Modifier.weight(1f),
                )
            }
        }

        if (query.length < 2) {
            LazyColumn(contentPadding = PaddingValues(bottom = 30.dp)) {
                if (recent.isNotEmpty()) {
                    item { CommerceSectionHeader(title = "Recent searches") }
                    item {
                        LazyRow(contentPadding = PaddingValues(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            items(recent) { text -> Pill(text) { query = text } }
                        }
                    }
                }
                item { CommerceSectionHeader(title = "Popular right now", subtitle = "Start with an edit") }
                item {
                    LazyRow(contentPadding = PaddingValues(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        items(listOf("WORK", "EVERYDAY", "OCCASION", "UNDER1999")) { value ->
                            Pill(if (value == "UNDER1999") "Under ₹1,999" else value.lowercase().replaceFirstChar { it.titlecase() }) { onOpenShop(value) }
                        }
                    }
                }
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                contentPadding = PaddingValues(10.dp),
                horizontalArrangement = Arrangement.spacedBy(9.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                item(span = { GridItemSpan(2) }) {
                    Text("${results.size} results for “$query”", color = CommerceColors.Muted, fontSize = 10.sp, modifier = Modifier.padding(8.dp))
                }
                items(results, key = { it.slug }) { product ->
                    CommerceProductCard(product, product.slug in saved, 186.dp, { onProduct(product) }, { onSaved(product.slug) }, showBadge = false)
                }
            }
        }
    }
}

@Composable
private fun HidiTvScreen(
    products: List<HidiProduct>,
    cartCount: Int,
    onSearch: () -> Unit,
    onBag: () -> Unit,
    onProduct: (HidiProduct) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 96.dp + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { CommerceAppBar(title = "HIDI TV", cartCount = cartCount, onSearch = onSearch, onBag = onBag) }
        item {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
                Text("Watch. Tap. Wear.", color = CommerceColors.Ink, fontFamily = FontFamily.Serif, fontSize = 28.sp)
                Text("Shoppable styling stories from HIDI.", color = CommerceColors.Muted, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp))
            }
        }
        if (products.isNotEmpty()) {
            item {
                val product = products.first()
                Box(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp)
                        .height(560.dp)
                        .clip(RoundedCornerShape(15.dp))
                ) {
                    AndroidView(
                        factory = { context ->
                            VideoView(context).apply {
                                setVideoURI(Uri.parse("https://thidigk.thehidi.com/video/discover-hidi.mp4"))
                                setOnPreparedListener { player ->
                                    player.isLooping = true
                                    player.setVolume(0f, 0f)
                                    start()
                                }
                            }
                        },
                        modifier = Modifier.fillMaxSize(),
                    )
                    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Transparent, Color(0xA0000000)))))
                    Row(
                        Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            .padding(14.dp)
                            .background(Color.White.copy(.95f), RoundedCornerShape(12.dp))
                            .clickable { onProduct(product) }
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("DISCOVER HIDI", color = CommerceColors.Muted, fontSize = 8.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                            Text(product.name, color = CommerceColors.Ink, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.padding(top = 3.dp))
                            Text(money(product.minPricePaise), color = CommerceColors.Muted, fontSize = 10.sp, modifier = Modifier.padding(top = 2.dp))
                        }
                        Text("SHOP LOOK", color = CommerceColors.Wine, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        items(products.drop(1), key = { it.slug }) { product ->
            Box(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp)
                    .height(520.dp)
                    .clip(RoundedCornerShape(15.dp))
                    .clickable { onProduct(product) }
            ) {
                CommerceImage(product.primaryImage, Modifier.fillMaxSize())
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Transparent, Color(0xA0000000)))))
                Box(Modifier.align(Alignment.Center).size(52.dp).background(Color.White.copy(.88f), CircleShape), contentAlignment = Alignment.Center) {
                    Icon(Icons.Outlined.PlayArrow, null, tint = CommerceColors.Wine, modifier = Modifier.size(28.dp))
                }
                Text(
                    "STYLE STORY  ·  ${product.name}",
                    color = Color.White,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    modifier = Modifier.align(Alignment.BottomStart).padding(16.dp),
                )
            }
        }
    }
}

@Composable
private fun CommerceWishlistScreen(
    products: List<HidiProduct>,
    saved: Set<String>,
    cartCount: Int,
    onSearch: () -> Unit,
    onBag: () -> Unit,
    onShop: () -> Unit,
    onProduct: (HidiProduct) -> Unit,
    onSaved: (String) -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(bottom = 66.dp + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding())) {
        CommerceAppBar(title = "Wishlist", cartCount = cartCount, onSearch = onSearch, onBag = onBag)
        if (products.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(40.dp)) {
                    Text("Your wishlist is waiting.", color = CommerceColors.Ink, fontFamily = FontFamily.Serif, fontSize = 27.sp, textAlign = TextAlign.Center)
                    Text("Tap the heart on any style and it stays here.", color = CommerceColors.Muted, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 8.dp, bottom = 18.dp))
                    Text("START SHOPPING", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.background(CommerceColors.Ink, RoundedCornerShape(12.dp)).clickable(onClick = onShop).padding(horizontal = 22.dp, vertical = 14.dp))
                }
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                contentPadding = PaddingValues(10.dp, 18.dp),
                horizontalArrangement = Arrangement.spacedBy(9.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                items(products, key = { it.slug }) { product ->
                    CommerceProductCard(product, product.slug in saved, 186.dp, { onProduct(product) }, { onSaved(product.slug) }, showBadge = false)
                }
            }
        }
    }
}

@Composable
private fun CommerceAccountScreen(
    cartCount: Int,
    onSearch: () -> Unit,
    onBag: () -> Unit,
    onBridge: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 96.dp + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()),
    ) {
        item { CommerceAppBar(title = "Account", cartCount = cartCount, onSearch = onSearch, onBag = onBag) }
        item {
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(CommerceColors.Wine)
                    .padding(horizontal = 18.dp, vertical = 22.dp)
            ) {
                Text("WELCOME TO HIDI", color = CommerceColors.Gold, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.4.sp)
                Text("Sign in to unlock your\ncomplete HIDI account.", color = Color.White, fontFamily = FontFamily.Serif, fontSize = 27.sp, lineHeight = 30.sp, modifier = Modifier.padding(top = 7.dp))
                Text("SIGN IN / CONTINUE  →", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clickable { onBridge("/account") }.padding(top = 16.dp, bottom = 4.dp))
            }
        }
        item { RewardsStrip(title = "HIDI Rewards", copy = "Wallet, rewards and refunds in one place") { onBridge("/account") } }
        item {
            AccountGroup(
                title = "Shopping",
                rows = listOf(
                    "Orders & tracking" to "/account",
                    "Returns & exchanges" to "/account",
                    "Refund status" to "/account",
                    "Saved addresses" to "/account",
                ),
                onBridge = onBridge,
            )
        }
        item {
            AccountGroup(
                title = "Your HIDI",
                rows = listOf(
                    "Wallet & rewards" to "/account",
                    "App inbox" to "/account",
                    "Notifications & preferences" to "/account",
                ),
                onBridge = onBridge,
            )
        }
        item {
            AccountGroup(
                title = "Help",
                rows = listOf(
                    "Customer support" to "/account",
                    "Shipping & delivery" to "/shipping",
                    "About HIDI" to "/about",
                ),
                onBridge = onBridge,
            )
        }
    }
}

@Composable
private fun AccountGroup(title: String, rows: List<Pair<String, String>>, onBridge: (String) -> Unit) {
    Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
        Text(title.uppercase(), color = CommerceColors.Muted, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp, modifier = Modifier.padding(bottom = 6.dp))
        Column(Modifier.background(CommerceColors.Surface, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp)) {
            rows.forEachIndexed { index, (label, path) ->
                Row(
                    Modifier.fillMaxWidth().clickable { onBridge(path) }.padding(vertical = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(label, color = CommerceColors.Ink, fontSize = 13.sp, modifier = Modifier.weight(1f))
                    Icon(Icons.Outlined.ArrowForward, null, tint = CommerceColors.Muted, modifier = Modifier.size(16.dp))
                }
                if (index < rows.lastIndex) HorizontalDivider(color = CommerceColors.Line, thickness = .6.dp)
            }
        }
    }
}
