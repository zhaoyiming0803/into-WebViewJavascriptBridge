/**
 * init WebViewJavascriptBridge
 * iOS: https://github.com/marcuswestin/WebViewJavascriptBridge
 * Android: https://github.com/lzyzsd/JsBridge
 * 以下代码仅供参考
 * @author zhaoyiming
 * @since  2019/11/14
 */

const u = window.navigator.userAgent;
const isAndroid = u.indexOf('Android') > -1 || u.indexOf('Adr') > -1;
const isiOS = !!u.match(/\(i[^;]+;( U;)? CPU.+Mac OS X/);

if (isAndroid) {
  initAndroidBridge(bridge => {
    bridge.init((message, responseCallback) => {
      responseCallback();
    });
    // 如果是页面初始化完成后需要立即调用原生的方法
    // 那么需要在对应的页面先订阅『页面初始化完成的消息』
    // 然后在这里主动触发
    // 例如 Vue 的 EventBus 等。
  });
}

function initAndroidBridge(callback) {
  if (window.WebViewJavascriptBridge) {
    callback(window.WebViewJavascriptBridge);
  } else {
    document.addEventListener('WebViewJavascriptBridgeReady', () => {
      callback(window.WebViewJavascriptBridge);
    }, false);
  }
}

function initIOSBridge(callback) {
  if (window.WebViewJavascriptBridge) {
    return callback(window.WebViewJavascriptBridge);
  }

  if (window.WVJBCallbacks) {
    return window.WVJBCallbacks.push(callback);
  }

  window.WVJBCallbacks = [callback];

  const WVJBIframe = document.createElement('iframe');
  WVJBIframe.style.display = 'none';
  WVJBIframe.src = 'https://__bridge_loaded__';
  document.documentElement.appendChild(WVJBIframe);
  setTimeout(() => {
    document.documentElement.removeChild(WVJBIframe);
  }, 0);
}

const call = (function () {
  if (isiOS) {
    return function (name, data, callback) {
      initIOSBridge(bridge => bridge.callHandler(name, data, callback));
    }
  }
  return function (name, data, callback) {
    window.WebViewJavascriptBridge.callHandler(name, data, callback);
  }
})();

const register = (function () {
  if (isiOS) {
    return function (name, callback) {
      initIOSBridge(bridge => bridge.registerHandler(name, callback));
    }
  }
  return function (name, callback) {
    window.WebViewJavascriptBridge.registerHandler(name, callback);
  }
})();

export default {
  call,
  register
}