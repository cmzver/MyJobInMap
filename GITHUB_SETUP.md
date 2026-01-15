# Публикация проекта на GitHub

## Шаг 1: Настройка Git (если еще не выполнено)

Установите свою личность в Git:

```bash
git config --global user.name "Ваше имя"
git config --global user.email "ваша_почта@example.com"
```

Для текущего репозитория (опционально):
```bash
git config user.name "Ваше имя"
git config user.email "ваша_почта@example.com"
```

## Шаг 2: Создание репозитория на GitHub

1. Перейдите на [github.com](https://github.com)
2. Нажмите **"+"** в правом верхнем углу → **New repository**
3. Заполните:
   - **Repository name**: `FieldWorker` или `MyJobInMap`
   - **Description**: `Field service management system with Android app, React portal, and FastAPI backend`
   - **Visibility**: `Public` или `Private` (выберите по предпочтению)
   - **Initialize this repository**: НЕ выбирайте (у нас уже есть код)
   - Нажмите **Create repository**

## Шаг 3: Добавление удалённого репозитория

После создания репозитория на GitHub, вы получите ссылку. Используйте одну из этих команд:

### Вариант 1: HTTPS (проще для начинающих)
```bash
cd C:\Users\VADIM\Documents\MyJobInMap
git remote add origin https://github.com/ВАШ_ЛОГИН/FieldWorker.git
git branch -M main
git push -u origin main
```

### Вариант 2: SSH (безопаснее)
```bash
cd C:\Users\VADIM\Documents\MyJobInMap
git remote add origin git@github.com:ВАШ_ЛОГИН/FieldWorker.git
git branch -M main
git push -u origin main
```

## Шаг 4: Полная последовательность команд

```powershell
# 1. Перейти в проект
cd C:\Users\VADIM\Documents\MyJobInMap

# 2. Настроить Git (если нужно)
git config user.name "Ваше имя"
git config user.email "ваша_почта@example.com"

# 3. Добавить удалённый репозиторий (замените ВАШ_ЛОГИН)
git remote add origin https://github.com/ВАШ_ЛОГИН/FieldWorker.git

# 4. Переименовать главную ветку
git branch -M main

# 5. Отправить код на GitHub
git push -u origin main
```

## Шаг 5: Создание Personal Access Token (если используете HTTPS)

Если при `git push` запросится пароль, используйте Personal Access Token вместо пароля:

1. На GitHub: **Settings** → **Developer settings** → **Personal access tokens** → **Generate new token**
2. Выберите права: `repo` (full control of private repositories)
3. Скопируйте токен
4. При запросе пароля вставьте этот токен

## Шаг 6: Проверка

Проверьте, что код загружен:
```bash
git remote -v
git log --oneline
```

Откройте репозиторий на GitHub:
```
https://github.com/ВАШ_ЛОГИН/FieldWorker
```

## 🎉 Готово!

Ваш проект **FieldWorker** опубликован на GitHub!

---

## Дополнительно: Добавление файлов в будущем

Для отправки новых изменений:
```bash
git add .
git commit -m "Описание изменений"
git push origin main
```

## ⚙️ Рекомендуемые действия после публикации

1. **Добавить .gitignore** для чувствительных файлов (БД, логи, токены)
   - Уже в проекте есть `.gitignore`

2. **Создать ветки для разработки**
   ```bash
   git checkout -b develop
   git push origin develop
   ```

3. **Настроить GitHub Actions** для CI/CD
   - Создайте `.github/workflows/` для автотестов

4. **Добавить GitHub Pages** для документации
   - Settings → Pages → Select main branch

---

**Версия проекта:** 2.4.0  
**Последнее обновление:** 15 января 2026
