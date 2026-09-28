package com.thehidi.app

import android.net.Uri
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.PersonOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp

private sealed interface AtelierScreen {
    data object Home : AtelierScreen
    data class Discover(val initialFilter: String = "all") : AtelierScreen
    data object Search : AtelierScreen
    data object Saved : AtelierScreen
    data object You : AtelierScreen
    data object Bag : AtelierScreen
    data class Product(val slug: String) : AtelierScreen
    data class Bridge(val path: String, val title: String) : AtelierScreen
}

@Composable
fun AtelierApp(initialDeepLink: String?) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val repository = remember { AtelierRepository() }
    val store = remember { AtelierStore(context.applicationContext) }
    val cartSession = remember { store.cartSession() }

    var products by remember { mutableStateOf<List<AtelierProduct>>(emptyList()) }
    var featured by remember { mutableStateOf<List<AtelierProduct>>(emptyList()) }
    var savedSlugs by remember { mutableStateOf(store.savedSlugs()) }
    var cartCount by remember { mutableIntStateOf(0) }
    var lastTopLevel by remember { mutableStateOf<AtelierScreen>(AtelierScreen.Home) }
    var screen by remember { mutableStateOf<AtelierScreen>(deepLinkScreen(initialDeepLink)) }

    LaunchedEffect(Unit) {
        products = repository.products()
        featured = repository.featured()
        cartCount = runCatching { repository.cart(cartSession).itemCount }.getOrDefault(0)
    }

    fun openTopLevel(next: AtelierScreen) {
        lastTopLevel = next
        screen = next
    }

    fun openProduct(product: AtelierProduct) {
        screen = AtelierScreen.Product(product.slug)
    }

    fun toggleSaved(slug: String) {
        savedSlugs = store.toggleSaved(slug)
    }

    val showPrimaryNav = screen is AtelierScreen.Home ||
        screen is AtelierScreen.Discover ||
        screen is AtelierScreen.Saved ||
        screen is AtelierScreen.You

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AtelierCanvas),
    ) {
        AnimatedContent(
            targetState = screen,
            transitionSpec = {
                (fadeIn(tween(220)) + scaleIn(tween(260), initialScale = 0.992f))
                    .togetherWith(fadeOut(tween(130)))
            },
            label = "atelier-screen",
            modifier = Modifier.fillMaxSize(),
        ) { target ->
            when (target) {
                AtelierScreen.Home -> AtelierHomeScreen(
                    featured = featured.ifEmpty { products.take(8) },
                    savedSlugs = savedSlugs,
                    cartCount = cartCount,
                    onSearch = { screen = AtelierScreen.Search },
                    onBag = { screen = AtelierScreen.Bag },
                    onDiscover = { filter ->
                        val next = AtelierScreen.Discover(filter)
                        openTopLevel(next)
                    },
                    onSaved = { openTopLevel(AtelierScreen.Saved) },
                    onProduct = ::openProduct,
                    onToggleSaved = ::toggleSaved,
                )

                is AtelierScreen.Discover -> AtelierDiscoverScreen(
                    products = products,
                    initialFilter = target.initialFilter,
                    savedSlugs = savedSlugs,
                    cartCount = cartCount,
                    onSearch = { screen = AtelierScreen.Search },
                    onBag = { screen = AtelierScreen.Bag },
                    onProduct = ::openProduct,
                    onToggleSaved = ::toggleSaved,
                )

                AtelierScreen.Search -> AtelierSearchScreen(
                    products = products,
                    savedSlugs = savedSlugs,
                    onBack = { screen = lastTopLevel },
                    onProduct = ::openProduct,
                    onToggleSaved = ::toggleSaved,
                )

                AtelierScreen.Saved -> AtelierSavedScreen(
                    products = products.filter { savedSlugs.contains(it.slug) },
                    cartCount = cartCount,
                    onBag = { screen = AtelierScreen.Bag },
                    onDiscover = { openTopLevel(AtelierScreen.Discover()) },
                    onProduct = ::openProduct,
                    onToggleSaved = ::toggleSaved,
                )

                AtelierScreen.You -> AtelierYouScreen(
                    onBag = { screen = AtelierScreen.Bag },
                    onBridge = { path, title ->
                        screen = AtelierScreen.Bridge(path, title)
                    },
                )

                AtelierScreen.Bag -> AtelierBagScreen(
                    repository = repository,
                    cartSession = cartSession,
                    onBack = { screen = lastTopLevel },
                    onDiscover = { openTopLevel(AtelierScreen.Discover()) },
                    onCheckout = {
                        screen = AtelierScreen.Bridge("/checkout", "Secure checkout")
                    },
                    onCartCount = { cartCount = it },
                )

                is AtelierScreen.Product -> AtelierProductScreen(
                    slug = target.slug,
                    products = products,
                    repository = repository,
                    savedSlugs = savedSlugs,
                    cartSession = cartSession,
                    cartCount = cartCount,
                    onBack = { screen = lastTopLevel },
                    onBag = { screen = AtelierScreen.Bag },
                    onCartCount = { cartCount = it },
                    onToggleSaved = ::toggleSaved,
                )

                is AtelierScreen.Bridge -> AtelierBridgeScreen(
                    path = target.path,
                    title = target.title,
                    cartSession = cartSession,
                    onBack = { screen = lastTopLevel },
                )
            }
        }

        if (showPrimaryNav) {
            AtelierFloatingNav(
                screen = screen,
                onHome = { openTopLevel(AtelierScreen.Home) },
                onDiscover = { openTopLevel(AtelierScreen.Discover()) },
                onSaved = { openTopLevel(AtelierScreen.Saved) },
                onYou = { openTopLevel(AtelierScreen.You) },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .padding(horizontal = 18.dp, vertical = 10.dp),
            )
        }
    }
}

@Composable
private fun AtelierFloatingNav(
    screen: AtelierScreen,
    onHome: () -> Unit,
    onDiscover: () -> Unit,
    onSaved: () -> Unit,
    onYou: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(30.dp),
        color = AtelierPaper.copy(alpha = 0.98f),
        shadowElevation = 18.dp,
        tonalElevation = 0.dp,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 7.dp, vertical = 7.dp),
        ) {
            AtelierNavItem(
                label = "Home",
                icon = Icons.Outlined.Home,
                selected = screen is AtelierScreen.Home,
                onClick = onHome,
            )
            AtelierNavItem(
                label = "Discover",
                icon = Icons.Outlined.GridView,
                selected = screen is AtelierScreen.Discover,
                onClick = onDiscover,
            )
            AtelierNavItem(
                label = "Saved",
                icon = Icons.Outlined.FavoriteBorder,
                selected = screen is AtelierScreen.Saved,
                onClick = onSaved,
            )
            AtelierNavItem(
                label = "You",
                icon = Icons.Outlined.PersonOutline,
                selected = screen is AtelierScreen.You,
                onClick = onYou,
            )
        }
    }
}

@Composable
private fun AtelierNavItem(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val color = if (selected) AtelierWine else AtelierMuted
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(22.dp),
        color = if (selected) AtelierSoftWine else androidx.compose.ui.graphics.Color.Transparent,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(if (selected) 7.dp else 0.dp),
            modifier = Modifier.padding(
                horizontal = if (selected) 13.dp else 12.dp,
                vertical = 10.dp,
            ),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = color,
                modifier = Modifier.size(21.dp),
            )
            if (selected) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelLarge,
                    color = color,
                )
            }
        }
    }
}

private fun deepLinkScreen(raw: String?): AtelierScreen {
    if (raw.isNullOrBlank()) return AtelierScreen.Home
    return runCatching {
        val uri = Uri.parse(raw)
        val path = uri.path.orEmpty()
        when {
            path == "/" || path.isBlank() -> AtelierScreen.Home
            path.startsWith("/products/") -> AtelierScreen.Product(
                path.removePrefix("/products/").substringBefore("/"),
            )
            path.startsWith("/collections/") -> AtelierScreen.Discover(
                path.removePrefix("/collections/").substringBefore("/").ifBlank { "all" },
            )
            path.startsWith("/wishlist") -> AtelierScreen.Saved
            path.startsWith("/cart") -> AtelierScreen.Bag
            path.startsWith("/account") -> AtelierScreen.You
            else -> AtelierScreen.Home
        }
    }.getOrDefault(AtelierScreen.Home)
}
