"""Tests for backend/app/sync/manifest.py"""
import json
from pathlib import Path

import pytest

from app.sync.crypto import derive_master_key, new_salt
from app.sync.manifest import load_manifest, save_manifest


@pytest.fixture
def master_key():
    return derive_master_key("test_password", new_salt())


def test_load_manifest_empty_when_file_missing(tmp_path, master_key):
    """文件不存在时返回空列表。"""
    result = load_manifest(tmp_path, master_key)
    assert result == []


def test_save_and_load_manifest_roundtrip(tmp_path, master_key):
    """保存后读取得到相同数据。"""
    entries = [
        {"session_id": "s1", "enc_path": "encrypted/s1.jsonl.enc", "content_hash": "abc123"},
        {"session_id": "s2", "enc_path": "encrypted/s2.jsonl.enc", "content_hash": "def456"},
    ]
    save_manifest(tmp_path, master_key, entries)
    assert (tmp_path / "manifest.json.enc").exists()

    loaded = load_manifest(tmp_path, master_key)
    assert loaded == entries


def test_manifest_is_encrypted(tmp_path, master_key):
    """manifest.json.enc 文件内容不是明文 JSON。"""
    entries = [{"session_id": "s1"}]
    save_manifest(tmp_path, master_key, entries)
    raw = (tmp_path / "manifest.json.enc").read_bytes()
    # 加密后不应直接可解析为 JSON
    with pytest.raises(Exception):
        json.loads(raw)
