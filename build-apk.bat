@echo off
echo.
echo ========================================================
echo   GHAR KA HISAB - APK Builder
echo ========================================================
echo.

:: Step 1: Build web app
echo [1/4] Building web app...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: npm run build failed!
    pause
    exit /b 1
)
echo     Web build done!
echo.

:: Step 2: Sync Capacitor
echo [2/4] Syncing Capacitor...
call npx cap sync android
if %errorlevel% neq 0 (
    echo ERROR: Capacitor sync failed. Make sure you ran: npm install @capacitor/core @capacitor/android @capacitor/cli
    echo Run: npm install @capacitor/core @capacitor/android @capacitor/cli
    echo Then: npx cap add android
    pause
    exit /b 1
)
echo     Capacitor sync done!
echo.

:: Step 3: Build APK
echo [3/4] Building Android APK...
cd android
call gradlew.bat assembleDebug 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Gradle build failed!
    echo Make sure Android SDK and Java JDK 17+ are installed.
    cd ..
    pause
    exit /b 1
)
cd ..
echo     APK build done!
echo.

:: Step 4: Copy APK
echo [4/4] Copying APK...
if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    copy "android\app\build\outputs\apk\debug\app-debug.apk" "GharKaHisab.apk"
    echo.
    echo ========================================================
    echo   SUCCESS! APK ready: GharKaHisab.apk
    echo   Transfer to your Android phone and install it!
    echo ========================================================
) else (
    echo WARNING: APK not found at expected location.
    echo Check: android\app\build\outputs\apk\debug\
)
echo.
pause
