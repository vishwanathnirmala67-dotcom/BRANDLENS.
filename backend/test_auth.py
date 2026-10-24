import os
import tempfile

os.environ["DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["AUTH_SECRET"] = "test-secret"

import auth  # noqa: E402


def expect_error(fn, status):
    try:
        fn()
    except auth.AuthError as e:
        assert e.status == status, (e.status, e.message)
        return
    raise AssertionError("expected AuthError")


def test_register_login_and_no_secret_leak():
    u = auth.register({"account_type": "individual", "full_name": "Vishwa", "email": "V@Test.com", "password": "password123"})
    assert u["email"] == "v@test.com" and "pw_hash" not in u and "salt" not in u
    user, token = auth.login("v@test.com", "password123", remember=True)
    assert auth.verify_token(token) == user["id"] and user["last_login"]


def test_duplicate_and_wrong_password():
    expect_error(lambda: auth.register({"full_name": "X", "email": "v@test.com", "password": "password123"}), 409)
    expect_error(lambda: auth.login("v@test.com", "wrongpass1"), 401)
    expect_error(lambda: auth.login("nobody@test.com", "password123"), 401)


def test_validation():
    expect_error(lambda: auth.register({"full_name": "X", "email": "bad", "password": "password123"}), 422)
    expect_error(lambda: auth.register({"full_name": "X", "email": "a@b.co", "password": "short"}), 422)
    expect_error(lambda: auth.register({"full_name": "", "email": "a@b.co", "password": "password123"}), 422)
    expect_error(lambda: auth.register({"account_type": "organization", "full_name": "A", "email": "a@b.co", "password": "password123"}), 422)


def test_organization_profile_edit():
    u = auth.register({"account_type": "organization", "full_name": "Admin", "email": "admin@acme.com", "password": "password123",
                       "org_name": "Acme", "org_email": "team@acme.com", "work_email": "admin@acme.com", "industry": "Tech", "team_size": "11–50"})
    assert u["org_name"] == "Acme" and u["team_size"] == "11–50"
    u2 = auth.update_profile(u["id"], {"full_name": "New Admin", "org_name": "Acme Inc", "phone": "999"})
    assert u2["full_name"] == "New Admin" and u2["org_name"] == "Acme Inc" and u2["phone"] == "999"


def test_email_change_needs_password():
    u = auth.get_user(auth.login("v@test.com", "password123")[0]["id"])
    expect_error(lambda: auth.update_profile(u["id"], {"email": "new@test.com"}), 403)
    u2 = auth.update_profile(u["id"], {"email": "new@test.com", "current_password": "password123"})
    assert u2["email"] == "new@test.com"
    expect_error(lambda: auth.update_profile(u["id"], {"email": "admin@acme.com", "current_password": "password123"}), 409)


def test_individual_cannot_set_org_fields():
    uid = auth.login("new@test.com", "password123")[0]["id"]
    u = auth.update_profile(uid, {"org_name": "Sneaky"})
    assert u["org_name"] == ""


def test_change_password():
    uid = auth.login("new@test.com", "password123")[0]["id"]
    expect_error(lambda: auth.change_password(uid, "wrong", "newpassword1"), 403)
    expect_error(lambda: auth.change_password(uid, "password123", "short"), 422)
    auth.change_password(uid, "password123", "newpassword1")
    expect_error(lambda: auth.login("new@test.com", "password123"), 401)
    assert auth.login("new@test.com", "newpassword1")[1]


def test_token_tamper_and_expiry():
    t = auth.make_token("abc")
    expect_error(lambda: auth.verify_token(t[:-3] + "xxx"), 401)
    expect_error(lambda: auth.verify_token("garbage"), 401)
    old = auth.SHORT_TTL
    auth.SHORT_TTL = -10
    expired = auth.make_token("abc")
    auth.SHORT_TTL = old
    expect_error(lambda: auth.verify_token(expired), 401)
