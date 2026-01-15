#!/usr/bin/env python3
"""Test all database management functions."""
import requests
import sys

BASE = 'http://localhost:8001'

def main():
    print('='*50)
    print('Testing Database Functions')
    print('='*50)
    print()
    
    # Login (OAuth2 form-data format)
    print('1. Login...')
    try:
        r = requests.post(
            f'{BASE}/api/auth/login', 
            data={'username': 'admin', 'password': 'admin'}  # form-data, not json!
        )
        if r.status_code != 200:
            print(f'   FAIL: {r.status_code} - {r.text}')
            return 1
        token = r.json()['access_token']
        headers = {'Authorization': f'Bearer {token}'}
        print('   ✓ OK')
    except Exception as e:
        print(f'   FAIL: {e}')
        return 1
    print()
    
    # Test Stats
    print('2. DB Stats (GET /api/admin/db/stats)...')
    r = requests.get(f'{BASE}/api/admin/db/stats', headers=headers)
    if r.status_code == 200:
        data = r.json()
        print(f'   ✓ Status: {r.status_code}')
        print(f'   Tasks: {data.get("tasks_count", "N/A")}')
        print(f'   Users: {data.get("users_count", "N/A")}')
        print(f'   Size: {data.get("database_size", "N/A")}')
    else:
        print(f'   ✗ Status: {r.status_code} - {r.text}')
    print()
    
    # Test Vacuum
    print('3. VACUUM (POST /api/admin/db/vacuum)...')
    r = requests.post(f'{BASE}/api/admin/db/vacuum', headers=headers)
    if r.status_code == 200:
        print(f'   ✓ Status: {r.status_code}')
    else:
        print(f'   ✗ Status: {r.status_code} - {r.text}')
    print()
    
    # Test Optimize
    print('4. OPTIMIZE (POST /api/admin/db/optimize)...')
    r = requests.post(f'{BASE}/api/admin/db/optimize', headers=headers)
    if r.status_code == 200:
        print(f'   ✓ Status: {r.status_code}')
    else:
        print(f'   ✗ Status: {r.status_code} - {r.text}')
    print()
    
    # Test Clear
    print('5. Clear (DELETE /api/admin/tasks)...')
    r = requests.delete(f'{BASE}/api/admin/tasks', headers=headers)
    if r.status_code == 200:
        print(f'   ✓ Status: {r.status_code}')
    else:
        print(f'   ✗ Status: {r.status_code} - {r.text}')
    print()
    
    # Test Seed
    print('6. Seed (POST /api/admin/db/seed)...')
    r = requests.post(f'{BASE}/api/admin/db/seed', headers=headers)
    if r.status_code == 200:
        data = r.json()
        print(f'   ✓ Status: {r.status_code}')
        print(f'   Users created: {data.get("users_created", "N/A")}')
        print(f'   Tasks created: {data.get("tasks_created", "N/A")}')
    else:
        print(f'   ✗ Status: {r.status_code} - {r.text}')
    print()
    
    print('='*50)
    print('All functions tested!')
    print('='*50)
    return 0

if __name__ == '__main__':
    sys.exit(main())
