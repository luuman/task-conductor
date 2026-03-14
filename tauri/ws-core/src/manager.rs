use crate::message::AiStreamEvent;

/// WebSocket 连接状态
#[derive(Debug, Clone, PartialEq)]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting { attempt: u32 },
}

/// 重连配置
pub struct ReconnectConfig {
    /// 初始延迟（毫秒）
    pub initial_delay_ms: u64,
    /// 最大延迟（毫秒）
    pub max_delay_ms: u64,
    /// 最大重试次数（None = 无限）
    pub max_attempts: Option<u32>,
}

impl Default for ReconnectConfig {
    fn default() -> Self {
        Self {
            initial_delay_ms: 500,
            max_delay_ms: 30_000,
            max_attempts: None,
        }
    }
}

/// 计算下次重连延迟（指数退避）
pub fn reconnect_delay_ms(attempt: u32, config: &ReconnectConfig) -> u64 {
    let delay = config.initial_delay_ms * 2u64.pow(attempt.min(10));
    delay.min(config.max_delay_ms)
}

/// 解析原始消息字符串，返回 AiStreamEvent 或错误字符串
pub fn parse_message(raw: &str) -> Result<AiStreamEvent, String> {
    AiStreamEvent::from_str(raw).map_err(|e| format!("parse error: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reconnect_delay_exponential_backoff() {
        let cfg = ReconnectConfig::default();
        assert_eq!(reconnect_delay_ms(0, &cfg), 500);   // 500 * 2^0 = 500
        assert_eq!(reconnect_delay_ms(1, &cfg), 1000);  // 500 * 2^1 = 1000
        assert_eq!(reconnect_delay_ms(2, &cfg), 2000);  // 500 * 2^2 = 2000
        assert_eq!(reconnect_delay_ms(3, &cfg), 4000);
    }

    #[test]
    fn test_reconnect_delay_capped_at_max() {
        let cfg = ReconnectConfig::default();
        // 大 attempt 值应该被 cap 在 max_delay_ms
        assert_eq!(reconnect_delay_ms(20, &cfg), 30_000);
    }

    #[test]
    fn test_parse_valid_message() {
        let raw = r#"{"event_type":"chunk","provider":"claude","session_id":"s1","payload":{},"ts":"2026-01-01T00:00:00Z"}"#;
        assert!(parse_message(raw).is_ok());
    }

    #[test]
    fn test_parse_invalid_message() {
        assert!(parse_message("not json").is_err());
    }
}
