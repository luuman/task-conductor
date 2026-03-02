# backend/tests/test_tunnel_auth.py
from app.session import PinSession

def test_generate_pin_is_6_digits():
    ps = PinSession()
    pin = ps.generate_pin()
    assert len(pin) == 6
    assert pin.isdigit()

def test_verify_correct_pin_returns_token():
    ps = PinSession()
    ps.generate_pin()
    token = ps.verify_pin(ps._pin)
    assert token is not None
    assert len(token) > 20

def test_verify_wrong_pin_returns_none():
    ps = PinSession()
    ps.generate_pin()
    result = ps.verify_pin("000000")
    assert result is None

def test_verify_token_valid():
    ps = PinSession()
    ps.generate_pin()
    token = ps.verify_pin(ps._pin)
    assert ps.verify_token(token) is True

def test_verify_token_invalid():
    ps = PinSession()
    assert ps.verify_token("bad-token") is False
