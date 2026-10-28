package com.israeltoknt.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;

/**
 * IsraelTokn't for Android: a full-screen WebView around the live web app.
 * Everything (accounts, feed, chat, realtime) runs on the server, so the app
 * stays in sync with the website without app updates.
 */
public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final String OFFLINE_PAGE = "file:///android_asset/offline.html";

    private WebView webView;
    private ValueCallback<Uri[]> pendingUpload;
    private static final String LEGACY_HOST = "israeltoknt.vercel.app";
    private String appHost;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        appHost = Uri.parse(BuildConfig.APP_URL).getHost();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#080808"));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#080808"));
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        applyInsets(root);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // muted feed videos autoplay like the web
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setSupportZoom(false);
        s.setUserAgentString(s.getUserAgentString() + " IsraelTokntAndroid/" + BuildConfig.VERSION_NAME);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new ShellClient());
        webView.setWebChromeClient(new ShellChrome());

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(startUrl(getIntent()));
        }
    }

    /** Opens deep links (e.g. invite links) inside the app; otherwise the home page. */
    private String startUrl(Intent intent) {
        Uri data = intent != null ? intent.getData() : null;
        if (data != null && appHost.equals(data.getHost()) && "https".equals(data.getScheme())) {
            return data.toString();
        }
        // Links to the pre-YORU address open the same page on the current one.
        if (data != null && LEGACY_HOST.equals(data.getHost()) && "https".equals(data.getScheme())) {
            return data.buildUpon().authority(appHost).build().toString();
        }
        return BuildConfig.APP_URL;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent.getData() != null) webView.loadUrl(startUrl(intent));
    }

    /** Keep content clear of the status bar, navigation bar and keyboard (edge-to-edge on Android 15+). */
    private void applyInsets(View root) {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.setSystemBarsAppearance(0, WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
            }
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets bars = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsets.CONSUMED;
            });
        } else {
            getWindow().setStatusBarColor(Color.parseColor("#080808"));
            getWindow().setNavigationBarColor(Color.parseColor("#070a14"));
        }
    }

    private void handleBack() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            moveTaskToBack(true);
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        handleBack();
    }

    private boolean isAppUrl(Uri uri) {
        return uri != null && "https".equals(uri.getScheme()) && appHost.equals(uri.getHost());
    }

    private class ShellClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isAppUrl(uri)) return false;
            if ("file".equals(uri.getScheme())) return false;
            // Everything else (external links, mailto:, etc.) opens outside the app.
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException ignored) {
                // nothing can open it
            }
            return true;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                view.loadUrl(OFFLINE_PAGE + "?u=" + Uri.encode(BuildConfig.APP_URL));
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            CookieManager.getInstance().flush();
        }
    }

    private class ShellChrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (pendingUpload != null) pendingUpload.onReceiveValue(null);
            pendingUpload = callback;
            try {
                startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
            } catch (ActivityNotFoundException e) {
                pendingUpload = null;
                return false;
            }
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && pendingUpload != null) {
            pendingUpload.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            pendingUpload = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
        webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
