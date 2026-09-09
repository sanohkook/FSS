import java.util.Properties

plugins {
    id("com.android.application")
}

// android/keystore.properties (git 제외) 가 있으면 release 를 그 키로 서명한다.
// 없으면 release 도 디버그 키로 서명 → 배포용 아님(다른 기기 업데이트 불가).
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val hasReleaseKey = keystoreProps.getProperty("storeFile") != null

android {
    namespace = "kr.co.fss.yeyak"
    compileSdk = 36

    defaultConfig {
        applicationId = "kr.co.fss.yeyak"
        minSdk = 24
        targetSdk = 36
        versionCode = 22
        versionName = "2.18"
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (hasReleaseKey) signingConfigs.getByName("release")
            else signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    packaging {
        resources.excludes += "META-INF/*"
    }
}

dependencies {
    implementation("org.nanohttpd:nanohttpd:2.3.1")
    implementation("androidx.core:core:1.13.1") // FileProvider (업데이트 APK 설치)
}

// web/ 프런트엔드와 tide.json 을 앱 에셋으로 복사 (프로젝트 루트의 public/, data/ 와 동기화)
val syncAssets by tasks.registering(Copy::class) {
    val assets = layout.projectDirectory.dir("src/main/assets")
    into(assets)
    from(rootProject.layout.projectDirectory.dir("../public")) { into("web") }
    from(rootProject.layout.projectDirectory.file("../data/tide.json")) { into(".") }
}
tasks.named("preBuild") { dependsOn(syncAssets) }
