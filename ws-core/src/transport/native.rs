use crate::manager::{reconnect_delay_ms, ConnectionState, ReconnectConfig};
use crate::message::AiStreamEvent;
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// 原生 WebSocket 连接句柄
/// 在 tokio 独立任务中运行，不阻塞调用线程
pub struct NativeWsHandle {
    /// 发送消息通道
    tx: mpsc::Sender<String>,
    /// 关闭信号
    close_tx: mpsc::Sender<()>,
    state: Arc<Mutex<ConnectionState>>,
}

impl NativeWsHandle {
    /// 建立连接，消息通过 on_message 回调接收
    /// 自动重连，直到主动 close()
    pub fn connect<F>(url: String, on_message: F, config: ReconnectConfig) -> Self
    where
        F: Fn(AiStreamEvent) + Send + Sync + 'static,
    {
        let (tx, mut rx) = mpsc::channel::<String>(32);
        let (close_tx, mut close_rx) = mpsc::channel::<()>(1);
        let state = Arc::new(Mutex::new(ConnectionState::Connecting));
        let state_clone = state.clone();
        let on_message = Arc::new(on_message);

        tokio::spawn(async move {
            let mut attempt = 0u32;

            loop {
                // 检查是否已请求关闭
                if close_rx.try_recv().is_ok() {
                    break;
                }

                *state_clone.lock().await = ConnectionState::Connecting;

                match connect_async(&url).await {
                    Ok((ws_stream, _)) => {
                        attempt = 0;
                        *state_clone.lock().await = ConnectionState::Connected;
                        log::info!("ws-core native: connected to {url}");

                        let (mut write, mut read) = ws_stream.split();

                        loop {
                            tokio::select! {
                                // 接收后端消息
                                msg = read.next() => {
                                    match msg {
                                        Some(Ok(Message::Text(ref text))) => {
                                            let text = text.to_string();
                                            if let Ok(event) = crate::manager::parse_message(&text) {
                                                on_message(event);
                                            }
                                        }
                                        Some(Ok(Message::Close(_))) | None => {
                                            log::warn!("ws-core native: connection closed");
                                            break;
                                        }
                                        _ => {}
                                    }
                                }
                                // 发送消息到后端
                                Some(data) = rx.recv() => {
                                    let _ = write.send(Message::Text(data)).await;
                                }
                                // 关闭信号
                                _ = close_rx.recv() => {
                                    let _ = write.send(Message::Close(None)).await;
                                    return;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("ws-core native: connect failed: {e}");
                    }
                }

                // 重连延迟
                attempt += 1;
                let delay = reconnect_delay_ms(attempt, &config);
                *state_clone.lock().await = ConnectionState::Reconnecting { attempt };
                log::info!("ws-core native: reconnect in {delay}ms (attempt {attempt})");
                tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
            }
        });

        Self { tx, close_tx, state }
    }

    /// 发送消息到后端
    pub async fn send(&self, data: String) {
        let _ = self.tx.send(data).await;
    }

    /// 主动关闭连接（停止重连）
    pub async fn close(&self) {
        let _ = self.close_tx.send(()).await;
    }

    /// 获取当前连接状态
    pub async fn state(&self) -> ConnectionState {
        self.state.lock().await.clone()
    }
}
