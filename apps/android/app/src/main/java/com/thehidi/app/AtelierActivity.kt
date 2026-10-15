package com.thehidi.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge

class AtelierActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val deepLink = intent?.dataString
        setContent {
            AtelierTheme {
                AtelierApp(initialDeepLink = deepLink)
            }
        }
    }
}
