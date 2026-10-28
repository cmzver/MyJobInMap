# FieldWorker Makefile
# Run from server/. Uses the repo's single Python env (server/venv).

PY = venv\Scripts\python.exe

.PHONY: help test test-rate test-auth lint format migrate run-server clean

help:
	@echo "FieldWorker - Available commands:"
	@echo ""
	@echo "Testing:"
	@echo "  make test           - Run all tests"
	@echo "  make test-rate      - Run rate limiting tests"
	@echo "  make test-auth      - Run auth API tests"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint           - Check code with pylint"
	@echo "  make format         - Format code (black + isort)"
	@echo ""
	@echo "Development:"
	@echo "  make migrate        - Apply database migrations"
	@echo "  make run-server     - Start FastAPI server (port 8001)"
	@echo "  make clean          - Clean cache and temp files"

test:
	@echo "Running all tests..."
	$(PY) -m pytest tests/ -v

test-rate:
	@echo "Running rate limiting tests..."
	$(PY) -m pytest tests/test_rate_limiter.py tests/test_auth_api.py::TestAuthRateLimit -v

test-auth:
	@echo "Running auth API tests..."
	$(PY) -m pytest tests/test_auth_api.py -v

lint:
	@echo "Running pylint..."
	$(PY) -m pylint app/ --disable=all --enable=E,F

format:
	@echo "Running black..."
	$(PY) -m black app/ tests/
	@echo "Running isort..."
	$(PY) -m isort app/ tests/

run-server:
	@echo "Starting FastAPI server on http://localhost:8001"
	$(PY) -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload

migrate:
	@echo "Applying database migrations..."
	$(PY) -m app.migrate

clean:
	@echo "Cleaning cache..."
	powershell -Command "Get-ChildItem -Recurse -Filter '__pycache__' -Directory | Remove-Item -Recurse -Force"
	powershell -Command "Get-ChildItem -Recurse -Filter '.pytest_cache' -Directory | Remove-Item -Recurse -Force"
	powershell -Command "Get-ChildItem -Recurse -Filter '*.pyc' -File | Remove-Item -Force"
	@echo "Done!"
