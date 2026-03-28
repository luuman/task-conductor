"""
manifest.json.enc 读写。

manifest 是加密的 JSON 数组，每个元素描述一个已备份会话：
  {session_id, enc_path, content_hash, backed_up_at}
"""
from __future__ import annotations

import json
from pathlib import Path

from .crypto import derive_file_key, encrypt_bytes, decrypt_bytes

_MANIFEST_PATH = "manifest.json.enc"
_MANIFEST_INFO = _MANIFEST_PATH  # HKDF info


def load_manifest(repo_path: Path, master_key: bytes) -> list[dict]:
    """
    从 repo_path/manifest.json.enc 读取并解密 manifest。
    文件不存在时返回空列表。
    """
    manifest_file = repo_path / _MANIFEST_PATH
    if not manifest_file.exists():
        return []
    file_key = derive_file_key(master_key, _MANIFEST_INFO)
    ciphertext = manifest_file.read_bytes()
    plaintext = decrypt_bytes(file_key, ciphertext)
    return json.loads(plaintext.decode("utf-8"))


def save_manifest(repo_path: Path, master_key: bytes, entries: list[dict]) -> None:
    """
    将 entries 加密后写入 repo_path/manifest.json.enc。
    """
    file_key = derive_file_key(master_key, _MANIFEST_INFO)
    plaintext = json.dumps(entries, ensure_ascii=False).encode("utf-8")
    ciphertext = encrypt_bytes(file_key, plaintext)
    manifest_file = repo_path / _MANIFEST_PATH
    manifest_file.write_bytes(ciphertext)
