.PHONY: help test lint format migrate changelog run-server run-android clean install-deps docker-up docker-down docker-logs docker-rebuild deploy-preset deploy-portal deploy-server

# Single Python env for the repo (server/venv, see server/requirements-dev.txt).
# Used from inside server/, hence the relative path.
PY = venv\Scripts\python.exe
COMPOSE = docker compose -f docker-compose.postgres.yml

help:
	@echo "FieldWorker Development Commands"
	@echo "=================================="
	@echo ""
	@echo "Local Development:"
	@echo "  make test              - Run pytest tests (server)"
	@echo "  make lint              - Run pylint on server code"
	@echo "  make format            - Auto-format code (black, isort)"
	@echo "  make migrate           - Apply database migrations (Alembic)"
	@echo "  make changelog         - Regenerate CHANGELOG.md from git history"
	@echo "  make run-server        - Start FastAPI dev server (port 8001)"
	@echo "  make run-android       - Build and run Android app (debug)"
	@echo "  make clean             - Remove build artifacts, cache"
	@echo "  make install-deps      - Install server deps + dev tools into server/venv"
	@echo ""
	@echo "Docker Commands (docker-compose.postgres.yml):"
	@echo "  make docker-up         - Start all services in Docker"
	@echo "  make docker-down       - Stop all Docker services"
	@echo "  make docker-logs       - View Docker logs (follow mode)"
	@echo "  make docker-rebuild    - Rebuild and restart containers"
	@echo ""
	@echo "Deployment:"
	@echo "  make deploy-preset     - Deploy to preset server (interactive mode)"
	@echo "  make deploy-portal     - Deploy portal only"
	@echo "  make deploy-server     - Deploy server only"

# Run pytest
test:
	@echo "Running tests..."
	cd server && $(PY) -m pytest tests/ -v --tb=short
	@echo "Tests complete!"

# Lint Python code (pylint)
lint:
	@echo "Linting Python code..."
	cd server && $(PY) -m pylint app/ --disable=C0111,C0103,R0903 || true
	@echo "Lint complete!"

# Format code (black + isort)
format:
	@echo "Formatting code..."
	cd server && $(PY) -m black app/ scripts/ tests/
	cd server && $(PY) -m isort app/ scripts/ tests/
	@echo "Format complete!"

# Apply database migrations (one-shot, fails on error)
migrate:
	cd server && $(PY) -m app.migrate

# Regenerate CHANGELOG.md from conventional commits
changelog:
	server\venv\Scripts\python.exe scripts\changelog.py

# Run FastAPI server
run-server:
	@echo "Starting FastAPI server on http://localhost:8001..."
	cd server && $(PY) -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload

# Build and run Android app
run-android:
	@echo "Building and installing Android app..."
	.\gradlew assembleDebug
	@powershell -Command "$$env:Path += ';$$env:LOCALAPPDATA\Android\Sdk\platform-tools'; adb install -r .\app\build\outputs\apk\debug\app-debug.apk"
	@echo "App installed! Use 'adb shell am start -n com.fieldworker/.ui.MainActivity' to launch."

# Clean build artifacts
clean:
	@powershell -ExecutionPolicy Bypass -File .\scripts\clean.ps1

# Install dependencies and pre-commit hooks into server/venv
install-deps:
	@echo "Installing Python dependencies into server/venv..."
	cd server && if not exist venv python -m venv venv
	cd server && $(PY) -m pip install -r requirements.txt -r requirements-dev.txt pre-commit
	@echo "Setting up pre-commit hooks..."
	server\venv\Scripts\pre-commit install
	@echo "Installation complete!"

# Docker commands
docker-up:
	@echo "Starting Docker services..."
	$(COMPOSE) up -d
	@echo "Services started! API: http://localhost:8001"

docker-down:
	@echo "Stopping Docker services..."
	$(COMPOSE) down

docker-logs:
	$(COMPOSE) logs -f

docker-rebuild:
	@echo "Rebuilding and restarting containers..."
	$(COMPOSE) up -d --build
	@echo "Rebuild complete!"

# Deploy to remote server
deploy-preset:
	@echo "Deploying to preset production server..."
	@powershell -ExecutionPolicy Bypass -File .\scripts\sync-update-server-preset.ps1

deploy-portal:
	@echo "Deploying portal only..."
	@powershell -ExecutionPolicy Bypass -File .\scripts\sync-update-server-preset.ps1 -Mode portal

deploy-server:
	@echo "Deploying server only..."
	@powershell -ExecutionPolicy Bypass -File .\scripts\sync-update-server-preset.ps1 -Mode server
