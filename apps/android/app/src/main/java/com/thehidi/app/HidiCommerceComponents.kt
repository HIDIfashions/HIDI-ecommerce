package com.thehidi.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.LiveTv
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material3.Badge
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import java.text.NumberFormat
import java.util.Locale

object CommerceColors {
    val Canvas = Color(0xFFF8F5F0)
    val Surface = Color(0xFFFFFFFF)
    val Ink = Color(0xFF1F1C1B)
    val Muted = Color(0xFF756E6A)
    val Wine = Color(0xFF6B2D3A)
    val WineSoft = Color(0xFFF3E8EB)
    val Gold = Color(0xFFB58D4A)
    val Sage = Color(0xFFE1E3DA)
    val Sand = Color(0xFFECE4D9)
    val Line = Color(0xFFE6E0D9)
    val Green = Color(0xFF315E48)
    val Red = Color(0xFF9D333A)
}

enum class CommerceTab { HOME, SHOP, TV, WISHLIST, ACCOUNT }

@Composable
fun CommerceAppBar(
    title: String? = null,
    cartCount: Int = 0,
    modifier: Modifier = Modifier,
    onSearch: () -> Unit,
    onBag: () -> Unit,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(CommerceColors.Surface)
            .padding(
                top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 5.dp,
                start = 16.dp,
                end = 8.dp,
                bottom = 7.dp,
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                "HIDI",
                color = CommerceColors.Ink,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 5.sp,
            )
            if (!title.isNullOrBlank()) {
                Text(
                    title.uppercase(),
                    color = CommerceColors.Muted,
                    fontSize = 8.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.3.sp,
                    modifier = Modifier.padding(top = 1.dp),
                )
            }
        }
        IconButton(onClick = onSearch, modifier = Modifier.size(46.dp)) {
            Icon(Icons.Outlined.Search, contentDescription = "Search", tint = CommerceColors.Ink)
        }
        Box {
            IconButton(onClick = onBag, modifier = Modifier.size(46.dp)) {
                Icon(Icons.Outlined.ShoppingBag, contentDescription = "Bag", tint = CommerceColors.Ink)
            }
            if (cartCount > 0) {
                Badge(
                    containerColor = CommerceColors.Wine,
                    contentColor = Color.White,
                    modifier = Modifier.align(Alignment.TopEnd),
                ) {
                    Text(cartCount.coerceAtMost(99).toString(), fontSize = 8.sp)
                }
            }
        }
    }
}

@Composable
fun CommerceBottomNav(
    current: CommerceTab,
    wishlistCount: Int,
    modifier: Modifier = Modifier,
    onSelect: (CommerceTab) -> Unit,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(CommerceColors.Surface)
            .padding(
                start = 4.dp,
                end = 4.dp,
                top = 5.dp,
                bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + 5.dp,
            ),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NavItem(Icons.Outlined.Home, "Home", current == CommerceTab.HOME) { onSelect(CommerceTab.HOME) }
        NavItem(Icons.Outlined.Storefront, "Shop", current == CommerceTab.SHOP) { onSelect(CommerceTab.SHOP) }
        NavItem(Icons.Outlined.LiveTv, "HIDI TV", current == CommerceTab.TV) { onSelect(CommerceTab.TV) }
        NavItem(
            if (current == CommerceTab.WISHLIST) Icons.Outlined.Favorite else Icons.Outlined.FavoriteBorder,
            "Wishlist",
            current == CommerceTab.WISHLIST,
            badge = wishlistCount,
        ) { onSelect(CommerceTab.WISHLIST) }
        NavItem(Icons.Outlined.AccountCircle, "Account", current == CommerceTab.ACCOUNT) { onSelect(CommerceTab.ACCOUNT) }
    }
}

@Composable
private fun NavItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    selected: Boolean,
    badge: Int = 0,
    onClick: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clip(RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp),
    ) {
        Box {
            Icon(
                icon,
                contentDescription = label,
                tint = if (selected) CommerceColors.Wine else CommerceColors.Muted,
                modifier = Modifier.size(21.dp),
            )
            if (badge > 0) {
                Badge(
                    containerColor = CommerceColors.Wine,
                    contentColor = Color.White,
                    modifier = Modifier.align(Alignment.TopEnd),
                ) {
                    Text(badge.coerceAtMost(9).toString(), fontSize = 7.sp)
                }
            }
        }
        Text(
            label,
            color = if (selected) CommerceColors.Wine else CommerceColors.Muted,
            fontSize = 8.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            modifier = Modifier.padding(top = 3.dp),
        )
    }
}

@Composable
fun SearchEntry(onClick: () -> Unit, hint: String = "Search kurtas, colours, occasions…") {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 8.dp)
            .background(CommerceColors.Surface, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.Search, contentDescription = null, tint = CommerceColors.Muted, modifier = Modifier.size(19.dp))
        Text(hint, color = CommerceColors.Muted, fontSize = 13.sp, modifier = Modifier.padding(start = 10.dp))
    }
}

@Composable
fun CommerceSectionHeader(
    title: String,
    subtitle: String? = null,
    action: String? = null,
    onAction: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = 16.dp, end = 10.dp, top = 25.dp, bottom = 12.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                title,
                color = CommerceColors.Ink,
                fontFamily = FontFamily.Serif,
                fontSize = 23.sp,
                fontWeight = FontWeight.Medium,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    subtitle,
                    color = CommerceColors.Muted,
                    fontSize = 11.sp,
                    modifier = Modifier.padding(top = 3.dp),
                )
            }
        }
        if (!action.isNullOrBlank() && onAction != null) {
            Text(
                action.uppercase(),
                color = CommerceColors.Wine,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
                modifier = Modifier
                    .clickable(onClick = onAction)
                    .padding(10.dp),
            )
        }
    }
}

@Composable
fun CommerceProductCard(
    product: HidiProduct,
    saved: Boolean,
    width: Dp,
    onOpen: () -> Unit,
    onToggleSaved: () -> Unit,
    showBadge: Boolean = true,
) {
    Column(
        modifier = Modifier
            .width(width)
            .clickable(onClick = onOpen)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(width * 1.34f)
                .clip(RoundedCornerShape(10.dp))
                .background(CommerceColors.Sage)
        ) {
            CommerceImage(product.primaryImage, Modifier.fillMaxSize())
            if (showBadge && product.inStock && product.soldQuantity > 0) {
                Text(
                    "TRENDING",
                    color = CommerceColors.Ink,
                    fontSize = 7.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = .8.sp,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(8.dp)
                        .background(Color.White.copy(alpha = .92f), RoundedCornerShape(4.dp))
                        .padding(horizontal = 7.dp, vertical = 4.dp),
                )
            }
            IconButton(
                onClick = onToggleSaved,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(5.dp)
                    .size(38.dp)
                    .background(Color.White.copy(alpha = .9f), CircleShape)
            ) {
                Icon(
                    if (saved) Icons.Outlined.Favorite else Icons.Outlined.FavoriteBorder,
                    contentDescription = if (saved) "Remove from wishlist" else "Add to wishlist",
                    tint = if (saved) CommerceColors.Wine else CommerceColors.Ink,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
        Text(
            product.name,
            color = CommerceColors.Ink,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 8.dp),
        )
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 3.dp)) {
            Text(commerceMoney(product.minPricePaise), color = CommerceColors.Ink, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            if (product.averageRating > 0.0 && product.reviewCount > 0) {
                Text(
                    "  ★ ${String.format(Locale.US, "%.1f", product.averageRating)}",
                    color = CommerceColors.Gold,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
fun CommerceImage(url: String, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    AsyncImage(
        model = ImageRequest.Builder(context).data(url).crossfade(180).build(),
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier,
    )
}

@Composable
fun CategoryCircle(
    title: String,
    image: String,
    onClick: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .width(72.dp)
            .clickable(onClick = onClick)
    ) {
        CommerceImage(
            image,
            Modifier
                .size(62.dp)
                .clip(CircleShape)
                .background(CommerceColors.Sand)
        )
        Text(
            title,
            color = CommerceColors.Ink,
            fontSize = 9.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            modifier = Modifier.padding(top = 7.dp),
        )
    }
}

@Composable
fun Pill(
    text: String,
    selected: Boolean = false,
    onClick: () -> Unit,
) {
    Text(
        text,
        color = if (selected) Color.White else CommerceColors.Ink,
        fontSize = 10.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier
            .background(
                if (selected) CommerceColors.Ink else CommerceColors.Surface,
                RoundedCornerShape(50)
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 15.dp, vertical = 10.dp),
    )
}

@Composable
fun RewardsStrip(
    title: String = "HIDI Rewards",
    copy: String = "Earn rewards on eligible purchases",
    onClick: (() -> Unit)? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 8.dp)
            .background(CommerceColors.WineSoft, RoundedCornerShape(14.dp))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(34.dp)
                .background(CommerceColors.Wine, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text("H", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
        Column(Modifier.padding(start = 11.dp).weight(1f)) {
            Text(title, color = CommerceColors.Ink, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Text(copy, color = CommerceColors.Muted, fontSize = 9.sp, modifier = Modifier.padding(top = 2.dp))
        }
        if (onClick != null) Text("VIEW", color = CommerceColors.Wine, fontSize = 8.sp, fontWeight = FontWeight.Bold)
    }
}

fun commerceMoney(paise: Int): String =
    NumberFormat.getCurrencyInstance(Locale("en", "IN")).apply { maximumFractionDigits = 0 }
        .format(paise / 100.0)
