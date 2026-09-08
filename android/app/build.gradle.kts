plugins {
    id("com.android.application")
}

android {
    namespace = "kr.co.fss.yeyak"
    compileSdk = 36

    defaultConfig {
        applicationId = "kr.co.fss.yeyak"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// 의존성 없음 — 순수 android.webkit.WebView 래퍼 (AGP 9 내장 Kotlin 사용)
dependencies {}
