#!/usr/bin/env python
"""Скрипт для проверки подъездов в базе данных"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.models import SessionLocal, AddressModel

db = SessionLocal()

# Проверяем все адреса
print("=" * 60)
print("Sample addresses in DB:")
print("=" * 60)
addrs = db.query(AddressModel).limit(5).all()

if not addrs:
    print("No addresses found!")
else:
    for a in addrs:
        print(f"  id={a.id}")
        print(f"  city={a.city}")
        print(f"  street={a.street}")
        print(f"  building={a.building}")
        print(f"  corpus={repr(a.corpus)}")
        print(f"  entrance={repr(a.entrance)}")
        print("-" * 40)

print()
print(f"Total addresses: {db.query(AddressModel).count()}")
print(f"With corpus: {db.query(AddressModel).filter(AddressModel.corpus.isnot(None), AddressModel.corpus != '').count()}")
print(f"With entrance: {db.query(AddressModel).filter(AddressModel.entrance.isnot(None), AddressModel.entrance != '').count()}")

db.close()
