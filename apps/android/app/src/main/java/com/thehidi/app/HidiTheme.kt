package com.thehidi.app

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

object AtelierColors {
    val Canvas = Color(0xFFF5F1EB)
    val Paper = Color(0xFFFCFAF7)
    val Ink = Color(0xFF211C1A)
    val Muted = Color(0xFF7A706A)
    val Wine = Color(0xFF642E36)
    val WineDeep = Color(0xFF421C22)
    val Gold = Color(0xFFC5A36A)
    val Sage = Color(0xFFD5D9CE)
    val Line = Color(0xFFE5DED5)
    val White = Color(0xFFFFFFFF)
}

@Composable
fun HidiAtelierTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = AtelierColors.Wine,
            secondary = AtelierColors.Gold,
            background = AtelierColors.Canvas,
            surface = AtelierColors.Paper,
            onPrimary = AtelierColors.White,
            onBackground = AtelierColors.Ink,
            onSurface = AtelierColors.Ink,
        ),
        content = content,
    )
}
