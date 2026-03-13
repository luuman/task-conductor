//! WASM 导出层：供 Web Worker 中的 JavaScript 调用

use crate::transport::browser::BrowserTransport;
use js_sys::Function;
use wasm_bindgen::prelude::*;

/// 浏览器 WebSocket 句柄，暴露给 JavaScript
#[wasm_bindgen]
pub struct WsHandle {
    transport: BrowserTransport,
}

#[wasm_bindgen]
impl WsHandle {
    /// 创建新的 WebSocket 连接
    ///
    /// # Arguments
    /// - `url`: WebSocket 服务器地址
    /// - `on_message_cb`: 收到消息时调用，参数为 AiStreamEvent JSON 字符串
    /// - `on_close_cb`: 连接关闭时调用，参数为关闭码（number）
    #[wasm_bindgen(constructor)]
    pub fn new(
        url: &str,
        on_message_cb: &Function,
        on_close_cb: &Function,
    ) -> Result<WsHandle, JsValue> {
        console_error_panic_hook::set_once();
        let transport = BrowserTransport::new(
            url,
            on_message_cb.clone(),
            on_close_cb.clone(),
        )?;
        Ok(Self { transport })
    }

    /// 发送消息到服务器
    pub fn send(&self, data: &str) -> Result<(), JsValue> {
        self.transport.send(data)
    }

    /// 主动关闭连接
    pub fn close(&self) {
        self.transport.close();
    }

    /// 获取当前 WebSocket readyState
    pub fn ready_state(&self) -> u16 {
        self.transport.ready_state()
    }
}
