"""Test configuration and fixtures."""
import os
import sys

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

# Add server directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models.base import Base
from app.models import UserModel, UserRole
from app.services.auth import get_password_hash
from main import app
from app.models.base import get_db


TEST_SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture(scope="function")
def db_engine():
    """Create test engine (function-scoped for isolation)."""
    engine = create_engine(
        TEST_SQLALCHEMY_DATABASE_URL, 
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db_session(db_engine):
    """Create a new database session for each test."""
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture(scope="function")
def client(db_session):
    """Create test client with test database."""
    def override_get_db():
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    test_client = TestClient(app)
    
    yield test_client
    
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def admin_user(db_session):
    """Create admin user for tests."""
    admin = UserModel(
        username="admin",
        password_hash=get_password_hash("admin"),
        full_name="Admin",
        role=UserRole.ADMIN.value,
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)
    return admin


@pytest.fixture(scope="function")
def admin_token(client, admin_user):
    """Get JWT token for admin."""
    response = client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "admin"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest.fixture(scope="function")
def auth_headers(admin_token):
    """Auth headers with admin token."""
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="function")
def client_with_auth(client, auth_headers):
    """Test client with authentication."""
    client.headers.update(auth_headers)
    return client


@pytest.fixture(scope="function")
def dispatcher_user(db_session):
    """Create dispatcher user for tests."""
    dispatcher = UserModel(
        username="dispatcher",
        password_hash=get_password_hash("dispatcher"),
        full_name="Dispatcher",
        role=UserRole.DISPATCHER.value,
        is_active=True,
    )
    db_session.add(dispatcher)
    db_session.commit()
    db_session.refresh(dispatcher)
    return dispatcher


@pytest.fixture(scope="function")
def client_with_dispatcher(client, dispatcher_user):
    """Test client with dispatcher authentication."""
    response = client.post(
        "/api/auth/login",
        data={"username": "dispatcher", "password": "dispatcher"},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


@pytest.fixture(scope="function")
def worker_user(db_session):
    """Create worker user for tests."""
    worker = UserModel(
        username="worker",
        password_hash=get_password_hash("worker"),
        full_name="Worker",
        role=UserRole.WORKER.value,
        is_active=True,
    )
    db_session.add(worker)
    db_session.commit()
    db_session.refresh(worker)
    return worker


@pytest.fixture(scope="function")
def client_with_worker(client, worker_user):
    """Test client with worker authentication."""
    response = client.post(
        "/api/auth/login",
        data={"username": "worker", "password": "worker"},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


@pytest.fixture(scope="function")
def sample_worker(worker_user):
    """Sample worker data."""
    return {
        "id": worker_user.id,
        "username": worker_user.username,
        "full_name": worker_user.full_name,
    }


@pytest.fixture(scope="function")
def sample_tasks_for_reports(db_session, admin_user, worker_user):
    """Create sample tasks for reports testing."""
    from app.models.task import TaskModel
    from datetime import datetime, timedelta, timezone
    
    tasks = []
    now = datetime.now(timezone.utc)
    
    # Новая задача
    tasks.append(TaskModel(
        title="Test Task 1",
        description="Test",
        raw_address="Test Address 1",
        status="NEW",
        priority="CURRENT",
        created_at=now - timedelta(days=5),
        updated_at=now - timedelta(days=5),
        assigned_user_id=worker_user.id
    ))
    
    # В работе
    tasks.append(TaskModel(
        title="Test Task 2",
        description="Test",
        raw_address="Test Address 2",
        status="IN_PROGRESS",
        priority="URGENT",
        created_at=now - timedelta(days=3),
        updated_at=now - timedelta(days=2),
        assigned_user_id=worker_user.id
    ))
    
    # Выполнена
    tasks.append(TaskModel(
        title="Test Task 3",
        description="Test",
        raw_address="Test Address 3",
        status="DONE",
        priority="PLANNED",
        created_at=now - timedelta(days=10),
        updated_at=now - timedelta(days=1),
        assigned_user_id=worker_user.id
    ))
    
    # Отменена
    tasks.append(TaskModel(
        title="Test Task 4",
        description="Test",
        raw_address="Test Address 4",
        status="CANCELLED",
        priority="EMERGENCY",
        created_at=now - timedelta(days=7),
        updated_at=now - timedelta(days=6),
        assigned_user_id=worker_user.id
    ))
    
    for task in tasks:
        db_session.add(task)
    
    db_session.commit()
    
    for task in tasks:
        db_session.refresh(task)
    
    return tasks


@pytest.fixture(scope="function")
def sample_completed_tasks(db_session, admin_user, worker_user):
    """Create sample completed tasks for completion time testing."""
    from app.models.task import TaskModel
    from datetime import datetime, timedelta, timezone
    
    tasks = []
    now = datetime.now(timezone.utc)
    
    # Быстро выполненная
    tasks.append(TaskModel(
        title="Quick Task",
        description="Test",
        raw_address="Test Address",
        status="DONE",
        priority="URGENT",
        created_at=now - timedelta(hours=2),
        updated_at=now - timedelta(hours=1),
        assigned_user_id=worker_user.id
    ))
    
    # Медленно выполненная
    tasks.append(TaskModel(
        title="Slow Task",
        description="Test",
        raw_address="Test Address",
        status="DONE",
        priority="PLANNED",
        created_at=now - timedelta(days=5),
        updated_at=now - timedelta(days=1),
        assigned_user_id=worker_user.id
    ))
    
    for task in tasks:
        db_session.add(task)
    
    db_session.commit()
    
    for task in tasks:
        db_session.refresh(task)
    
    return tasks

