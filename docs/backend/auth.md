# 认证与鉴权

## 两层认证机制

### 层一：PIN 认证（获取 Token）

**生成阶段**（服务启动时）：
```python
class PinSession:
    def generate_pin(self):
        pin = os.environ.get("TC_PIN")  # 固定 PIN（开发用）
        if not pin:
            pin = "".join([str(random.randint(0,9)) for _ in range(6)])
        self._pin = pin
        print(f"[Auth] PIN: {pin}")  # 打印到控制台
```

**验证阶段**（用户登录时）：
```
POST /auth/pin
  body: {"pin": "123456", "tunnel_url": "https://xxx.trycloudflare.com"}
  → 成功：返回 {"token": "eyJ..."}
  → 前端保存到 localStorage["tc_token"]
```

### 层二：JWT Token 验证（请求鉴权）

所有 API 端点（除 /auth/* 和 /hooks/claude）都需要 Token：

```python
def verify_token(credentials):
    payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
    return payload
```

Token 特性：
- 有效期 365 天
- SECRET_KEY 从环境变量读取（不变则重启后仍有效）
- 无刷新机制（到期需重新登录）

### 特殊：localhost 免 PIN

```python
GET /auth/local
  if request.client.host == "127.0.0.1":
    return {"token": create_token({"sub": "local_user"})}
```

前端检测到运行在 localhost 时，优先尝试 `/auth/local` 自动登录（3秒超时），失败再跳到 PIN 输入。

## 前端认证流程

```
App.tsx 启动
  ↓
localStorage 中有 token？
  ├─ 有 → GET /auth/check → 200 → 进入主界面 / 401 → 清除，跳 Login
  └─ 无 → 跳 Login

Login.tsx
  ├─ localhost → GET /auth/local（3秒超时）→ 成功自动登录
  └─ 手动：输入 tunnelUrl + PIN → POST /auth/pin → 保存 token
```
