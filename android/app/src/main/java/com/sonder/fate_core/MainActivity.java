package com.sonder.fate_core;

import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import java.io.File;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        purgeWebViewServiceWorkers();
        SplashScreen.installSplashScreen(this);
        registerPlugin(WindowBackgroundPlugin.class);
        super.onCreate(savedInstanceState);
        disableWebViewHttpCache();

        // Remove the OS-drawn translucent scrim behind 3-button navigation so the
        // bar reflects our own app background instead of an extra dark tint.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }
    }

    private void disableWebViewHttpCache() {
        if (this.bridge == null) {
            return;
        }

        WebView webView = this.bridge.getWebView();
        if (webView == null) {
            return;
        }

        webView.clearCache(true);
        webView.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
    }

    private void purgeWebViewServiceWorkers() {
        File webViewDir = new File(getApplicationInfo().dataDir, "app_webview");
        if (webViewDir.exists()) {
            purgeServiceWorkerAndHttpCache(webViewDir);
        }
    }

    private void purgeServiceWorkerAndHttpCache(File dir) {
        if (shouldPreserve(dir.getName())) {
            return;
        }

        File[] children = dir.listFiles();
        if (children == null) {
            return;
        }

        for (File child : children) {
            if (!child.isDirectory()) {
                continue;
            }

            if (isServiceWorkerOrHttpCacheDir(child.getName())) {
                deleteRecursively(child);
            } else {
                purgeServiceWorkerAndHttpCache(child);
            }
        }
    }

    private boolean shouldPreserve(String name) {
        return "IndexedDB".equals(name)
            || "Local Storage".equals(name)
            || "Session Storage".equals(name)
            || "WebStorage".equals(name)
            || "databases".equals(name);
    }

    private boolean isServiceWorkerOrHttpCacheDir(String name) {
        return "Service Worker".equals(name)
            || "ServiceWorker".equals(name)
            || "CacheStorage".equals(name)
            || "Cache".equals(name)
            || "Code Cache".equals(name)
            || "HTTP Cache".equals(name);
    }

    private void deleteRecursively(File file) {
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) {
                deleteRecursively(child);
            }
        }
        file.delete();
    }
}
