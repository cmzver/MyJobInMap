#!/usr/bin/env python
"""Test backup API endpoints"""
import requests

BASE = 'http://localhost:8001'

# Login
print("=== Login ===")
r = requests.post(f'{BASE}/api/auth/login', data={'username': 'admin', 'password': 'admin'})
print(f"Status: {r.status_code}")
if r.status_code != 200:
    print(f"Error: {r.text}")
    exit(1)
token = r.json()['access_token']
headers = {'Authorization': f'Bearer {token}'}
print("Login: OK")

# List backups
print("\n=== List Backups ===")
r = requests.get(f'{BASE}/api/admin/backup/list', headers=headers)
print(f"Status: {r.status_code}")
print(f"Response: {r.text}")

# Create backup
print("\n=== Create Backup ===")
r = requests.post(f'{BASE}/api/admin/backup/run', headers=headers)
print(f"Status: {r.status_code}")
print(f"Response: {r.text}")

# List backups again
print("\n=== List Backups After Creation ===")
r = requests.get(f'{BASE}/api/admin/backup/list', headers=headers)
print(f"Status: {r.status_code}")
print(f"Response: {r.text}")

print("\n=== DONE ===")
