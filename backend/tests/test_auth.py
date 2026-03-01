from app.auth import create_token, verify_token

def test_create_and_verify_token():
    token = create_token({"server": "localhost"})
    assert token is not None
    payload = verify_token(token)
    assert payload["server"] == "localhost"

def test_invalid_token_returns_none():
    result = verify_token("invalid.token.here")
    assert result is None
