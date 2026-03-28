"""Tests for backend/app/sync/crypto.py"""
import pytest
from app.sync.crypto import (
    new_salt,
    derive_master_key,
    derive_file_key,
    encrypt_bytes,
    decrypt_bytes,
)


def test_derive_master_key_deterministic():
    """相同 password + salt 每次得到相同 master_key"""
    salt = new_salt()
    k1 = derive_master_key("password", salt)
    k2 = derive_master_key("password", salt)
    assert k1 == k2
    assert len(k1) == 32


def test_derive_master_key_different_passwords():
    """不同 password 产生不同 master_key"""
    salt = new_salt()
    k1 = derive_master_key("password1", salt)
    k2 = derive_master_key("password2", salt)
    assert k1 != k2


def test_derive_file_key_different_paths():
    """相同 master_key 但不同文件路径产生不同 file_key"""
    master_key = derive_master_key("password", new_salt())
    fk1 = derive_file_key(master_key, "encrypted/abc.jsonl.enc")
    fk2 = derive_file_key(master_key, "encrypted/def.jsonl.enc")
    assert fk1 != fk2
    assert len(fk1) == 32


def test_encrypt_decrypt_roundtrip():
    """加密后解密得到原始数据"""
    master_key = derive_master_key("test_password", new_salt())
    file_key = derive_file_key(master_key, "encrypted/session1.jsonl.enc")
    plaintext = b'{"role": "user", "content": "hello"}\n'
    ciphertext = encrypt_bytes(file_key, plaintext)
    assert ciphertext != plaintext
    # 格式：nonce(12B) + ciphertext + tag(16B)
    assert len(ciphertext) > 12 + 16
    recovered = decrypt_bytes(file_key, ciphertext)
    assert recovered == plaintext


def test_decrypt_wrong_key_raises():
    """用错误 key 解密应抛出异常"""
    master_key = derive_master_key("right_password", new_salt())
    file_key = derive_file_key(master_key, "encrypted/session1.jsonl.enc")
    wrong_master_key = derive_master_key("wrong_password", new_salt())
    wrong_file_key = derive_file_key(wrong_master_key, "encrypted/session1.jsonl.enc")
    plaintext = b"secret data"
    ciphertext = encrypt_bytes(file_key, plaintext)
    with pytest.raises(Exception):
        decrypt_bytes(wrong_file_key, ciphertext)
