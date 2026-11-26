# Preserve JavaScript bridge methods exposed to the offline Windway WebView.
-keepattributes *Annotation*
-keepclassmembers class com.waqar.windway.WindwayAndroidBridge {
    @android.webkit.JavascriptInterface <methods>;
}
