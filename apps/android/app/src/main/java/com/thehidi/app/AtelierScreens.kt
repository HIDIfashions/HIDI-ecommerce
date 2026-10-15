@file:OptIn(
    androidx.compose.material3.ExperimentalMaterial3Api::class,
    androidx.compose.foundation.ExperimentalFoundationApi::class,
)

package com.thehidi.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ArrowForward
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import kotlinx.coroutines.launch

private data class AtelierStory(
    val label: String,
    val image: String,
    val filter: String,
)

private val atelierStories = listOf(
    AtelierStory("New", "/products/aara-sage-work-kurta/01-main.png", "new-arrivals"),
    AtelierStory("Work", "/products/ira-beige-office-kurta-set/01-main.png", "work-edit"),
    AtelierStory("Everyday", "/products/myra-peach-comfort-kurta-set/01-main.png", "everyday"),
    AtelierStory("Occasion", "/products/kiara-wine-festive-kurta-set/01-main.png", "occasion"),
    AtelierStory("Ananya", "/brand/hidi-manifesto-ananya.webp", "occasion"),
)

@Composable
fun AtelierHomeScreen(
    featured: List<AtelierProduct>,
    savedSlugs: Set<String>,
    cartCount: Int,
    onSearch: () -> Unit,
    onBag: () -> Unit,
    onDiscover: (String) -> Unit,
    onSaved: () -> Unit,
    onProduct: (AtelierProduct) -> Unit,
    onToggleSaved: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(AtelierCanvas),
    ) {
        item {
            AtelierHomeHero(
                cartCount = cartCount,
                onSearch = onSearch,
                onBag = onBag,
                onDiscover = { onDiscover("new-arrivals") },
            )
        }

        item {
            Text(
                text = "SHOP THE MOOD",
                style = MaterialTheme.typography.labelSmall,
                color = AtelierGold,
                modifier = Modifier.padding(start = 22.dp, top = 28.dp, bottom = 14.dp),
            )
        }

        item {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.fillMaxWidth(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp),
            ) {
                items(atelierStories) { story ->
                    AtelierStoryBubble(
                        story = story,
                        onClick = { onDiscover(story.filter) },
                    )
                }
            }
        }

        item {
            AtelierSectionHeader(
                eyebrow = "JUST IN",
                title = "New now",
                action = "See all",
                onAction = { onDiscover("new-arrivals") },
                modifier = Modifier.padding(top = 34.dp),
            )
        }

        item {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 18.dp),
            ) {
                items(featured.take(6)) { product ->
                    AtelierEditorialProduct(
                        product = product,
                        saved = savedSlugs.contains(product.slug),
                        onOpen = { onProduct(product) },
                        onToggleSaved = { onToggleSaved(product.slug) },
                    )
                }
            }
        }

        item {
            AtelierAnanyaEditorial(
                onClick = { onDiscover("occasion") },
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 38.dp),
            )
        }

        item {
            AtelierPriveBlock(
                onSaved = onSaved,
                modifier = Modifier.padding(horizontal = 18.dp),
            )
        }

        item { Spacer(Modifier.height(120.dp)) }
    }
}

@Composable
private fun AtelierHomeHero(
    cartCount: Int,
    onSearch: () -> Unit,
    onBag: () -> Unit,
    onDiscover: () -> Unit,
) {
    val height = (LocalConfiguration.current.screenHeightDp * 0.74f).dp
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(height.coerceAtLeast(590.dp))
            .background(AtelierMoss),
    ) {
        AsyncImage(
            model = AtelierRepository.resolveImage("/brand/hidi-hero-green-garden-fullbody.webp"),
            contentDescription = "HIDI new season editorial",
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0f to Color.Black.copy(alpha = 0.20f),
                        0.46f to Color.Transparent,
                        1f to Color.Black.copy(alpha = 0.74f),
                    ),
                ),
        )

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .statusBarsPadding()
                .fillMaxWidth()
                .padding(horizontal = 18.dp, vertical = 12.dp),
        ) {
            AtelierGlassIcon(Icons.Outlined.Search, "Search", onSearch)
            Text(
                text = "HIDI",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 20.sp,
                letterSpacing = 5.sp,
                modifier = Modifier.weight(1f),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            AtelierBagIcon(cartCount = cartCount, dark = true, onClick = onBag)
        }

        Column(
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(horizontal = 22.dp, vertical = 28.dp),
        ) {
            Text(
                text = "ATELIER / 01",
                style = MaterialTheme.typography.labelSmall,
                color = Color.White.copy(alpha = 0.78f),
            )
            Text(
                text = "Made for\nyour kind of day.",
                style = MaterialTheme.typography.displayLarge,
                color = Color.White,
            )
            Text(
                text = "Indian wear with a quieter confidence.",
                style = MaterialTheme.typography.bodyLarge,
                color = Color.White.copy(alpha = 0.84f),
            )
            Surface(
                onClick = onDiscover,
                shape = RoundedCornerShape(100.dp),
                color = Color.White,
                modifier = Modifier.padding(top = 5.dp),
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 13.dp),
                ) {
                    Text(
                        text = "Discover the new edit",
                        style = MaterialTheme.typography.labelLarge,
                        color = AtelierInk,
                    )
                    Icon(
                        imageVector = Icons.Outlined.ArrowForward,
                        contentDescription = null,
                        tint = AtelierInk,
                        modifier = Modifier.size(17.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun AtelierStoryBubble(
    story: AtelierStory,
    onClick: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .width(82.dp)
            .clickable(onClick = onClick),
    ) {
        Box(
            modifier = Modifier
                .size(78.dp)
                .border(1.dp, AtelierGold.copy(alpha = 0.65f), CircleShape)
                .padding(3.dp)
                .clip(CircleShape)
                .background(AtelierStone),
        ) {
            AsyncImage(
                model = AtelierRepository.resolveImage(story.image),
                contentDescription = story.label,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
        Text(
            text = story.label,
            style = MaterialTheme.typography.labelLarge,
            color = AtelierInk,
        )
    }
}

@Composable
private fun AtelierSectionHeader(
    eyebrow: String,
    title: String,
    action: String? = null,
    onAction: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    Row(
        verticalAlignment = Alignment.Bottom,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 22.dp, vertical = 16.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(eyebrow, style = MaterialTheme.typography.labelSmall, color = AtelierGold)
            Text(
                title,
                style = MaterialTheme.typography.headlineLarge,
                color = AtelierInk,
                modifier = Modifier.padding(top = 3.dp),
            )
        }
        if (action != null && onAction != null) {
            Text(
                text = action,
                style = MaterialTheme.typography.labelLarge,
                color = AtelierWine,
                modifier = Modifier
                    .clip(RoundedCornerShape(40.dp))
                    .clickable(onClick = onAction)
                    .padding(horizontal = 10.dp, vertical = 8.dp),
            )
        }
    }
}

@Composable
private fun AtelierEditorialProduct(
    product: AtelierProduct,
    saved: Boolean,
    onOpen: () -> Unit,
    onToggleSaved: () -> Unit,
) {
    Column(
        modifier = Modifier
            .width(270.dp)
            .clickable(onClick = onOpen),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(390.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(AtelierStone),
        ) {
            AsyncImage(
                model = product.primaryImage,
                contentDescription = product.name,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            AtelierHeart(
                saved = saved,
                onClick = onToggleSaved,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(10.dp),
            )
        }
        Text(
            text = product.name,
            style = MaterialTheme.typography.titleMedium,
            color = AtelierInk,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 12.dp),
        )
        Text(
            text = formatAtelierPrice(product.minPricePaise),
            style = MaterialTheme.typography.bodyMedium,
            color = AtelierWine,
            modifier = Modifier.padding(top = 3.dp),
        )
    }
}

@Composable
private fun AtelierAnanyaEditorial(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(500.dp)
            .clip(RoundedCornerShape(2.dp))
            .background(AtelierWine)
            .clickable(onClick = onClick),
    ) {
        AsyncImage(
            model = AtelierRepository.resolveImage("/brand/hidi-manifesto-ananya.webp"),
            contentDescription = "Ananya's HIDI edit",
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0.45f to Color.Transparent,
                        1f to Color.Black.copy(alpha = 0.66f),
                    ),
                ),
        )
        Column(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(22.dp),
        ) {
            Text(
                "ANANYA / 01",
                style = MaterialTheme.typography.labelSmall,
                color = Color.White.copy(alpha = 0.72f),
            )
            Text(
                "The pieces I\nwould actually wear.",
                style = MaterialTheme.typography.displayMedium,
                color = Color.White,
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    "See her edit",
                    style = MaterialTheme.typography.labelLarge,
                    color = Color.White,
                )
                Icon(
                    Icons.Outlined.ArrowForward,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
    }
}

@Composable
private fun AtelierPriveBlock(
    onSaved: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        onClick = onSaved,
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(3.dp),
        color = AtelierWine,
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(9.dp),
            modifier = Modifier.padding(horizontal = 22.dp, vertical = 25.dp),
        ) {
            Text("HIDI PRIVÉ", style = MaterialTheme.typography.labelSmall, color = AtelierGold)
            Text(
                "A more personal\nway to keep HIDI.",
                style = MaterialTheme.typography.headlineLarge,
                color = Color.White,
            )
            Text(
                "Saved pieces, rewards and your private edit.",
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.76f),
            )
        }
    }
}

@Composable
fun AtelierDiscoverScreen(
    products: List<AtelierProduct>,
    initialFilter: String,
    savedSlugs: Set<String>,
    cartCount: Int,
    onSearch: () -> Unit,
    onBag: () -> Unit,
    onProduct: (AtelierProduct) -> Unit,
    onToggleSaved: (String) -> Unit,
) {
    var filter by remember(initialFilter) { mutableStateOf(normalizeFilter(initialFilter)) }
    val filtered = remember(products, filter) {
        products.filter { product ->
            when (filter) {
                "all" -> true
                "new-arrivals" -> product.inStock
                else -> product.collectionSlugs.contains(filter) || product.category == filter
            }
        }
    }

    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            start = 18.dp,
            end = 18.dp,
            bottom = 120.dp,
        ),
        modifier = Modifier
            .fillMaxSize()
            .background(AtelierCanvas),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            AtelierPageChrome(
                title = "Discover",
                eyebrow = "HIDI ATELIER",
                cartCount = cartCount,
                onSearch = onSearch,
                onBag = onBag,
            )
        }

        item(span = { GridItemSpan(maxLineSpan) }) {
            Column(modifier = Modifier.padding(top = 8.dp, bottom = 18.dp)) {
                Text(
                    "Find the piece\nthat fits the day.",
                    style = MaterialTheme.typography.displayMedium,
                    color = AtelierInk,
                )
                Text(
                    "A focused edit, not an endless catalogue.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = AtelierMuted,
                    modifier = Modifier.padding(top = 9.dp),
                )
            }
        }

        item(span = { GridItemSpan(maxLineSpan) }) {
            AtelierFilterRow(filter = filter, onFilter = { filter = it })
        }

        item(span = { GridItemSpan(maxLineSpan) }) {
            Text(
                text = if (filtered.size == 1) "1 STYLE" else filtered.size.toString() + " STYLES",
                style = MaterialTheme.typography.labelSmall,
                color = AtelierMuted,
                modifier = Modifier.padding(top = 8.dp, bottom = 2.dp),
            )
        }

        itemsIndexed(filtered, key = { _, item -> item.slug }) { index, product ->
            AtelierGridProduct(
                product = product,
                index = index,
                saved = savedSlugs.contains(product.slug),
                onOpen = { onProduct(product) },
                onToggleSaved = { onToggleSaved(product.slug) },
            )
        }
    }
}

@Composable
private fun AtelierFilterRow(
    filter: String,
    onFilter: (String) -> Unit,
) {
    val values = listOf(
        "all" to "All",
        "new-arrivals" to "New",
        "work-edit" to "Work",
        "everyday" to "Everyday",
        "occasion" to "Occasion",
    )
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(values) { pair ->
            val selected = filter == pair.first
            Surface(
                onClick = { onFilter(pair.first) },
                shape = RoundedCornerShape(100.dp),
                color = if (selected) AtelierInk else Color.Transparent,
                border = if (selected) null else BorderStroke(1.dp, AtelierLine),
            ) {
                Text(
                    text = pair.second,
                    style = MaterialTheme.typography.labelLarge,
                    color = if (selected) Color.White else AtelierInk,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 11.dp),
                )
            }
        }
    }
}

@Composable
private fun AtelierGridProduct(
    product: AtelierProduct,
    index: Int,
    saved: Boolean,
    onOpen: () -> Unit,
    onToggleSaved: () -> Unit,
) {
    val height = if (index % 4 == 1 || index % 4 == 2) 330.dp else 280.dp
    Column(modifier = Modifier.clickable(onClick = onOpen)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(height)
                .background(AtelierStone),
        ) {
            AsyncImage(
                model = product.primaryImage,
                contentDescription = product.name,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            AtelierHeart(
                saved = saved,
                onClick = onToggleSaved,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(7.dp),
            )
        }
        Text(
            text = product.name,
            style = MaterialTheme.typography.titleMedium,
            color = AtelierInk,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 9.dp),
        )
        Text(
            text = formatAtelierPrice(product.minPricePaise),
            style = MaterialTheme.typography.bodyMedium,
            color = AtelierWine,
            modifier = Modifier.padding(top = 2.dp),
        )
    }
}

@Composable
fun AtelierSearchScreen(
    products: List<AtelierProduct>,
    savedSlugs: Set<String>,
    onBack: () -> Unit,
    onProduct: (AtelierProduct) -> Unit,
    onToggleSaved: (String) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val matches = remember(products, query) {
        val needle = query.trim().lowercase()
        if (needle.length < 2) emptyList()
        else products.filter { product ->
            val text = buildString {
                append(product.name)
                append(' ')
                append(product.description)
                append(' ')
                append(product.category)
                append(' ')
                append(product.collectionSlugs.joinToString(" "))
                append(' ')
                append(product.variants.joinToString(" ") { it.color })
            }.lowercase()
            text.contains(needle)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(AtelierCanvas)
            .statusBarsPadding()
            .imePadding(),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
        ) {
            AtelierIconButton(Icons.Outlined.ArrowBack, "Back", onBack)
            Text(
                "SEARCH",
                style = MaterialTheme.typography.labelSmall,
                color = AtelierGold,
                modifier = Modifier.padding(start = 8.dp),
            )
        }

        BasicTextField(
            value = query,
            onValueChange = { query = it },
            singleLine = true,
            textStyle = MaterialTheme.typography.headlineMedium.copy(color = AtelierInk),
            decorationBox = { field ->
                Column {
                    if (query.isEmpty()) {
                        Text(
                            "What are you looking for?",
                            style = MaterialTheme.typography.headlineMedium,
                            color = AtelierMuted.copy(alpha = 0.58f),
                        )
                    }
                    if (query.isNotEmpty()) field()
                    HorizontalDivider(
                        color = AtelierInk,
                        thickness = 1.dp,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 22.dp, vertical = 18.dp),
        )

        if (query.length < 2) {
            Text(
                "TRY",
                style = MaterialTheme.typography.labelSmall,
                color = AtelierGold,
                modifier = Modifier.padding(start = 22.dp, top = 18.dp),
            )
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(22.dp),
            ) {
                listOf("work", "green", "occasion", "cotton", "under ₹1999").forEach { word ->
                    Surface(
                        onClick = { query = word },
                        shape = RoundedCornerShape(100.dp),
                        color = AtelierPaper,
                        border = BorderStroke(1.dp, AtelierLine),
                    ) {
                        Text(
                            word,
                            style = MaterialTheme.typography.labelLarge,
                            color = AtelierInk,
                            modifier = Modifier.padding(horizontal = 15.dp, vertical = 10.dp),
                        )
                    }
                }
            }
        } else {
            Text(
                if (matches.size == 1) "1 RESULT" else matches.size.toString() + " RESULTS",
                style = MaterialTheme.typography.labelSmall,
                color = AtelierMuted,
                modifier = Modifier.padding(horizontal = 22.dp, vertical = 12.dp),
            )
            LazyColumn(
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    start = 18.dp,
                    end = 18.dp,
                    bottom = 30.dp,
                ),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(matches, key = { it.slug }) { product ->
                    AtelierSearchResult(
                        product = product,
                        saved = savedSlugs.contains(product.slug),
                        onOpen = { onProduct(product) },
                        onToggleSaved = { onToggleSaved(product.slug) },
                    )
                }
            }
        }
    }
}

@Composable
private fun AtelierSearchResult(
    product: AtelierProduct,
    saved: Boolean,
    onOpen: () -> Unit,
    onToggleSaved: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen)
            .padding(vertical = 4.dp),
    ) {
        AsyncImage(
            model = product.primaryImage,
            contentDescription = product.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(width = 92.dp, height = 118.dp)
                .background(AtelierStone),
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 14.dp),
        ) {
            Text(product.name, style = MaterialTheme.typography.titleMedium, color = AtelierInk)
            Text(
                formatAtelierPrice(product.minPricePaise),
                style = MaterialTheme.typography.bodyMedium,
                color = AtelierWine,
                modifier = Modifier.padding(top = 5.dp),
            )
        }
        AtelierHeart(saved = saved, onClick = onToggleSaved)
    }
}

@Composable
fun AtelierSavedScreen(
    products: List<AtelierProduct>,
    cartCount: Int,
    onBag: () -> Unit,
    onDiscover: () -> Unit,
    onProduct: (AtelierProduct) -> Unit,
    onToggleSaved: (String) -> Unit,
) {
    if (products.isEmpty()) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier
                .fillMaxSize()
                .background(AtelierCanvas)
                .padding(horizontal = 32.dp, vertical = 100.dp),
        ) {
            Text("YOUR EDIT", style = MaterialTheme.typography.labelSmall, color = AtelierGold)
            Text(
                "Keep only what\nyou really love.",
                style = MaterialTheme.typography.displayMedium,
                color = AtelierInk,
                modifier = Modifier.padding(top = 10.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            Text(
                "Tap the heart on any piece to build your private HIDI edit.",
                style = MaterialTheme.typography.bodyMedium,
                color = AtelierMuted,
                modifier = Modifier.padding(top = 14.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            Surface(
                onClick = onDiscover,
                shape = RoundedCornerShape(100.dp),
                color = AtelierInk,
                modifier = Modifier.padding(top = 24.dp),
            ) {
                Text(
                    "Browse HIDI",
                    style = MaterialTheme.typography.labelLarge,
                    color = Color.White,
                    modifier = Modifier.padding(horizontal = 22.dp, vertical = 14.dp),
                )
            }
        }
        return
    }

    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            start = 18.dp,
            end = 18.dp,
            bottom = 120.dp,
        ),
        modifier = Modifier
            .fillMaxSize()
            .background(AtelierCanvas),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            AtelierPageChrome(
                title = "Saved",
                eyebrow = "YOUR EDIT",
                cartCount = cartCount,
                onSearch = null,
                onBag = onBag,
            )
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            Text(
                "Your private shortlist.",
                style = MaterialTheme.typography.headlineLarge,
                color = AtelierInk,
                modifier = Modifier.padding(top = 10.dp, bottom = 20.dp),
            )
        }
        itemsIndexed(products, key = { _, product -> product.slug }) { index, product ->
            AtelierGridProduct(
                product = product,
                index = index,
                saved = true,
                onOpen = { onProduct(product) },
                onToggleSaved = { onToggleSaved(product.slug) },
            )
        }
    }
}

@Composable
fun AtelierYouScreen(
    onBag: () -> Unit,
    onBridge: (String, String) -> Unit,
) {
    LazyColumn(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 120.dp),
        modifier = Modifier
            .fillMaxSize()
            .background(AtelierCanvas),
    ) {
        item {
            AtelierPageChrome(
                title = "You",
                eyebrow = "YOUR HIDI",
                cartCount = 0,
                onSearch = null,
                onBag = onBag,
            )
        }
        item {
            Surface(
                onClick = { onBridge("/account", "Your account") },
                color = AtelierWine,
                shape = RoundedCornerShape(2.dp),
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 18.dp),
            ) {
                Column(modifier = Modifier.padding(22.dp)) {
                    Text("PRIVATE CLIENT", style = MaterialTheme.typography.labelSmall, color = AtelierGold)
                    Text(
                        "Your HIDI,\nin one quiet place.",
                        style = MaterialTheme.typography.headlineLarge,
                        color = Color.White,
                        modifier = Modifier.padding(top = 7.dp),
                    )
                    Text(
                        "Sign in for orders, wallet, rewards and returns.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.72f),
                        modifier = Modifier.padding(top = 10.dp),
                    )
                    Text(
                        "SIGN IN / CONTINUE  →",
                        style = MaterialTheme.typography.labelLarge,
                        color = Color.White,
                        modifier = Modifier.padding(top = 22.dp),
                    )
                }
            }
        }

        item { AtelierAccountGroupTitle("YOUR SHOPPING") }
        item {
            AtelierAccountGroup(
                rows = listOf(
                    Triple("Orders", "Track and revisit purchases", "/account"),
                    Triple("Returns & exchanges", "Manage eligible requests", "/account"),
                    Triple("Wallet & rewards", "Credits, refunds and benefits", "/account"),
                ),
                onBridge = onBridge,
            )
        }

        item { AtelierAccountGroupTitle("HIDI SERVICE") }
        item {
            AtelierAccountGroup(
                rows = listOf(
                    Triple("Shipping & delivery", "How HIDI gets to you", "/shipping"),
                    Triple("About HIDI", "Our point of view", "/about"),
                ),
                onBridge = onBridge,
            )
        }
    }
}

@Composable
private fun AtelierAccountGroupTitle(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.labelSmall,
        color = AtelierGold,
        modifier = Modifier.padding(start = 22.dp, top = 22.dp, bottom = 8.dp),
    )
}

@Composable
private fun AtelierAccountGroup(
    rows: List<Triple<String, String, String>>,
    onBridge: (String, String) -> Unit,
) {
    Column(modifier = Modifier.padding(horizontal = 18.dp)) {
        rows.forEachIndexed { index, row ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onBridge(row.third, row.first) }
                    .padding(vertical = 17.dp, horizontal = 4.dp),
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(row.first, style = MaterialTheme.typography.titleMedium, color = AtelierInk)
                    Text(
                        row.second,
                        style = MaterialTheme.typography.bodyMedium,
                        color = AtelierMuted,
                        modifier = Modifier.padding(top = 3.dp),
                    )
                }
                Icon(
                    Icons.Outlined.ArrowForward,
                    contentDescription = null,
                    tint = AtelierMuted,
                    modifier = Modifier.size(18.dp),
                )
            }
            if (index < rows.lastIndex) HorizontalDivider(color = AtelierLine)
        }
    }
}

@Composable
fun AtelierProductScreen(
    slug: String,
    products: List<AtelierProduct>,
    repository: AtelierRepository,
    savedSlugs: Set<String>,
    cartSession: String,
    cartCount: Int,
    onBack: () -> Unit,
    onBag: () -> Unit,
    onCartCount: (Int) -> Unit,
    onToggleSaved: (String) -> Unit,
) {
    var product by remember(slug, products) {
        mutableStateOf(products.firstOrNull { it.slug == slug })
    }
    var showSizes by remember { mutableStateOf(false) }
    var selectedColor by remember { mutableStateOf("") }
    var selectedVariant by remember { mutableStateOf<AtelierVariant?>(null) }
    var added by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current

    LaunchedEffect(slug) {
        if (product == null) product = repository.product(slug)
        product?.variants?.firstOrNull()?.color?.let { if (selectedColor.isBlank()) selectedColor = it }
    }

    val current = product
    if (current == null) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(AtelierCanvas),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(color = AtelierWine)
        }
        return
    }

    val images = current.images.ifEmpty { listOf("") }
    val pagerState = rememberPagerState(pageCount = { images.size })

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AtelierCanvas),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 110.dp),
        ) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height((LocalConfiguration.current.screenHeightDp * 0.68f).dp.coerceAtLeast(520.dp))
                        .background(AtelierStone),
                ) {
                    HorizontalPager(
                        state = pagerState,
                        modifier = Modifier.fillMaxSize(),
                    ) { page ->
                        AsyncImage(
                            model = images[page],
                            contentDescription = current.name,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .statusBarsPadding()
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                    ) {
                        AtelierGlassIcon(Icons.Outlined.ArrowBack, "Back", onBack)
                        Spacer(Modifier.weight(1f))
                        AtelierHeart(
                            saved = savedSlugs.contains(current.slug),
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                onToggleSaved(current.slug)
                            },
                            dark = true,
                        )
                        Spacer(Modifier.width(7.dp))
                        AtelierBagIcon(cartCount = cartCount, dark = true, onClick = onBag)
                    }

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 14.dp),
                    ) {
                        repeat(images.size) { index ->
                            Box(
                                modifier = Modifier
                                    .size(width = if (index == pagerState.currentPage) 20.dp else 6.dp, height = 3.dp)
                                    .clip(RoundedCornerShape(99.dp))
                                    .background(
                                        if (index == pagerState.currentPage) Color.White
                                        else Color.White.copy(alpha = 0.42f),
                                    ),
                            )
                        }
                    }
                }
            }

            item {
                Column(modifier = Modifier.padding(horizontal = 22.dp, vertical = 24.dp)) {
                    Text("HIDI ATELIER", style = MaterialTheme.typography.labelSmall, color = AtelierGold)
                    Text(
                        current.name,
                        style = MaterialTheme.typography.displayMedium,
                        color = AtelierInk,
                        modifier = Modifier.padding(top = 7.dp),
                    )
                    Text(
                        formatAtelierPrice(
                            selectedVariant?.pricePaise ?: current.minPricePaise,
                        ),
                        style = MaterialTheme.typography.titleMedium,
                        color = AtelierWine,
                        modifier = Modifier.padding(top = 10.dp),
                    )
                    if (current.description.isNotBlank()) {
                        Text(
                            current.description,
                            style = MaterialTheme.typography.bodyLarge,
                            color = AtelierMuted,
                            modifier = Modifier.padding(top = 18.dp),
                        )
                    }
                }
            }

            item {
                AtelierDetailRows(product = current)
            }
        }

        Surface(
            color = AtelierCanvas.copy(alpha = 0.98f),
            shadowElevation = 18.dp,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth(),
        ) {
            Button(
                onClick = {
                    if (added) onBag() else showSizes = true
                },
                colors = ButtonDefaults.buttonColors(
                    containerColor = AtelierInk,
                    contentColor = Color.White,
                ),
                shape = RoundedCornerShape(100.dp),
                modifier = Modifier
                    .navigationBarsPadding()
                    .padding(horizontal = 18.dp, vertical = 12.dp)
                    .fillMaxWidth()
                    .height(56.dp),
            ) {
                Text(
                    if (added) "View bag"
                    else "Choose size",
                    style = MaterialTheme.typography.labelLarge,
                )
            }
        }

        if (showSizes) {
            ModalBottomSheet(
                onDismissRequest = { showSizes = false },
                sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
                containerColor = AtelierPaper,
                dragHandle = null,
            ) {
                AtelierSizeSheet(
                    product = current,
                    selectedColor = selectedColor,
                    selectedVariant = selectedVariant,
                    busy = busy,
                    onColor = {
                        selectedColor = it
                        selectedVariant = null
                    },
                    onVariant = { selectedVariant = it },
                    onAdd = {
                        val variant = selectedVariant ?: return@AtelierSizeSheet
                        busy = true
                        scope.launch {
                            runCatching {
                                repository.addToCart(cartSession, variant.id)
                            }.onSuccess { cart ->
                                onCartCount(cart.itemCount)
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                added = true
                                showSizes = false
                            }
                            busy = false
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun AtelierSizeSheet(
    product: AtelierProduct,
    selectedColor: String,
    selectedVariant: AtelierVariant?,
    busy: Boolean,
    onColor: (String) -> Unit,
    onVariant: (AtelierVariant) -> Unit,
    onAdd: () -> Unit,
) {
    val colors = product.variants.map { it.color }.filter { it.isNotBlank() }.distinct()
    val visibleVariants = product.variants.filter {
        selectedColor.isBlank() || it.color == selectedColor
    }

    Column(
        verticalArrangement = Arrangement.spacedBy(17.dp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 22.dp, vertical = 22.dp)
            .navigationBarsPadding(),
    ) {
        Text("HIDI FIT", style = MaterialTheme.typography.labelSmall, color = AtelierGold)
        Text("Choose the fit.", style = MaterialTheme.typography.headlineLarge, color = AtelierInk)

        if (colors.size > 1) {
            Text("Colour", style = MaterialTheme.typography.labelLarge, color = AtelierMuted)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(colors) { color ->
                    AtelierChoice(
                        label = color,
                        selected = color == selectedColor,
                        onClick = { onColor(color) },
                    )
                }
            }
        }

        Text("Size", style = MaterialTheme.typography.labelLarge, color = AtelierMuted)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(visibleVariants, key = { it.id }) { variant ->
                AtelierChoice(
                    label = variant.size,
                    selected = variant.id == selectedVariant?.id,
                    enabled = variant.available > 0,
                    onClick = { onVariant(variant) },
                )
            }
        }

        Text(
            "Finished garment fit. Choose your usual HIDI size; unavailable sizes are dimmed.",
            style = MaterialTheme.typography.bodyMedium,
            color = AtelierMuted,
        )

        Button(
            onClick = onAdd,
            enabled = selectedVariant != null && !busy,
            colors = ButtonDefaults.buttonColors(
                containerColor = AtelierWine,
                contentColor = Color.White,
                disabledContainerColor = AtelierStone,
            ),
            shape = RoundedCornerShape(100.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
        ) {
            Text(
                when {
                    busy -> "Adding…"
                    selectedVariant == null -> "Select a size"
                    else -> "Add to bag  ·  " + formatAtelierPrice(selectedVariant.pricePaise)
                },
                style = MaterialTheme.typography.labelLarge,
            )
        }
    }
}

@Composable
private fun AtelierChoice(
    label: String,
    selected: Boolean,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Surface(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(100.dp),
        color = if (selected) AtelierInk else Color.Transparent,
        border = if (selected) null else BorderStroke(1.dp, AtelierLine),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = if (selected) Color.White else AtelierInk,
            modifier = Modifier.padding(horizontal = 18.dp, vertical = 12.dp),
        )
    }
}

@Composable
private fun AtelierDetailRows(product: AtelierProduct) {
    Column(modifier = Modifier.padding(horizontal = 22.dp, vertical = 4.dp)) {
        if (product.fabric.isNotBlank()) {
            AtelierDetailRow("Fabric", product.fabric)
            HorizontalDivider(color = AtelierLine)
        }
        if (product.care.isNotBlank()) {
            AtelierDetailRow("Care", product.care)
            HorizontalDivider(color = AtelierLine)
        }
        AtelierDetailRow("Delivery", "Complimentary shipping on orders of ₹1,499 and above.")
        HorizontalDivider(color = AtelierLine)
        AtelierDetailRow("Exchange", "Eligible exchanges within 7 days.")
    }
}

@Composable
private fun AtelierDetailRow(label: String, value: String) {
    Column(modifier = Modifier.padding(vertical = 17.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = AtelierInk)
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            color = AtelierMuted,
            modifier = Modifier.padding(top = 5.dp),
        )
    }
}

@Composable
fun AtelierBagScreen(
    repository: AtelierRepository,
    cartSession: String,
    onBack: () -> Unit,
    onDiscover: () -> Unit,
    onCheckout: () -> Unit,
    onCartCount: (Int) -> Unit,
) {
    var cart by remember { mutableStateOf<AtelierCart?>(null) }
    var busyItem by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    suspend fun reload() {
        cart = repository.cart(cartSession)
        onCartCount(cart?.itemCount ?: 0)
    }

    LaunchedEffect(cartSession) { reload() }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AtelierCanvas),
    ) {
        val snapshot = cart
        if (snapshot == null) {
            CircularProgressIndicator(
                color = AtelierWine,
                modifier = Modifier.align(Alignment.Center),
            )
        } else if (snapshot.items.isEmpty()) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(32.dp),
            ) {
                Text("YOUR BAG", style = MaterialTheme.typography.labelSmall, color = AtelierGold)
                Text(
                    "Beautifully empty.",
                    style = MaterialTheme.typography.displayMedium,
                    color = AtelierInk,
                    modifier = Modifier.padding(top = 9.dp),
                )
                Text(
                    "Keep it intentional. Add only what you love.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = AtelierMuted,
                    modifier = Modifier.padding(top = 12.dp),
                )
                Surface(
                    onClick = onDiscover,
                    shape = RoundedCornerShape(100.dp),
                    color = AtelierInk,
                    modifier = Modifier.padding(top = 24.dp),
                ) {
                    Text(
                        "Browse HIDI",
                        style = MaterialTheme.typography.labelLarge,
                        color = Color.White,
                        modifier = Modifier.padding(horizontal = 22.dp, vertical = 14.dp),
                    )
                }
            }
        } else {
            LazyColumn(
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    start = 18.dp,
                    end = 18.dp,
                    bottom = 130.dp,
                ),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    AtelierBackHeader(
                        eyebrow = "READY WHEN YOU ARE",
                        title = "Your bag",
                        onBack = onBack,
                    )
                }
                item {
                    Text(
                        if (snapshot.itemCount == 1) "1 PIECE" else snapshot.itemCount.toString() + " PIECES",
                        style = MaterialTheme.typography.labelSmall,
                        color = AtelierMuted,
                        modifier = Modifier.padding(vertical = 4.dp),
                    )
                }
                items(snapshot.items, key = { it.id }) { item ->
                    AtelierBagItem(
                        item = item,
                        busy = busyItem == item.id,
                        onMinus = {
                            busyItem = item.id
                            scope.launch {
                                cart = if (item.quantity <= 1) {
                                    repository.removeFromCart(cartSession, item.id)
                                } else {
                                    repository.updateCart(cartSession, item.id, item.quantity - 1)
                                }
                                onCartCount(cart?.itemCount ?: 0)
                                busyItem = null
                            }
                        },
                        onPlus = {
                            busyItem = item.id
                            scope.launch {
                                cart = repository.updateCart(cartSession, item.id, item.quantity + 1)
                                onCartCount(cart?.itemCount ?: 0)
                                busyItem = null
                            }
                        },
                        onRemove = {
                            busyItem = item.id
                            scope.launch {
                                cart = repository.removeFromCart(cartSession, item.id)
                                onCartCount(cart?.itemCount ?: 0)
                                busyItem = null
                            }
                        },
                    )
                }
            }

            Surface(
                color = AtelierPaper,
                shadowElevation = 18.dp,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth(),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .navigationBarsPadding()
                        .padding(horizontal = 18.dp, vertical = 12.dp),
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Subtotal", style = MaterialTheme.typography.bodyMedium, color = AtelierMuted)
                        Text(
                            formatAtelierPrice(snapshot.subtotalPaise),
                            style = MaterialTheme.typography.titleLarge,
                            color = AtelierInk,
                        )
                    }
                    Button(
                        onClick = onCheckout,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = AtelierInk,
                            contentColor = Color.White,
                        ),
                        shape = RoundedCornerShape(100.dp),
                        modifier = Modifier.height(54.dp),
                    ) {
                        Text("Secure checkout", style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }

        if (cart?.items.isNullOrEmpty()) {
            AtelierGlassIcon(
                icon = Icons.Outlined.ArrowBack,
                description = "Back",
                onClick = onBack,
                dark = false,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .statusBarsPadding()
                    .padding(14.dp),
            )
        }
    }
}

@Composable
private fun AtelierBagItem(
    item: AtelierCartItem,
    busy: Boolean,
    onMinus: () -> Unit,
    onPlus: () -> Unit,
    onRemove: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp),
    ) {
        AsyncImage(
            model = item.productImage,
            contentDescription = item.productName,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(width = 112.dp, height = 146.dp)
                .background(AtelierStone),
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 14.dp, top = 3.dp),
        ) {
            Text(item.productName, style = MaterialTheme.typography.titleMedium, color = AtelierInk)
            Text(
                item.color + " · " + item.size,
                style = MaterialTheme.typography.bodyMedium,
                color = AtelierMuted,
                modifier = Modifier.padding(top = 4.dp),
            )
            Text(
                formatAtelierPrice(item.lineTotalPaise),
                style = MaterialTheme.typography.labelLarge,
                color = AtelierWine,
                modifier = Modifier.padding(top = 8.dp),
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(top = 14.dp),
            ) {
                IconButton(onClick = onMinus, enabled = !busy) {
                    Icon(Icons.Outlined.Remove, contentDescription = "Decrease", modifier = Modifier.size(18.dp))
                }
                Text(item.quantity.toString(), style = MaterialTheme.typography.labelLarge)
                IconButton(
                    onClick = onPlus,
                    enabled = !busy && item.quantity < item.available.coerceAtLeast(1),
                ) {
                    Icon(Icons.Outlined.Add, contentDescription = "Increase", modifier = Modifier.size(18.dp))
                }
                Text(
                    "Remove",
                    style = MaterialTheme.typography.labelLarge,
                    color = AtelierWine,
                    modifier = Modifier
                        .clickable(enabled = !busy, onClick = onRemove)
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun AtelierPageChrome(
    title: String,
    eyebrow: String,
    cartCount: Int,
    onSearch: (() -> Unit)?,
    onBag: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(top = 7.dp, bottom = 7.dp),
    ) {
        if (onSearch != null) {
            AtelierIconButton(Icons.Outlined.Search, "Search", onSearch)
        } else {
            Spacer(Modifier.size(44.dp))
        }
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.weight(1f),
        ) {
            Text(eyebrow, style = MaterialTheme.typography.labelSmall, color = AtelierGold)
            Text(title, style = MaterialTheme.typography.titleLarge, color = AtelierInk)
        }
        AtelierBagIcon(cartCount = cartCount, dark = false, onClick = onBag)
    }
}

@Composable
private fun AtelierBackHeader(
    eyebrow: String,
    title: String,
    onBack: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(top = 7.dp, bottom = 12.dp),
    ) {
        AtelierIconButton(Icons.Outlined.ArrowBack, "Back", onBack)
        Column(modifier = Modifier.padding(start = 10.dp)) {
            Text(eyebrow, style = MaterialTheme.typography.labelSmall, color = AtelierGold)
            Text(title, style = MaterialTheme.typography.headlineLarge, color = AtelierInk)
        }
    }
}

@Composable
private fun AtelierHeart(
    saved: Boolean,
    onClick: () -> Unit,
    dark: Boolean = false,
    modifier: Modifier = Modifier,
) {
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = if (dark) Color.Black.copy(alpha = 0.20f) else AtelierPaper.copy(alpha = 0.88f),
        modifier = modifier.size(42.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = if (saved) Icons.Outlined.Favorite else Icons.Outlined.FavoriteBorder,
                contentDescription = if (saved) "Remove from saved" else "Save",
                tint = if (dark) Color.White else if (saved) AtelierWine else AtelierInk,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

@Composable
private fun AtelierBagIcon(
    cartCount: Int,
    dark: Boolean,
    onClick: () -> Unit,
) {
    Box {
        AtelierGlassIcon(
            icon = Icons.Outlined.ShoppingBag,
            description = "Bag",
            onClick = onClick,
            dark = dark,
        )
        if (cartCount > 0) {
            Surface(
                shape = CircleShape,
                color = AtelierWine,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(17.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        cartCount.coerceAtMost(9).toString(),
                        color = Color.White,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

@Composable
private fun AtelierGlassIcon(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    description: String,
    onClick: () -> Unit,
    dark: Boolean = true,
    modifier: Modifier = Modifier,
) {
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = if (dark) Color.Black.copy(alpha = 0.20f) else AtelierPaper,
        modifier = modifier.size(44.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                icon,
                contentDescription = description,
                tint = if (dark) Color.White else AtelierInk,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

@Composable
private fun AtelierIconButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    description: String,
    onClick: () -> Unit,
) {
    IconButton(onClick = onClick, modifier = Modifier.size(44.dp)) {
        Icon(icon, contentDescription = description, tint = AtelierInk, modifier = Modifier.size(21.dp))
    }
}

private fun normalizeFilter(raw: String): String = when (raw.trim().lowercase()) {
    "", "all" -> "all"
    "new", "new-arrivals" -> "new-arrivals"
    "work", "work-edit" -> "work-edit"
    "everyday" -> "everyday"
    "occasion" -> "occasion"
    else -> raw.trim().lowercase()
}
