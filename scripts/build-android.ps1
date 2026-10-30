param([string]$Architectures = 'arm64-v8a,x86_64')
$ErrorActionPreference = 'Continue'
Set-Location (Join-Path $PSScriptRoot '..')
if (-not $env:JAVA_HOME -or -not $env:ANDROID_HOME) { throw 'Set JAVA_HOME and ANDROID_HOME to your JDK and Android SDK.' }
foreach ($name in @('FOCUS_KEYSTORE','FOCUS_KEY_ALIAS','FOCUS_STORE_PASSWORD','FOCUS_KEY_PASSWORD')) {
    if (-not [Environment]::GetEnvironmentVariable($name)) { throw "Missing private environment input: $name" }
}
$env:NODE_ENV = 'production'
& npx.cmd expo prebuild --platform android --no-install
if ($LASTEXITCODE -ne 0) { throw 'Native generation failed.' }
# Never use the generated template's debug signing identity for a release.
$gradleFile = Join-Path $PWD 'android/app/build.gradle'
$gradle = [IO.File]::ReadAllText($gradleFile).Replace('signingConfig signingConfigs.debug','// Signed externally after alignment.')
if (-not $gradle.Contains('CMAKE_OBJECT_PATH_MAX')) {
    $gradle += "`nandroid { defaultConfig { externalNativeBuild { cmake { arguments '-DCMAKE_OBJECT_PATH_MAX=240' } } } }`n"
}
[IO.File]::WriteAllText($gradleFile, $gradle, [Text.UTF8Encoding]::new($false))
& ./android/gradlew.bat -p android assembleRelease "-PreactNativeArchitectures=$Architectures" --max-workers=4
if ($LASTEXITCODE -ne 0) { throw 'Android release build failed.' }
$buildTools = Join-Path $env:ANDROID_HOME 'build-tools/37.0.0'
New-Item -ItemType Directory -Force demo | Out-Null
& "$buildTools/zipalign.exe" -f -p 4 android/app/build/outputs/apk/release/app-release-unsigned.apk android/app/build/outputs/apk/release/aligned.apk
if ($LASTEXITCODE -ne 0) { throw 'Alignment failed.' }
& "$buildTools/apksigner.bat" sign --ks $env:FOCUS_KEYSTORE --ks-key-alias $env:FOCUS_KEY_ALIAS --ks-pass env:FOCUS_STORE_PASSWORD --key-pass env:FOCUS_KEY_PASSWORD --out demo/focus-sessions-1.0.0.apk android/app/build/outputs/apk/release/aligned.apk
if ($LASTEXITCODE -ne 0) { throw 'Signing failed.' }
& "$buildTools/apksigner.bat" verify --verbose --print-certs demo/focus-sessions-1.0.0.apk
if ($LASTEXITCODE -ne 0) { throw 'Signature verification failed.' }
$hash = (Get-FileHash demo/focus-sessions-1.0.0.apk -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $PWD 'demo/SHA256SUMS'), "$hash  focus-sessions-1.0.0.apk`n", [Text.UTF8Encoding]::new($false))
