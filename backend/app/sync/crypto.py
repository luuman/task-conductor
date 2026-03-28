"""
AES-256-GCM 加密模块，配合 Argon2id 密钥派生 + HKDF-SHA256 文件密钥派生。

存储格式：nonce(12B) | ciphertext | tag(16B)
"""
import os

from argon2.low_level import hash_secret_raw, Type
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


def new_salt() -> str:
    """生成随机 32 字节 salt，返回 hex 字符串。"""
    return os.urandom(32).hex()


def derive_master_key(
    password: str,
    salt_hex: str,
    time_cost: int = 3,
    memory_kb: int = 65536,
    parallelism: int = 4,
) -> bytes:
    """Argon2id 派生 master_key（32 字节）。"""
    salt = bytes.fromhex(salt_hex)
    return hash_secret_raw(
        secret=password.encode(),
        salt=salt,
        time_cost=time_cost,
        memory_cost=memory_kb,
        parallelism=parallelism,
        hash_len=32,
        type=Type.ID,
    )


def derive_file_key(master_key: bytes, file_rel_path: str) -> bytes:
    """HKDF-SHA256 派生单文件密钥（32 字节）。"""
    hkdf = HKDF(
        algorithm=SHA256(),
        length=32,
        salt=None,
        info=file_rel_path.encode(),
    )
    return hkdf.derive(master_key)


def encrypt_bytes(file_key: bytes, plaintext: bytes) -> bytes:
    """AES-256-GCM 加密，返回 nonce(12B) + ciphertext + tag(16B)。"""
    nonce = os.urandom(12)
    aesgcm = AESGCM(file_key)
    # AESGCM.encrypt 返回 ciphertext+tag（tag 已附在末尾）
    ct_with_tag = aesgcm.encrypt(nonce, plaintext, None)
    return nonce + ct_with_tag


def decrypt_bytes(file_key: bytes, data: bytes) -> bytes:
    """解密 encrypt_bytes 产生的数据。nonce=data[:12]，其余为 ciphertext+tag。"""
    nonce = data[:12]
    ct_with_tag = data[12:]
    aesgcm = AESGCM(file_key)
    return aesgcm.decrypt(nonce, ct_with_tag, None)
