.PHONY: help seed test lint format run-server run-android clean docker-up docker-down docker-logs deploy

help:
	@echo "FieldWorker Development Commands"
	@echo "=================================="
	@echo ""
	@echo "Local Development:"
	@echo "  make seed              - Clear DB and populate with test data"
	@echo "  make test              - Run pytest tests (server)"
	@echo "  make lint              - Run pylint on server code"
	@echo "  make format            - Auto-format code (black, isort)"
	@echo "  make run-server        - Start FastAPI dev server (port 8001)"
	@echo "  make run-android       - Build and run Android app (debug)"
	@echo "  make clean             - Remove build artifacts, cache"
	@echo "  make install-deps      - Install Python and pre-commit hooks"
	@echo ""
	@echo "Docker Commands:"
	@echo "  make docker-up         - Start all services in Docker"
	@echo "  make docker-down       - Stop all Docker services"
	@echo "  make docker-logs       - View Docker logs (follow mode)"
	@echo "  make docker-rebuild    - Rebuild and restart containers"
	@echo ""
	@echo "Deployment:"
	@echo "  make deploy            - Deploy to remote server via rsync"

# Seed database with test data
seed:
	@echo "Seeding database..."
	cd server && python scripts/seed_dev.py
	@echo "Done!"

# Run pytest
test:
	@echo "Running tests..."
	cd server && python -m pytest tests/ -v --tb=short
	@echo "Tests complete!"

# Lint Python code (pylint)
lint:
	@echo "Linting Python code..."
	cd server && python -m pylint app/ --disable=C0111,C0103,R0903 || true
	@echo "Lint complete!"

# Format code (black + isort)
format:
	@echo "Formatting code..."
	cd server && python -m black app/ scripts/ tests/ --line-length=100
	cd server && python -m isort app/ scripts/ tests/ --profile=black
	@echo "Format complete!"

# Run FastAPI server
run-server:
	@echo "Starting FastAPI server on http://localhost:8001..."
	cd server && python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload

# Build and run Android app
run-android:
	@echo "Building and installing Android app..."
	.\gradlew assembleDebug
	@powershell -Command "$$env:Path += ';$$env:LOCALAPPDATA\Android\Sdk\platform-tools'; adb install -r .\app\build\outputs\apk\debug\app-debug.apk"
	@echo "App installed! Use 'adb shell am start -n com.fieldworker/.ui.MainActivity' to launch."

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	@rmdir /s /q server\.pytest_cache 2>nul || true
	@rmdir /s /q server\__pycache__ 2>nul || true
	@rmdir /s /q app\build 2>nul || true
	@rmdir /s /q .gradle 2>nul || true
	@del /s *.pyc 2>nul || true
	@echo "Clean complete!"

# Install dependencies and pre-commit hooks
install-deps:
	@echo "Installing Python dependencies..."
	cd server && pip install -r requirements.txt
	cd server && pip install pre-commit
	@echo "Setting up pre-commit hooks..."
	pre-commit install
	@echo "Installation complete!"

# Docker commands
docker-up:
	@echo "Starting Docker services..."
	docker compose up -d
	@echo "Services started! API: http://localhost:8001"

docker-down:
	@echo "Stopping Docker services..."
	docker compose down

docker-logs:
	docker compose logs -f

docker-rebuild:
	@echo "Rebuilding and restarting containers..."
	docker compose up -d --build
	@echo "Rebuild complete!"

# Deploy to remote server
deploy:
	@echo "Deploying to remote server..."
	@powershell -ExecutionPolicy Bypass -File .\deploy-rsync.ps1
