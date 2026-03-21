"""
ClaudePool — 基于 claude_code_sdk ClaudeSDKClient 的单例 Claude 调用池。

使用 claude_code_sdk 的持久连接模式。
对外接口保持不变：run() 返回 AsyncIterator[dict]，kill() 中断执行。
"""

import json
import logging
import os
import time
from typing import Optional, AsyncIterator

from .metrics_store import metrics_store

logger = logging.getLogger(__name__)


class ClaudePool:
    _instance: Optional["ClaudePool"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._clients = {}
        return cls._instance

    async def run(
        self,
        task_id: int,
        prompt: str,
        worktree_path: str,
        log_file: str,
    ) -> AsyncIterator[dict]:
        """启动 ClaudeSDKClient 并以异步迭代器方式返回事件流。

        产出的事件 dict 保持与旧 stream-json 格式兼容：
        - {"type": "assistant", "message": {"content": [...]}}
        - {"type": "result", "result": "...", ...}
        - 原始 Anthropic API 流式事件 (content_block_delta 等)
        """
        from claude_code_sdk import (
            ClaudeSDKClient,
            ClaudeCodeOptions,
            AssistantMessage,
            ResultMessage,
        )
        from claude_code_sdk.types import StreamEvent

        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        metric = metrics_store.start_call(task_id)

        opts = ClaudeCodeOptions(
            permission_mode="bypassPermissions",
            include_partial_messages=True,
            cwd=worktree_path,
        )

        client = ClaudeSDKClient(opts)
        self._clients[task_id] = client

        try:
            await client.connect()
            await client.query(prompt)

            with open(log_file, "w") as f:
                async for msg in client.receive_response():

                    # ── StreamEvent: 原始 Anthropic API 流式事件 ──
                    if isinstance(msg, StreamEvent):
                        evt = msg.event
                        f.write(json.dumps(evt, ensure_ascii=False) + "\n")

                        # 追踪 TTFT 和字符数
                        evt_type = evt.get("type", "")
                        if evt_type == "content_block_delta":
                            delta = evt.get("delta", {})
                            if delta.get("type") == "text_delta":
                                text = delta.get("text", "")
                                if text:
                                    if metric.ttft is None:
                                        metric.ttft = time.time() - metric.started_at
                                    metric.char_count += len(text)

                        yield evt

                    # ── AssistantMessage: 完整助手消息 ──
                    elif isinstance(msg, AssistantMessage):
                        content_blocks = []
                        for block in msg.content:
                            if hasattr(block, "text"):
                                content_blocks.append(
                                    {"type": "text", "text": block.text}
                                )
                        event = {
                            "type": "assistant",
                            "message": {"content": content_blocks},
                        }
                        f.write(json.dumps(event, ensure_ascii=False) + "\n")
                        yield event

                    # ── ResultMessage: 最终结果（含 cost / usage）──
                    elif isinstance(msg, ResultMessage):
                        event = {
                            "type": "result",
                            "result": msg.result or "",
                            "cost_usd": msg.total_cost_usd,
                            "duration_ms": msg.duration_ms,
                            "session_id": msg.session_id,
                            "is_error": msg.is_error,
                        }
                        f.write(json.dumps(event, ensure_ascii=False) + "\n")
                        metric.success = not msg.is_error
                        yield event

            # 如果没有 ResultMessage，默认成功
            if metric.success is None:
                metric.success = True

        except Exception:
            metric.success = False
            raise
        finally:
            metrics_store.finish_call(metric)
            try:
                await client.disconnect()
            except Exception:
                logger.debug("ClaudeSDKClient disconnect error (ignored)")
            self._clients.pop(task_id, None)

    def kill(self, task_id: int):
        """中断指定任务的 Claude 执行"""
        client = self._clients.get(task_id)
        if client:
            try:
                client.interrupt()
            except Exception:
                logger.warning(f"Failed to interrupt task {task_id}")
