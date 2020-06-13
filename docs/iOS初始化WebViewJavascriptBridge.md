在 /demo/YMBridgeController.m 文件中，setupJsBridge 方法用来初始化 WebViewJavascriptBridge：

``` objc 
self.bridge = [WebViewJavascriptBridge bridgeForWebView:self.webview];
```

来到 WebViewJavascriptBridge 源码目录，打开 WebViewJavascriptBridge.m 文件，找到 bridgeForWebView 方法，相关代码如下：

``` objc
// 类方法，用来初始化 bridge
+ (instancetype)bridgeForWebView:(id)webView {
    return [self bridge:webView];
}

+ (instancetype)bridge:(id)webView {
#if defined supportsWKWebView
    // 通过 supportsWKWebView 判断是否支持 WKWebView
    // 如果支持的话，执行 WKWebViewJavascriptBridge 类方法 bridgeForWebView
    if ([webView isKindOfClass:[WKWebView class]]) {
        return (WebViewJavascriptBridge*) [WKWebViewJavascriptBridge bridgeForWebView:webView];
    }
#endif
    if ([webView isKindOfClass:[WVJB_WEBVIEW_TYPE class]]) {
        WebViewJavascriptBridge* bridge = [[self alloc] init];
        [bridge _platformSpecificSetup:webView];
        return bridge;
    }
    [NSException raise:@"BadWebViewType" format:@"Unknown web view type."];
    return nil;
}
```

打开 WKWebViewJavascriptBridge.m 文件，找到：

``` objc
+ (instancetype)bridgeForWebView:(WKWebView*)webView {
    WKWebViewJavascriptBridge* bridge = [[self alloc] init];

    [bridge _setupInstance:webView];
    [bridge reset];
    return bridge;
}
```

实例化 bridge 之后，依次执行 _setupInstance 和 reset 方法：

``` objc
- (void) _setupInstance:(WKWebView*)webView {
    // 使用成员变量 _webView 保存 webView
    _webView = webView;
    // 设置 navigationDelegate，很重要
    // navigationDelegate 的类型是 WKNavigationDelegate，定义了很多 WKWebView 运行过程中的代理方法
    // 后面要使用其拦截 URL 的功能
    _webView.navigationDelegate = self;
    // 实例化 WebViewJavascriptBridgeBase
    _base = [[WebViewJavascriptBridgeBase alloc] init];
    // 设置 WebViewJavascriptBridgeBase 的 delegate，方便调用 _evaluateJavascript
    _base.delegate = self;
}
```

```objc
- (void)reset {
    // 调用 WebViewJavascriptBridgeBase 的 reset 方法
    [_base reset];
}
```

``` objc
- (void)reset {
    // 重置三个很重要的成员变量：startupMessageQueue 、responseCallbacks 和 _uniqueId
    // 记住它们的数据类型
    // 关于它们的作用，在 README 中介绍 WebViewJavaScriptBridge 目录结构 时已说明
    self.startupMessageQueue = [NSMutableArray array]; // 数组
    self.responseCallbacks = [NSMutableDictionary dictionary]; // 字典
    _uniqueId = 0;
}
```

因为 webview 的 navigationDelegate 属性指向了 WKWebViewJavascriptBridge 实例，那么 webview 就有权执行 WKWebViewJavascriptBridge 实例的某些已实现的方法，如：

``` objc
- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    // 如果不是指定的 webView 则不做任何处理
    if (webView != _webView) { return; }
    NSURL *url = navigationAction.request.URL;
    __strong typeof(_webViewDelegate) strongDelegate = _webViewDelegate;

    // 判断是否是前端和Native协商好的协议格式
    if ([_base isWebViewJavascriptBridgeURL:url]) {
        // 是否是 webView loaded 的url
        if ([_base isBridgeLoadedURL:url]) {
            // 注入 WebViewJavascriptBridge_JS.m 中的 JS 字符串
            // JS 就能通过全局 window 对象访问 WebViewJavascriptBridge 了
            [_base injectJavascriptFile];
          // 是否是JS主动发送的 call 消息
        } else if ([_base isQueueMessageURL:url]) {
            // 刷新 MessageQueue 队列
            [self WKFlushMessageQueue];
        } else {
            // 未知消息
            [_base logUnkownMessage:url];
        }
        // 取消执行正常的http请求流程，Native 自己处理剩余逻辑
        decisionHandler(WKNavigationActionPolicyCancel);
        return;
    }
    
    // 如果不是前端和Native协商好的URL格式，说明是正常的http请求
    if (strongDelegate && [strongDelegate respondsToSelector:@selector(webView:decidePolicyForNavigationAction:decisionHandler:)]) {
        [_webViewDelegate webView:webView decidePolicyForNavigationAction:navigationAction decisionHandler:decisionHandler];
    } else {
        decisionHandler(WKNavigationActionPolicyAllow);
    }
}
```

从以上代码可知，Native 获取 JS 发送的消息的方式，就是拦截URL请求。

下节笔记学习[JavaScript初始化Bridge](https://github.com/zhaoyiming0803/into-WebViewJavascriptBridge/blob/master/docs/JavaScript%E5%88%9D%E5%A7%8B%E5%8C%96Bridge.md)

![bridge初始化流程图](https://github.com/zhaoyiming0803/into-WebViewJavascriptBridge/blob/master/docs/images/bridge%E5%88%9D%E5%A7%8B%E5%8C%96%E6%B5%81%E7%A8%8B%E5%9B%BE.png)