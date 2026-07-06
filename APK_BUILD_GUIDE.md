# Ghar Ka Hisab — APK Build Complete Guide

## ❌ Is Machine Par Direct Build Possible Nahi Hai

**Reason:**
- Java 1.8 installed — Gradle ko **Java 17+** chahiye
- Android SDK not found — Android Studio install nahi hai

---

## ✅ Option 1: Capacitor + Android Studio (Recommended - Free)

### Step 1: JDK 17 Download & Install (5 minutes)
```
URL: https://adoptium.net/temurin/releases/?version=17
Choose: Windows x64 → .msi file → Install
```

### Step 2: Android Studio Download & Install (15 minutes)
```
URL: https://developer.android.com/studio
Download → Run installer → Accept all defaults
Launch → Complete setup wizard (installs Android SDK automatically)
```

### Step 3: Environment Variables Set Karo
```
Windows Search → "Environment Variables" → System Variables:

JAVA_HOME = C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot
ANDROID_HOME = C:\Users\<YourName>\AppData\Local\Android\Sdk

PATH mein add karo:
%JAVA_HOME%\bin
%ANDROID_HOME%\platform-tools
```

### Step 4: APK Build (1 command)
```
Project folder mein double-click karo: build-apk.bat
```
**Output: `GharKaHisab.apk` ban jaayegi!**

---

## ✅ Option 2: GitHub Actions (Free Cloud Build — No Android Studio Needed!)

Yeh sabse fast option hai — GitHub par code push karo, APK automatically build ho jaati hai.

### Step 1: GitHub Account banao (free) → https://github.com

### Step 2: New Repository banao → "ghar-ka-hisab"

### Step 3: `.github/workflows/build-apk.yml` file already create kar di hai (neeche dekho)

### Step 4: Code push karo:
```bash
cd c:\Users\BVPWSCRAP\hisab
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/ghar-ka-hisab.git
git push -u origin main
```

### Step 5: GitHub → Actions tab → APK download karo!

---

## ✅ Option 3: Appetize.io (Browser mein test karo — Instant!)
```
URL: https://appetize.io
Upload your APK or web app → Test on virtual Android phone in browser
```

---

## ✅ Option 4: PWA Install (No APK needed — Fastest!)

Yeh **sabse easy** option hai — koi build nahi, koi install nahi:

1. Phone mein Chrome browser open karo
2. Same WiFi par: `http://10.38.2.12:5174/`
3. Chrome menu → **"Add to Home Screen"**
4. Done! App phone ke home screen par aa jaayegi — bilkul native app ki tarah!

PWA features:
- ✅ Offline kaam karta hai
- ✅ Home screen icon milta hai
- ✅ Full screen (no browser bar)
- ✅ Local notifications kaam karti hain
