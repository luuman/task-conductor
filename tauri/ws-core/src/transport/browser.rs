use crate::manager::parse_message;
use js_sys::Function;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{CloseEvent, ErrorEvent, MessageEvent, WebSocket};

/// 浏览器 WebSocket 包装
/// 使用 web-sys 调用浏览器原生 WebSocket API
/// 消息通过 js_sys::Function 回调传递，避免 trait object 的 WASM 兼容问题
pub struct BrowserTransport {
    ws: WebSocket,
    // 保持 Closure 存活，防止被 GC
    _on_message: Closure<dyn FnMut(MessageEvent)>,
    _on_close: Closure<dyn FnMut(CloseEvent)>,
    _on_error: Closure<dyn FnMut(ErrorEvent)>,
}

impl BrowserTransport {
    /// 建立 WebSocket 连接
    /// on_message_cb: JS 函数，接收序列化后的 AiStreamEvent JSON 字符串
    /// on_close_cb: JS 函数，连接关闭时调用，参数为关闭码
    pub fn new(
        url: &str,
        on_message_cb: Function,
        on_close_cb: Function,
    ) -> Result<Self, JsValue> {
        let ws = WebSocket::new(url)?;
        ws.set_binary_type(web_sys::BinaryType::Arraybuffer);

        // 消息处理
        let on_message = {
            let cb = on_message_cb.clone();
            Closure::wrap(Box::new(move |e: MessageEvent| {
                if let Some(txt) = e.data().as_string() {
                    if let Ok(event) = parse_message(&txt) {
                        if let Ok(json) = event.to_json() {
                            let _ = cb.call1(&JsValue::NULL, &JsValue::from_str(&json));
                        }
                    }
                }
            }) as Box<dyn FnMut(MessageEvent)>)
        };

        // 关闭处理
        let on_close = {
            let cb = on_close_cb.clone();
            Closure::wrap(Box::new(move |e: CloseEvent| {
                let _ = cb.call1(&JsValue::NULL, &JsValue::from_f64(e.code() as f64));
            }) as Box<dyn FnMut(CloseEvent)>)
        };

        // 错误处理
        let on_error = Closure::wrap(Box::new(move |_e: ErrorEvent| {
            web_sys::console::error_1(&JsValue::from_str("ws-core: WebSocket error"));
        }) as Box<dyn FnMut(ErrorEvent)>);

        ws.set_onmessage(Some(on_message.as_ref().unchecked_ref()));
        ws.set_onclose(Some(on_close.as_ref().unchecked_ref()));
        ws.set_onerror(Some(on_error.as_ref().unchecked_ref()));

        Ok(Self {
            ws,
            _on_message: on_message,
            _on_close: on_close,
            _on_error: on_error,
        })
    }

    /// 发送消息
    pub fn send(&self, data: &str) -> Result<(), JsValue> {
        self.ws.send_with_str(data)
    }

    /// 关闭连接
    pub fn close(&self) {
        let _ = self.ws.close();
    }

    /// 获取连接状态（0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED）
    pub fn ready_state(&self) -> u16 {
        self.ws.ready_state()
    }
}
