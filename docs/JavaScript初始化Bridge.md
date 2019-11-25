前端使用全局 window 对象下的 WebViewJavascriptBridge，来源于 Native 注入 的WebViewJavascriptBridge_JS.m 中的 JS 字符串。

前端需要使用 WebViewJavascriptBridge 对象做一些初始化的工作，每次 call Native 端的方法，都需要主动改变 iframe 的 src 属性，达到使用 url 请求的效果，然后 Native 端便可以拦截到这个请求。具体示例代码已经放到了 /demo/bridge.js 中，可作为参考。

下节笔记学习[JavaScript主动调用iOS 方法](https://github.com/zymfe/into-WebViewJavascriptBridge/blob/master/docs/JavaScript%E4%B8%BB%E5%8A%A8%E8%B0%83%E7%94%A8iOS%20%E6%96%B9%E6%B3%95.md)

![bridge初始化流程图](https://github.com/zymfe/into-WebViewJavascriptBridge/blob/master/docs/images/bridge%E5%88%9D%E5%A7%8B%E5%8C%96%E6%B5%81%E7%A8%8B%E5%9B%BE.png)