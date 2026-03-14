use serde::{Deserialize, Serialize};

/// 统一的 AI 流事件格式，provider-agnostic
/// 适用于 Claude（现阶段）和未来其他 AI Provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiStreamEvent {
    /// 事件类型："tool_call" | "chunk" | "done" | "session_update" | "log"
    pub event_type: String,
    /// AI Provider："claude" | "openai"（预留）
    pub provider: String,
    /// 会话 ID
    pub session_id: String,
    /// 事件负载（JSON 原始值，根据 event_type 解释）
    pub payload: serde_json::Value,
    /// ISO 8601 时间戳
    pub ts: String,
}

impl AiStreamEvent {
    /// 从 JSON 字符串解析事件
    pub fn from_str(s: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(s)
    }

    /// 序列化为 JSON 字符串
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_event() {
        let json = r#"{
            "event_type": "tool_call",
            "provider": "claude",
            "session_id": "sess-123",
            "payload": {"tool": "bash", "input": "ls"},
            "ts": "2026-03-13T00:00:00Z"
        }"#;

        let event = AiStreamEvent::from_str(json).unwrap();
        assert_eq!(event.event_type, "tool_call");
        assert_eq!(event.provider, "claude");
        assert_eq!(event.session_id, "sess-123");
    }

    #[test]
    fn test_serialize_roundtrip() {
        let event = AiStreamEvent {
            event_type: "chunk".to_string(),
            provider: "claude".to_string(),
            session_id: "sess-456".to_string(),
            payload: serde_json::json!({"text": "hello"}),
            ts: "2026-03-13T00:00:00Z".to_string(),
        };

        let json = event.to_json().unwrap();
        let restored = AiStreamEvent::from_str(&json).unwrap();
        assert_eq!(restored.event_type, event.event_type);
        assert_eq!(restored.session_id, event.session_id);
    }
}
