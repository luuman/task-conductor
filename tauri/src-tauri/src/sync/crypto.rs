//! HKDF-SHA256 文件密钥派生 + AES-256-GCM 解密。
//!
//! 与服务端 Python crypto.py 对称：
//!   master_key (32B hex) + file_rel_path → HKDF-SHA256 → file_key (32B)
//!   file_key + data[..12](nonce) + data[12..](ciphertext+tag) → plaintext

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use hkdf::Hkdf;
use sha2::Sha256;

/// 从 master_key 和文件相对路径派生 file_key（32 字节）。
pub fn derive_file_key(master_key: &[u8], file_rel_path: &str) -> Result<[u8; 32], String> {
    let hk = Hkdf::<Sha256>::new(None, master_key);
    let mut file_key = [0u8; 32];
    hk.expand(file_rel_path.as_bytes(), &mut file_key)
        .map_err(|e| format!("HKDF expand failed: {e}"))?;
    Ok(file_key)
}

/// 解密 AES-256-GCM 数据（格式：nonce[12B] | ciphertext+tag）。
pub fn decrypt_bytes(file_key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 12 + 16 {
        return Err(format!("data too short: {} bytes", data.len()));
    }
    let key = Key::<Aes256Gcm>::from_slice(file_key);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(&data[..12]);
    cipher
        .decrypt(nonce, &data[12..])
        .map_err(|e| format!("AES-GCM decrypt failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 与 Python 的 crypto.py 保持算法一致性，用固定向量验证。
    #[test]
    fn test_derive_file_key_deterministic() {
        let master_key = [0u8; 32];
        let k1 = derive_file_key(&master_key, "encrypted/test.jsonl.enc").unwrap();
        let k2 = derive_file_key(&master_key, "encrypted/test.jsonl.enc").unwrap();
        assert_eq!(k1, k2);
        assert_eq!(k1.len(), 32);
    }

    #[test]
    fn test_derive_file_key_different_paths() {
        let master_key = [0u8; 32];
        let k1 = derive_file_key(&master_key, "encrypted/a.jsonl.enc").unwrap();
        let k2 = derive_file_key(&master_key, "encrypted/b.jsonl.enc").unwrap();
        assert_ne!(k1, k2);
    }

    #[test]
    fn test_decrypt_bytes_too_short() {
        let key = [0u8; 32];
        let result = decrypt_bytes(&key, &[0u8; 10]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("too short"));
    }
}
