JS 主动调用 Native，首先 Native 要注册好对应的方法，所以本节笔记从 Native 使用 register 注册方法开始，然后 JS 再使用 call 调用 Native 注册好的方法。

``` objc
self.bridge registerHandler:@"login" handler:^(id data, WVJBResponseCallback responseCallback) {  
  NSString *response = @"this is a responsive message from native";
  responseCallback(response);
}];
```

registerHandler 方法在 WebViewJavascriptBridge.m 文件中

``` objc  
- (void)registerHandler:(NSString *)handlerName handler:(WVJBHandler)handler {
    // 给 messageHandlers 字典赋值
    // handlerName 作为键名
    // handler 拷贝作为键值
    _base.messageHandlers[handlerName] = [handler copy];
}
```
注册完成，前端可以调用了：

``` javascript
window.WebViewJavascriptBridge.callHandler(handlerName, data, callback)
```

在笔记《[iOS初始化WebViewJavascriptBridge](https://github.com/zhaoyiming0803/into-WebViewJavascriptBridge/blob/master/docs/iOS%E5%88%9D%E5%A7%8B%E5%8C%96WebViewJavascriptBridge.md)》中提到过，Native 执行 [_base injectJavascriptFile] 方法将 WebViewJavascriptBridge_JS 代码注入到 webview 中，所以 window 全局对象上就有了 WebViewJavascriptBridge，即：

``` javascript
window.WebViewJavascriptBridge = {
  callHandler,
  registerHandler,
  // ... 其他方法
};
```

所以看下 WebViewJavascriptBridge_JS.m 文件，找到 callHandler 方法：

``` javascript
function callHandler(handlerName, data, responseCallback) {
  // 参数重载，data可传可不传
  if (arguments.length == 2 && typeof data == 'function') {
    responseCallback = data;
    data = null;
  }
  //  执行 _doSend 方法
  _doSend({ handlerName:handlerName, data:data }, responseCallback);
}
```

看下 _doSend 方法做了哪些事情：

``` javascript
function _doSend(message, responseCallback) {
  // responseCallback 也是可选的，有这样的场景：
  // 前端 call Native 方法之后，并不需要 Native 回应，也就是单向通信
  if (responseCallback) {
    // 前端 call 时，callbackId 的组成：cb前缀、uniqueId、时间戳
    var callbackId = 'cb_'+(uniqueId++)+'_'+new Date().getTime();
    // responseCallbacks 对象保存 callbackId 对应的responseCallback
    responseCallbacks[callbackId] = responseCallback;
    // 给 message 添加 callbackId属性，值为 calbackId
    message['callbackId'] = callbackId;
  }
  // 将此次 message 放到 sendMessageQueue 队列中
  sendMessageQueue.push(message);
  // Native 接收前端消息的核心：改变 iframe 的 src 属性，Native 会拦截到
  // Native 判断 scheme 是否是与前端约定好的，做出具体处理
  messagingIframe.src = CUSTOM_PROTOCOL_SCHEME + '://' + QUEUE_HAS_MESSAGE;
}
```

好了，Native 注册好了方法，前端也调用了，这时候，Native 会拦截到 URL 请求，看代码：

``` objc
- (void)webView:(WebView *)webView decidePolicyForNavigationAction:(NSDictionary *)actionInformation request:(NSURLRequest *)request frame:(WebFrame *)frame decisionListener:(id<WebPolicyDecisionListener>)listener {
    if (webView != _webView) { return; }
    
    NSURL *url = [request URL];
    if ([_base isWebViewJavascriptBridgeURL:url]) {
        if ([_base isBridgeLoadedURL:url]) {
            [_base injectJavascriptFile];
        } else if ([_base isQueueMessageURL:url]) {
          // Native 拦截到了前端 call 来的消息
            NSString *messageQueueString = [self _evaluateJavascript:[_base webViewJavascriptFetchQueyCommand]];
            [_base flushMessageQueue:messageQueueString];
        } else {
            [_base logUnkownMessage:url];
        }
        [listener ignore];
    } else if (_webViewDelegate && [_webViewDelegate respondsToSelector:@selector
      // ... 省略
    } else {
      // ... 省略
    }
}
```

上面的代码，之前笔记有学习过，现在主要关注Native 拦截到了前端 call 来的消息，即：

``` objc
// 执行 _evaluateJavascript 方法
NSString *messageQueueString = [self _evaluateJavascript:[_base webViewJavascriptFetchQueyCommand]];

[_base flushMessageQueue:messageQueueString];
```

首先获取到 "WebViewJavascriptBridge._fetchQueue();" 这个字符串

[_base webViewJavascriptFetchQueyCommand]:

``` objc
- (NSString *)webViewJavascriptFetchQueyCommand {
    return @"WebViewJavascriptBridge._fetchQueue();";
}
```

然后交给 _evaluateJavascript 去处理，其实就是执行 JS 字符串代码

``` objc
- (NSString*) _evaluateJavascript:(NSString*)javascriptCommand {
    return [_webView stringByEvaluatingJavaScriptFromString:javascriptCommand];
}
```

接着看下那段 JS 字符串代码，在 WebViewJavascriptBridge_JS.m 文件中找到：

``` javascript
function _fetchQueue() {
  var messageQueueString = JSON.stringify(sendMessageQueue);
  sendMessageQueue = [];
  return messageQueueString;
}
```

sendMessageQueue 是个数组字符串，其元素格式如下：

``` javascript
var callbackId = 'cb_'+(uniqueId++)+'_'+new Date().getTime();
[
  {
    handlerName,
    data,
    callbackId
  }
]
// 别忘了 responseCallbacks 对象保存 callbackId 对应的responseCallback
responseCallbacks[callbackId] = responseCallback;
```

下面将 _fetchQueue 的执行结果 messageQueueString 作为参数传入并执行 [_base flushMessageQueue]：

``` objc 
- (void)flushMessageQueue:(NSString *)messageQueueString{
  // messageQueueString 必须是一个合格的可被解析的字符串数组
    if (messageQueueString == nil || messageQueueString.length == 0) {
        NSLog(@"WebViewJavascriptBridge: WARNING: ObjC got nil while fetching the message queue JSON from webview. This can happen if the WebViewJavascriptBridge JS is not currently present in the webview, e.g if the webview just loaded a new page.");
        return;
    }
    // 将前端的字符串对象解析为数组
    id messages = [self _deserializeMessageJSON:messageQueueString];

    for (WVJBMessage* message in messages) {
      // 数组元素的每一项 message 必须是合格的字典结构
        if (![message isKindOfClass:[WVJBMessage class]]) {
            NSLog(@"WebViewJavascriptBridge: WARNING: Invalid %@ received: %@", [message class], message);
            continue;
        }
        [self _log:@"RCVD" json:message];
        
        NSString* responseId = message[@"responseId"];
        // 前端主动 call Native 方法，暂时没有 responseId，直接走 else 分支
        if (responseId) {
            WVJBResponseCallback responseCallback = _responseCallbacks[responseId];
            responseCallback(message[@"responseData"]);
            [self.responseCallbacks removeObjectForKey:responseId];
        } else {
            // responseCallback 是一个 block
            WVJBResponseCallback responseCallback = NULL;
            NSString* callbackId = message[@"callbackId"];
            if (callbackId) {
                // responseCallback
                responseCallback = ^(id responseData) {
                    if (responseData == nil) {
                        responseData = [NSNull null];
                    }
                    
                    WVJBMessage* msg = @{ @"responseId":callbackId, @"responseData":responseData };
                    [self _queueMessage:msg];
                };
            } else {
                responseCallback = ^(id ignoreResponseData) {
                    // Do nothing
                };
            }
            
            // 还记得吗？Native 注册方法时，执行了：
            // _base.messageHandlers[handlerName] = [handler copy];
            // 现在要根据与前端约定好的 handlerName 取出对应的 handler
            WVJBHandler handler = self.messageHandlers[message[@"handlerName"]];
            
            if (!handler) {
              // 走到这里，说明前端调用了Native未注册的方法
                NSLog(@"WVJBNoHandlerException, No handler for message from JS: %@", message);
                continue;
            }
            // 传入对应的参数，执行 handler
            // 也就是说，Native 收到了前端 call 来的消息，要执行自己的逻辑了
            handler(message[@"data"], responseCallback);
        }
    }
}
```

上面代码的 handler 就是Native注册的方法：

``` objc
self.bridge registerHandler:@"login" handler:^(id data, WVJBResponseCallback responseCallback) {
  NSString *response = @"this is a responsive message from native";
  // 这里的 responseCallback 就是 上面代码判断 responseId 不存在时定义的 block
  // 将需要返回给前端的参数 response 传入 
  responseCallback(response);
}];
```

那么 responseCallback 做了什么呢？再 copy 下代码，方便查看：

``` objc
responseCallback = ^(id responseData) {
    if (responseData == nil) {
      // responseData 不存在的时候返回空
        responseData = [NSNull null];
    }
    
    // 重新组装下 msg，执行 self(base) 的 _queueMessage 方法
    WVJBMessage* msg = @{ @"responseId":callbackId, @"responseData":responseData };
    [self _queueMessage:msg];
};
```

``` objc
- (void)_queueMessage:(WVJBMessage*)message {
  // WKWebview 初始化完成，执行 injectJavascriptFile 时已将startupMessageQueue 置为 nil
  // self.startupMessageQueue = nil;
    if (self.startupMessageQueue) {
        [self.startupMessageQueue addObject:message];
    } else {
        [self _dispatchMessage:message];
    }
}
```

下面具体看 _dispatchMessage 的逻辑，别忘了 msg 的结构：

``` objc
WVJBMessage* msg = @{ @"responseId":callbackId, @"responseData":responseData };
```

``` objc
- (void)_dispatchMessage:(WVJBMessage*)message {
    // 将字段转为字符串
    NSString *messageJSON = [self _serializeMessage:message pretty:NO];
    [self _log:@"SEND" json:messageJSON];

    // 省略一系列的转义代码..
    
    // 使用 stringWithFormat 方法拼接字符串
    // 最后执行的js代码相当于：WebViewJavascriptBridge._handleMessageFromObjC(message)
    NSString* javascriptCommand = [NSString stringWithFormat:@"WebViewJavascriptBridge._handleMessageFromObjC('%@');", messageJSON];
    if ([[NSThread currentThread] isMainThread]) {
        [self _evaluateJavascript:javascriptCommand];

    } else {
        dispatch_sync(dispatch_get_main_queue(), ^{
            [self _evaluateJavascript:javascriptCommand];
        });
    }
}
```

在 WebViewJavascriptBridge_JS.m 文件中找到 _handleMessageFromObjC 方法：

``` javascript
function _handleMessageFromObjC(messageJSON) {
  // _handleMessageFromObjC 做了个中转，实际是执行 _dispatchMessageFromObjC 方法
    _dispatchMessageFromObjC(messageJSON);
}
```

到这里，说明『Native 正式把控制权交给 JS 了』，执行 _dispatchMessageFromObjC 方法：

``` javascript
function _dispatchMessageFromObjC(messageJSON) {
		if (dispatchMessagesWithTimeoutSafety) {
			setTimeout(_doDispatchMessageFromObjC);
		} else {
			 _doDispatchMessageFromObjC();
		}
		
		function _doDispatchMessageFromObjC() {
      // 转成 JS 熟悉的 JSON
			var message = JSON.parse(messageJSON);
			var messageHandler;
			var responseCallback;

      // 当前 messageJSON 中存在 responseId
      // 再把 msg 结构 copy 过来：
      // WVJBMessage* msg = @{ @"responseId":callbackId, @"responseData":responseData };
			if (message.responseId) {
        // 还记得吗？前端 call Native 方法的时候，执行了 _doSend 方法
        // 使用responseCallbacks 对象保存 callbackId 对应的responseCallback
        // responseCallbacks[callbackId] = responseCallback;
        // 现在根据 responId ，也就是当时的 callbackId 取出 callback 执行
        // 即：Native 的逻辑走完了，要开始自己的回调了
				responseCallback = responseCallbacks[message.responseId];
				if (!responseCallback) {
					return;
        }
        // 这个 responseCallback 就是我们 call 时写的 callback，现在传入 message.responseData执行
        responseCallback(message.responseData);
        // 调用完成后，删除 callback 引用
				delete responseCallbacks[message.responseId];
			} else {
				// ... 省略当前用不到的代码...
			}
		}
	}
```

下节笔记：《[iOS主动调用JavaScript方法](https://github.com/zhaoyiming0803/into-WebViewJavascriptBridge/blob/master/docs/iOS%E4%B8%BB%E5%8A%A8%E8%B0%83%E7%94%A8JavaScript%E6%96%B9%E6%B3%95.md)》

![JS调用Native流程图](https://github.com/zhaoyiming0803/into-WebViewJavascriptBridge/blob/master/docs/images/JS%E8%B0%83%E7%94%A8Native%E6%B5%81%E7%A8%8B%E5%9B%BE.png)