"""Rate limiting demonstration script."""

import time

import requests

BASE_URL = "http://localhost:8001"
API_LOGIN = f"{BASE_URL}/api/auth/login"


def test_rate_limit():
    """Demonstrate rate limiting on login endpoint."""
    print("🔐 FieldWorker Rate Limiting Demo")
    print("=" * 50)
    print(f"Target: {API_LOGIN}")
    print(f"Limit: 5 attempts per 60 seconds")
    print()

    # Make 7 failed login attempts
    for attempt in range(1, 8):
        print(f"Attempt {attempt}:")

        response = requests.post(
            API_LOGIN, data={"username": "wronguser", "password": "wrongpass"}
        )

        print(f"  Status: {response.status_code}")

        if response.status_code == 429:  # Too Many Requests
            print(f"  ⚠️  RATE LIMITED!")
            retry_after = response.headers.get("Retry-After", "N/A")
            print(f"  Retry-After: {retry_after}s")
            print(f"  Message: {response.json().get('detail', 'N/A')}")
        elif response.status_code == 401:  # Unauthorized
            print(f"  ❌ Invalid credentials")
        else:
            print(f"  Response: {response.json()}")

        print()

        # Small delay between attempts
        if attempt < 7:
            time.sleep(0.5)


if __name__ == "__main__":
    try:
        test_rate_limit()
        print("✅ Demo completed!")
    except Exception as e:
        print(f"❌ Error: {e}")
        print("Make sure server is running on http://localhost:8001")
