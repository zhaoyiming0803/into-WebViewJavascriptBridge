Native 主动调用 JS，首先 JS 要注册好对应的方法，所以本节笔记从 JS 使用 register 注册方法开始，然后 Native 再使用 call 调用 JS 注册好的方法。

``` javascript
window.WebViewJavascriptBridge.registerHandler(handlerName, callback)
```

registerHandler 方法在 WebViewJavascriptBridge_JS.m 文件中：

``` javascript
function registerHandler(handlerName, handler) {
  // 与 Native 注册方法一模一样
  // 给 messageHandlers 对象赋值
  // handlerName 作为键名
  // handler 拷贝作为键值
  messageHandlers[handlerName] = handler;
}
```

注册完成，Native 可以调用了：

``` objc
[self.bridge callHandler:@"handlerName" data:@"event from native" responseCallback:^(id responseData) {
    NSLog(@"message from JavaScript: %@", responseData);
}];
```
在 WKWebViewJavascriptBridge.m 中找到 callHandler 方法：

``` objc
- (void)callHandler:(NSString *)handlerName {
    [self callHandler:handlerName data:nil responseCallback:nil];
}

- (void)callHandler:(NSString *)handlerName data:(id)data {
    [self callHandler:handlerName data:data responseCallback:nil];
}

- (void)callHandler:(NSString *)handlerName data:(id)data responseCallback:(WVJBResponseCallback)responseCallback {
    [_base sendData:data responseCallback:responseCallback handlerName:handlerName];
}
```

作为示例，我们传入全部的三个参数：handlerName、data 和 responseCallback，也就是执行上面第三个方法：

``` objc
 [_base sendData:data responseCallback:responseCallback handlerName:handlerName];
```

在 WebViewJavascriptBridgeBase.m 文件中找到对应的方法：

``` objc
- (void)sendData:(id)data responseCallback:(WVJBResponseCallback)responseCallback handlerName:(NSString*)handlerName {
    // 定义一个 message 字典
    NSMutableDictionary* message = [NSMutableDictionary dictionary];
    
    // 给 message 字典赋值 data
    if (data) {
        message[@"data"] = data;
    }
    
    if (responseCallback) {
        // 这个与 JS call Native 方法一样了
        // 拼接好唯一的 callbackId
        // 将 responseCallback 放入 responseCallbacks 字典中
        NSString* callbackId = [NSString stringWithFormat:@"objc_cb_%ld", ++_uniqueId];
        self.responseCallbacks[callbackId] = [responseCallback copy];
        message[@"callbackId"] = callbackId;
    }
    
    if (handlerName) {
        // message 字典添加 handlerName
        message[@"handlerName"] = handlerName;
    }

    // 将组装好的 message 传入 _queueMessage 方法并执行
    [self _queueMessage:message];
}
```

先记住 message 字典的结构：

``` objc
NSMutableDictionary* message = {
  @"data": data, // 如果有 data 的话
  @"callbackId": @"objc_cb_唯一的uniqueId",
  @"handlerName": handlerName
};
```

另外在 responseCallbacks 字典中也添加了 callbackId，其值为 responseCallback 的拷贝。

``` objc
self.responseCallbacks[callbackId] = [responseCallback copy];
```

下面具体看下 _queueMessage 方法，

``` objc
- (void)_queueMessage:(WVJBMessage*)message {
    if (self.startupMessageQueue) {
        [self.startupMessageQueue addObject:message];
    } else {
        [self _dispatchMessage:message];
    }
}
```
_dispatchMessage 方法：

``` objc
- (void)_dispatchMessage:(WVJBMessage*)message {
    // 将 message 字典转成对象字符串
    NSString *messageJSON = [self _serializeMessage:message pretty:NO];
    [self _log:@"SEND" json:messageJSON];
    // ... 省略一系列转义代码
    
    // 和 JS 调用 Native 一样，获取到可执行的 javascriptCommand
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

WebViewJavascriptBridge._handleMessageFromObjC 方法：

还记得 message 的结构吗？

``` objc
NSMutableDictionary* message = {
  @"data": data, // 如果有 data 的话
  @"callbackId": @"objc_cb_唯一的uniqueId",
  @"handlerName": handlerName
};
```

将 message 转为字符串后传入 _dispatchMessageFromObjC 执行

``` javascript
function _dispatchMessageFromObjC(messageJSON) {
  if (dispatchMessagesWithTimeoutSafety) {
    setTimeout(_doDispatchMessageFromObjC);
  } else {
      _doDispatchMessageFromObjC();
  }
  
  function _doDispatchMessageFromObjC() {
    var message = JSON.parse(messageJSON);
    var messageHandler;
    var responseCallback;

    if (message.responseId) {
      responseCallback = responseCallbacks[message.responseId];
      if (!responseCallback) {
        return;
      }
      responseCallback(message.responseData);
      delete responseCallbacks[message.responseId];
    } else { // 看到 message 的结构，此时依然走这个 else 分支
      if (message.callbackId) {
        var callbackResponseId = message.callbackId;
        responseCallback = function(responseData) {
          _doSend({ handlerName:message.handlerName, responseId:callbackResponseId, responseData:responseData });
        };
      }
      
      // JS 注册方法时，messageHandlers[handlerName] = handler;
      // 这里根据 handlerName 取出来用
      var handler = messageHandlers[message.handlerName];
      if (!handler) {
        console.log("WebViewJavascriptBridge: WARNING: no handler for message from ObjC:", message);
      } else {
        // 执行 handler
        handler(message.data, responseCallback);
      }
    }
  }
}
```

handler 就是 JS 注册的方法的回调：

``` javascript
window.WebViewJavascriptBridge.registerHandler(handlerName, function handler (data, responseCallback) {
  // ... 走完 JS 逻辑之后，要回调 Native call JS 方法的第二个或第三个参数，也就是 Native 的 callback，即：
  var dataFromJs = {
    name: 'zhaoyiming',
    age: 18
  };
  responseCallback(dataFromJs);

  // - (void)callHandler:(NSString *)handlerName data:(id)data responseCallback:(WVJBResponseCallback)responseCallback {
  //  [_base sendData:data responseCallback:responseCallback handlerName:handlerName];
  // }
})
```

但是这里有个问题，Native 能直接执行 JS 方法，JS 不能直接执行 Native 的方法。

那么这里的 responseCallback 其实就是上文 else 分支中自定义的 responseCallback：

``` javascript
responseCallback = function(responseData) {
  // 在自定义的 responseCallback 中执行 _doSend 方法，看看做了哪些操作，来达到 JS 『间接』调用 Native 方法的
  _doSend({ handlerName:message.handlerName, responseId:callbackResponseId, responseData:responseData });
};
```

_doSend 方法：

``` javascript
根据上文执行，这里的 message 结构为：
const message = {
  handlerName,
  responseId: callbackResponseId, // 重点在这个地方，这次 responseId 有值了
  responseData
};
function _doSend(message, responseCallback) {
  // 这次 responseCallback 没有传，是 undefined，所以不走 if 语句块内的逻辑
  if (responseCallback) {
    var callbackId = 'cb_'+(uniqueId++)+'_'+new Date().getTime();
    responseCallbacks[callbackId] = responseCallback;
    message['callbackId'] = callbackId;
  }

  // 还记得 sendMessageQueue 的作用吗？上一节笔记学习 JS 调用 Native 方法时有用到
  // 它是个数组，可以存放很多的 message
  sendMessageQueue.push(message);

  // *** 重点在这里 ***
  // 前端修改 iframe 的 src 属性值，主动触发 Native 拦截（JS 调用 Native 方法的过程）
  // 然后 Native 就又可以反过来执行 JS 方法了
  messagingIframe.src = CUSTOM_PROTOCOL_SCHEME + '://' + QUEUE_HAS_MESSAGE;
}
```

这时，逻辑又回到 Native 拦截 URL 请求的那个方法中了。其实最终还是 webview 通过 stringByEvaluatingJavaScriptFromString 方法执行 sendMessageQueue 对象字符串。

然后来到 flushMessageQueue 方法（WebViewJavascriptBridgeBase），这个时候 responseId 有值了：

``` objc 
- (void)flushMessageQueue:(NSString *)messageQueueString{
    // ... 省略判断

    id messages = [self _deserializeMessageJSON:messageQueueString];
    for (WVJBMessage* message in messages) {
        // ...省略判断
        
        NSString* responseId = message[@"responseId"];
        if (responseId) {
            // 执行 sendData 方法时，已将 Native 主动调用 JS 方法的回调放入了 responseCallbacks 中
            // self.responseCallbacks[callbackId] = [responseCallback copy];
            // 现在取出来用
            WVJBResponseCallback responseCallback = _responseCallbacks[responseId];
            // responseCallback 执行了，JS 成功间接调用 Native 方法了
            responseCallback(message[@"responseData"]);
            // 调用成功之后，删除多余引用
            [self.responseCallbacks removeObjectForKey:responseId];
        } else {
            // ... 这次走上面的 if 分支，responseId 有值
        }
    }
}
```

至此，Native 主动调用 JS 方法的整个逻辑就走完了。

![Native调用JS流程图](https://github.com/zymfe/into-WebViewJavascriptBridge/blob/master/docs/images/Native%E8%B0%83%E7%94%A8JS%E6%B5%81%E7%A8%8B%E5%9B%BE.png)