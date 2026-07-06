# Ghar Ka Hisab — APK Build Instructions

## Prerequisites (One-Time Setup)

### 1. Install Java JDK 17+
Download from: https://adoptium.net/
- Choose: Windows x64, JDK 17 LTS
- Install with default settings
- Verify: Open CMD → type `java -version`

### 2. Install Android Studio
Download from: https://developer.android.com/studio
- Install with default settings (includes Android SDK)
- Launch Android Studio → complete setup wizard
- Go to: SDK Manager → install **Android SDK Platform 33** (Android 13)

### 3. Set Environment Variables
Add these to Windows Environment Variables:
```
JAVA_HOME = C:\Program Files\Eclipse Adoptium\jdk-17.x.x.x-hotspot
ANDROID_HOME = C:\Users\<YourName>\AppData\Local\Android\Sdk
```
Add to PATH:
```
%JAVA_HOME%\bin
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\tools
```

---

## First-Time Capacitor Setup (Run Once)

Open CMD in the project folder (`c:\Users\BVPWSCRAP\hisab`) and run:

```bash
npm install @capacitor/core @capacitor/android @capacitor/cli
npx cap add android
```

---

## Building the APK

### Option A: Automatic (Recommended)
Double-click `build-apk.bat` — it does everything automatically.

### Option B: Manual Steps
```bash
# 1. Build web app
npm run build

# 2. Sync to Android
npx cap sync android

# 3. Build APK
cd android
./gradlew assembleDebug

# 4. Your APK is at:
# android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Installing on Phone

1. Copy `GharKaHisab.apk` (or `app-debug.apk`) to your Android phone
2. On phone: Settings → Security → **Allow Unknown Sources** (or Install Unknown Apps)
3. Open the APK file → Install
4. Find "Ghar Ka Hisab" in your app drawer!

---

## Running in Browser (Development)
No Android needed — just run:
```bash
npm run dev
```
Open: http://localhost:5173 in Chrome on your phone (same WiFi)

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `JAVA_HOME not found` | Set JAVA_HOME env variable |
| `SDK not found` | Set ANDROID_HOME env variable |
| `gradlew not found` | Run `npx cap add android` first |
| `Build failed 32` | Accept SDK licenses: `cd android && gradlew.bat --stacktrace` |
| npm install fails | Use mobile hotspot, or download from phone and transfer |

---

## App Features Summary

- ✅ Offline-first (IndexedDB — works without internet)
- ✅ Quick 1-tap entry for daily items
- ✅ Color-coded calendar (green/orange/red)
- ✅ Rate-change split billing (pure formula)
- ✅ Grocery with expiry alerts & consumption forecast
- ✅ Vendor conflict detection
- ✅ PDF + Excel export + native share
- ✅ Hindi/Marathi/English UI
- ✅ Large button mode for elderly
- ✅ Local notifications (delivery reminders, expiry, advance low)
- ✅ Vacation mode with auto-zero entries
