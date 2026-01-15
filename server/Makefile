# FieldWorker Makefile
# Works on Windows (PowerShell), Linux, macOS

.PHONY: help test test-rate test-auth lint format run-server seed clean

help:
	@echo "FieldWorker - Available commands:"
	@echo ""
	@echo "Testing:"
	@echo "  make test           - Run all tests (16 tests)"
	@echo "  make test-rate      - Run rate limiting tests (9 tests)"
	@echo "  make test-auth      - Run auth API tests (7 tests)"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint           - Check code with pylint"
	@echo "  make format         - Format code (black + isort)"
	@echo ""
	@echo "Development:"
	@echo "  make run-server     - Start FastAPI server (port 8001)"
	@echo "  make seed           - Create test data"
	@echo "  make clean          - Clean cache and temp files"

test:
	@echo "Running all tests..."
	python -m pytest tests/ -v

test-rate:
	@echo "Running rate limiting tests..."
	python -m pytest tests/test_rate_limiter.py tests/test_auth_api.py::TestAuthRateLimit -v

test-auth:
	@echo "Running auth API tests..."
	python -m pytest tests/test_auth_api.py -v

lint:
	@echo "Running pylint..."
	python -m pylint app/ --disable=all --enable=E,F

format:
	@echo "Running black..."
	python -m black app/ tests/ --line-length=100
	@echo "Running isort..."
	python -m isort app/ tests/ --profile black

run-server:
	@echo "Starting FastAPI server on http://localhost:8001"
	python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload

seed:
	@echo "Creating test data..."
	python scripts/seed_dev.py

clean:
	@echo "Cleaning cache..."
	powershell -Command "Get-ChildItem -Recurse -Filter '__pycache__' -Directory | Remove-Item -Recurse -Force"
	powershell -Command "Get-ChildItem -Recurse -Filter '.pytest_cache' -Directory | Remove-Item -Recurse -Force"
	powershell -Command "Get-ChildItem -Recurse -Filter '*.pyc' -File | Remove-Item -Force"
	@echo "Done!"
