### into WebViewJavascriptBridge

最新项目中，把 APP 和 小程序 里 80% 的页面都换成了 H5，目的是快速开发，方便热更新。

前端除了要保证代码高度复用并且降低耦合，还要负责主动和 Native 开发的同学沟通，定义好协议，留下文档，方便后期维护。

混合开发，最核心的是数据交互：

- 小程序端：在不影响用户体验的情况下，直接或间接的使用现有规则进行开发。

- Native端：使用了目前市面上成熟的 WebViewJavaScriptBridge 开源库。在 Android 端踩了一些坑，iOS 端没出现太大的问题。

项目完成了，抽时间学习下 WebViewJavaScriptBridge 源码，顺便对这次 Hybrid 开发做下总结。

### JavaScript 与 Native 交互的方式（以iOS为例）

1、JS 调用 Native 方法：

- Native 拦截 URL 跳转

``` javascript
window.location.href = 'Native自定义协议';
```

- 使用 WebKit，苹果官方推荐安使用这种方式

``` javascript
window.webkit.messagehandlers.<name>.postMessage('xxx');
```

2、Native 调用 JS 方法

前端将 JS function 暴露到全局 window 对象上， Native 在 web-view 中注入 JS 代码执行。

以上方法如果单独使用，都比较麻烦，而且代码难以组织，Native 拦截 URL 跳转或使用 WebKit 更多时候是用在前端单向调用 Native 方法，不支持 return 和 callback，只能做 send 操作，做不了 get 操作。

3、使用 WebViewJavaScriptBridge 开源库

iOS 和 Android 对应的代码开源地址：

[iOS WebViewJavascriptBridge](https://github.com/marcuswestin/WebViewJavascriptBridge)

[Android JsBridge](https://github.com/lzyzsd/JsBridge)

### 本次源码（iOS WebViewJavascriptBridge）学习笔记全部记录在 docs 目录下。

WebViewJavascriptBridge 的使用方式

iOS 初始化 WebViewJavascriptBridge

JavaScript 初始化 Bridge

JavaScript 主动调用 iOS 方法

iOS 主动调用 JavaScript 方法

### 代码示例全部放在 demo 目录下，包括 JavaScript 和 Objective-C 初始化及具体调用方法。

[bridge.js](https://github.com/zymfe/into-WebViewJavascriptBridge/blob/master/demo/bridge.js)

[YMBridge.m](https://github.com/zymfe/into-WebViewJavascriptBridge/blob/master/demo/YMBridge.m)