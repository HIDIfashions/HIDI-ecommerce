plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

val hidiStartUrl = providers.gradleProperty("HIDI_START_URL")
    .orElse("https://thidigk.thehidi.com/")
    .get()
val hidiApiUrl = providers.gradleProperty("HIDI_API_URL")
    .orElse("https://hidi-ecommerce-api-96rn-beige.vercel.app/v1")
    .get()

android {
    namespace = "com.thehidi.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.thehidi.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 20
        versionName = "2.0.0"
        buildConfigField("String", "HIDI_START_URL", "\"$hidiStartUrl\"")
        buildConfigField("String", "HIDI_API_URL", "\"$hidiApiUrl\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            signingConfig = signingConfigs.getByName("debug")
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.06.00")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    implementation("io.coil-kt.coil3:coil-compose:3.5.0")
    implementation("io.coil-kt.coil3:coil-network-okhttp:3.5.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
