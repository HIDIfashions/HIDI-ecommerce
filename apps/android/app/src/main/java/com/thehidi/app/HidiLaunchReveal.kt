package com.thehidi.app

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

@Composable
fun HidiLaunchReveal(onFinished: () -> Unit) {
    val logoAlpha = remember { Animatable(0f) }
    val logoScale = remember { Animatable(.92f) }
    val veilAlpha = remember { Animatable(1f) }

    LaunchedEffect(Unit) {
        delay(80)
        logoAlpha.animateTo(
            1f,
            animationSpec = tween(durationMillis = 250, easing = FastOutSlowInEasing),
        )
        logoScale.animateTo(
            1f,
            animationSpec = tween(durationMillis = 220, easing = FastOutSlowInEasing),
        )
        delay(380)
        veilAlpha.animateTo(
            0f,
            animationSpec = tween(durationMillis = 190, easing = FastOutSlowInEasing),
        )
        onFinished()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .alpha(veilAlpha.value)
            .background(Color(0xFF1F1C1B))
    ) {
        Image(
            painter = painterResource(R.drawable.hidi_splash_model),
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
        )

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0f to Color.Black.copy(alpha = .05f),
                        .48f to Color.Black.copy(alpha = .10f),
                        1f to Color.Black.copy(alpha = .32f),
                    )
                )
        )

        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .padding(horizontal = 40.dp)
                .alpha(logoAlpha.value)
                .scale(logoScale.value),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            androidx.compose.material3.Text(
                text = "HIDI",
                color = Color(0xFFE4B65F),
                fontSize = 42.sp,
                fontWeight = FontWeight.Light,
                letterSpacing = 12.sp,
            )
            androidx.compose.material3.Text(
                text = "THE MODERN INDIAN EDIT",
                color = Color.White.copy(alpha = .92f),
                fontSize = 8.sp,
                fontWeight = FontWeight.Medium,
                letterSpacing = 2.2.sp,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}
