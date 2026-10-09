package com.thehidi.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.view.WindowCompat

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        val showBrandRevealOnStart = savedInstanceState == null
        if (showBrandRevealOnStart) applyLaunchSystemBars() else applyCommerceSystemBars()

        setContent {
            HidiAtelierTheme {
                var showBrandReveal by rememberSaveable {
                    mutableStateOf(showBrandRevealOnStart)
                }

                Box(Modifier.fillMaxSize()) {
                    HidiCommerceApp(
                        initialPath = intent?.data?.path.orEmpty(),
                    )

                    if (showBrandReveal) {
                        HidiLaunchReveal {
                            showBrandReveal = false
                            applyCommerceSystemBars()
                        }
                    }
                }
            }
        }
    }

    private fun applyLaunchSystemBars() {
        window.statusBarColor = android.graphics.Color.TRANSPARENT
        window.navigationBarColor = android.graphics.Color.TRANSPARENT
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
    }

    private fun applyCommerceSystemBars() {
        window.statusBarColor = android.graphics.Color.TRANSPARENT
        window.navigationBarColor = android.graphics.Color.rgb(248, 245, 240)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }
    }
}
