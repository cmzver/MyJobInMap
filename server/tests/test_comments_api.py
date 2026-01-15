"""
Tests for Comments API
======================
Тесты эндпоинтов комментариев.
"""

import pytest
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

from app.models import TaskModel, CommentModel, TaskStatus


@pytest.fixture
def test_task(db_session: Session, admin_user):
    """Создать тестовую заявку."""
    task = TaskModel(
        title="Тестовая заявка",
        description="Описание тестовой заявки",
        raw_address="Тестовый адрес",
        status=TaskStatus.NEW.value,
        priority=2  # CURRENT
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)
    return task


class TestAddComment:
    """Тесты добавления комментариев."""
    
    def test_add_comment_success(self, client: TestClient, admin_token: str, test_task):
        """Успешное добавление комментария."""
        response = client.post(
            f"/api/tasks/{test_task.id}/comments",
            json={"text": "Тестовый комментарий", "author": "Тестер"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["text"] == "Тестовый комментарий"
        assert data["task_id"] == test_task.id
    
    def test_add_comment_uses_user_fullname(self, client: TestClient, admin_token: str, test_task):
        """Комментарий использует имя пользователя."""
        response = client.post(
            f"/api/tasks/{test_task.id}/comments",
            json={"text": "Комментарий от админа"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["author"] == "Admin"  # full_name админа из фикстуры
    
    def test_add_comment_task_not_found(self, client: TestClient, admin_token: str):
        """Заявка не найдена."""
        response = client.post(
            "/api/tasks/99999/comments",
            json={"text": "Комментарий"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 404
    
    def test_add_comment_empty_text_fails(self, client: TestClient, admin_token: str, test_task):
        """Пустой текст не принимается."""
        response = client.post(
            f"/api/tasks/{test_task.id}/comments",
            json={"text": ""},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 422  # Validation error
    
    def test_add_comment_long_text(self, client: TestClient, admin_token: str, test_task):
        """Длинный комментарий."""
        long_text = "A" * 500
        response = client.post(
            f"/api/tasks/{test_task.id}/comments",
            json={"text": long_text},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["text"]) == 500


class TestGetComments:
    """Тесты получения комментариев."""
    
    def test_get_comments_empty(self, client: TestClient, admin_token: str, test_task):
        """Получение пустого списка."""
        response = client.get(
            f"/api/tasks/{test_task.id}/comments",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200
        assert response.json() == []
    
    def test_get_comments_with_data(
        self, client: TestClient, admin_token: str, test_task, db_session: Session
    ):
        """Получение списка с комментариями."""
        # Добавляем комментарии напрямую в БД
        for i in range(3):
            comment = CommentModel(
                task_id=test_task.id,
                text=f"Комментарий {i + 1}",
                author="Тестер"
            )
            db_session.add(comment)
        db_session.commit()
        
        response = client.get(
            f"/api/tasks/{test_task.id}/comments",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
    
    def test_get_comments_ordered_by_date(
        self, client: TestClient, admin_token: str, test_task, db_session: Session
    ):
        """Комментарии отсортированы по дате (новые сверху)."""
        # Добавляем через API чтобы получить реальные timestamps
        client.post(
            f"/api/tasks/{test_task.id}/comments",
            json={"text": "Первый комментарий"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        client.post(
            f"/api/tasks/{test_task.id}/comments",
            json={"text": "Второй комментарий"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        response = client.get(
            f"/api/tasks/{test_task.id}/comments",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        # Новые сверху
        assert data[0]["text"] == "Второй комментарий"
        assert data[1]["text"] == "Первый комментарий"


class TestCommentsResponse:
    """Тесты структуры ответа."""
    
    def test_comment_response_fields(self, client: TestClient, admin_token: str, test_task):
        """Проверка полей ответа."""
        client.post(
            f"/api/tasks/{test_task.id}/comments",
            json={"text": "Тест"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        response = client.get(
            f"/api/tasks/{test_task.id}/comments",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()[0]
        
        assert "id" in data
        assert "task_id" in data
        assert "text" in data
        assert "author" in data
        assert "created_at" in data
