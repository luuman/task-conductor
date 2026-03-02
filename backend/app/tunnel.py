# backend/app/tunnel.py
import asyncio
import re
import subprocess
import sys
from typing import Optional

_tunnel_url: Optional[str] = None
_tunnel_proc = None

def get_tunnel_url() -> Optional[str]:
    return _tunnel_url

async def start_cloudflare_tunnel(port: int = 8000) -> Optional[str]:
    """启动 cloudflared，解析公网 URL，返回 URL（失败返回 None）"""
    global _tunnel_url, _tunnel_proc
    try:
        proc = await asyncio.create_subprocess_exec(
            "cloudflared", "tunnel", "--url", f"http://localhost:{port}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        _tunnel_proc = proc

        # 从输出中解析 trycloudflare.com URL
        url_pattern = re.compile(r"https://[a-z0-9\-]+\.trycloudflare\.com")
        async for line_bytes in proc.stdout:
            line = line_bytes.decode("utf-8", errors="replace")
            match = url_pattern.search(line)
            if match:
                _tunnel_url = match.group(0)
                return _tunnel_url
    except FileNotFoundError:
        print("[Tunnel] cloudflared not found, skipping tunnel", file=sys.stderr)
    except Exception as e:
        print(f"[Tunnel] error: {e}", file=sys.stderr)
    return None

def stop_tunnel():
    global _tunnel_proc, _tunnel_url
    if _tunnel_proc:
        _tunnel_proc.terminate()
        _tunnel_proc = None
    _tunnel_url = None
