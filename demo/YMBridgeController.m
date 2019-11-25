//
//  YMBridgeController.m
//  TestWebViewJavascriptBridge
//
//  Created by 赵一鸣 on 2019/11/25.
//  Copyright © 2019 zhaoyiming. All rights reserved.
//  以下代码仅供参考

#import "YMBridgeController.h"
#import "WebViewJavascriptBridge.h"

@interface YMBridgeController ()<WKNavigationDelegate, WKUIDelegate>

@property(nonatomic, strong, readwrite) WKWebView *webview;
@property(nonatomic, strong, readwrite) WebViewJavascriptBridge *bridge;

@end

@implementation YMBridgeController

- (void)viewDidLoad {
    [super viewDidLoad];

    self.view.backgroundColor = [UIColor whiteColor];

    WKWebView *webview = [[WKWebView alloc] initWithFrame:CGRectMake(0, 0, self.view.frame.size.width, self.view.frame.size.height)];
    self.webview = webview;

    [self setupJsBridge];

    NSString *url = [NSString stringWithFormat:@"https://web.0351zhuangxiu.com/tour/home"];
    [self.webview loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:url]]];

    self.webview.navigationDelegate = self;
    self.webview.UIDelegate = self;

    [self.view addSubview:self.webview];
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    NSLog(@"页面加载完毕了，可以关闭loading了");
}

 - (void)setupJsBridge {
    if (self.bridge) {
      return;
    }

    self.bridge = [WebViewJavascriptBridge bridgeForWebView:self.webview];

    [self.bridge registerHandler:@"login" handler:^(id data, WVJBResponseCallback responseCallback) {
      [self.bridge callHandler:@"event-from-native" data:@"event from native" responseCallback:^(id responseData) {
          NSLog(@"message from h5: %@", responseData);
      }];
      
      NSString *response = @"this is a responsive message from native";
      responseCallback(response);
    }];
};

@end
