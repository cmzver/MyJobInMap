"""Integration script for dashboard API (requires running server on localhost:8001)."""
import os
import pytest
import requests
import json

# Skip during automated test runs unless explicitly enabled
if not os.environ.get("RUN_INTEGRATION"):
    pytest.skip("Integration script – requires running API server", allow_module_level=True)

token_path = ".admin_token.txt"
if not os.path.exists(token_path):
    raise FileNotFoundError(f"Admin token file not found: {token_path}")
# Читаем токен админа
with open(token_path, 'r') as f:
    token = f.read().strip()

# Делаем запрос к API
headers = {'Authorization': f'Bearer {token}'}
response = requests.get('http://localhost:8001/api/dashboard/stats', headers=headers)

print("=" * 60)
print("Dashboard API Response")
print("=" * 60)
print(f"Status: {response.status_code}")
print(f"\nJSON Response:")
print(json.dumps(response.json(), indent=2, ensure_ascii=False))
print("=" * 60)

# Также проверим общее количество задач
response2 = requests.get('http://localhost:8001/api/tasks?page=1&size=1000', headers=headers)
tasks = response2.json()
print(f"\nTotal tasks in database: {tasks['total']}")
print(f"Task statuses:")
for task in tasks['items']:
    print(f"  - Task {task['id']}: {task['status']}")
