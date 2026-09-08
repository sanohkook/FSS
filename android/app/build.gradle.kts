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
        versionCode = 2
        versionName = "2.0"
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
    packaging {
        resources.excludes += "META-INF/*"
    }
}

dependencies {
    implementation("org.nanohttpd:nanohttpd:2.3.1")
}

// web/ 프런트엔드와 tide.json 을 앱 에셋으로 복사 (프로젝트 루트의 public/, data/ 와 동기화)
val syncAssets by tasks.registering(Copy::class) {
    val assets = layout.projectDirectory.dir("src/main/assets")
    into(assets)
    from(rootProject.layout.projectDirectory.dir("../public")) { into("web") }
    from(rootProject.layout.projectDirectory.file("../data/tide.json")) { into(".") }
}
tasks.named("preBuild") { dependsOn(syncAssets) }
