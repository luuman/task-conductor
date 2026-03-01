from app.pipeline.stages.analysis import build_analysis_prompt, parse_options

def test_build_analysis_prompt_contains_title():
    prompt = build_analysis_prompt("实现用户登录功能", "使用 JWT")
    assert "登录" in prompt
    assert "方案" in prompt

def test_build_analysis_prompt_contains_description():
    prompt = build_analysis_prompt("实现登录", "需要支持手机号")
    assert "手机号" in prompt

def test_parse_options_extracts_three():
    raw = """
## 方案 A: JWT 认证
工作量: M
风险: 低
描述: 使用 JWT 进行无状态认证，适合 API 服务

## 方案 B: Session Cookie
工作量: S
风险: 低
描述: 传统 Web 登录方式，简单可靠

## 方案 C: OAuth2
工作量: L
风险: 中
描述: 第三方登录，支持 Google/GitHub
"""
    options = parse_options(raw)
    assert len(options) == 3
    assert options[0]["label"] == "A"
    assert "JWT" in options[0]["title"]
    assert options[0]["effort"] == "M"
    assert options[0]["risk"] == "低"

def test_parse_options_partial():
    raw = """
## 方案 A: 简单方案
工作量: S
风险: 低
描述: 快速实现
"""
    options = parse_options(raw)
    assert len(options) == 1
    assert options[0]["label"] == "A"

def test_parse_options_empty():
    options = parse_options("无方案内容")
    assert options == []
