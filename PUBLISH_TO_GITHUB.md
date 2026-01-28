# 🚀 Публикация FieldWorker на GitHub - Пошаговая инструкция

## ✅ Что уже готово

1. ✓ Git репозиторий инициализирован
2. ✓ Все файлы добавлены в staging area
3. ✓ Начальный коммит создан
4. ✓ Git настроен (имя и email установлены)

**Код готов к публикации на GitHub!**

---

## 📋 Быстрый старт (2 минуты)

### Шаг 1: Создайте репозиторий на GitHub

1. Перейдите на **[github.com/new](https://github.com/new)**
2. Заполните форму:
   - **Repository name**: `FieldWorker` (или `MyJobInMap`)
   - **Description**: `Field service management system with Android app, React portal, and FastAPI backend`
   - **Visibility**: `Public` или `Private`
   - **Initialize this repository**: НЕ выбирайте ничего (оставьте пусто)
3. Нажмите **Create repository**

### Шаг 2: Выполните одну из команд ниже

#### Вариант A: Используя скрипт PowerShell (рекомендуется)

```powershell
cd C:\Users\VADIM\Documents\MyJobInMap
.\push-to-github.ps1 -Username "ВАШ_ЛОГИН_ГИТХАБ" -Repository "FieldWorker"
```

#### Вариант B: Вручную (HTTPS)

```powershell
cd C:\Users\VADIM\Documents\MyJobInMap

# Добавить удалённый репозиторий
git remote add origin https://github.com/ВАШ_ЛОГИН_ГИТХАБ/FieldWorker.git

# Переименовать ветку
git branch -M main

# Отправить код
git push -u origin main
```

#### Вариант C: Вручную (SSH)

```powershell
cd C:\Users\VADIM\Documents\MyJobInMap

git remote add origin git@github.com:ВАШ_ЛОГИН_ГИТХАБ/FieldWorker.git
git branch -M main
git push -u origin main
```

---

## 🔐 Аутентификация

### Если используете HTTPS (проще):

При первом `git push` система запросит:
- **Username**: Ваш логин GitHub
- **Password**: Personal Access Token (не обычный пароль!)

### Получить Personal Access Token:

1. На GitHub откройте: **Settings** → **Developer settings** → **Personal access tokens**
2. Нажмите **Tokens (classic)** → **Generate new token (classic)**
3. Выберите права: `repo` (полный доступ к репозиториям)
4. Скопируйте токен и используйте его вместо пароля

### Если используете SSH:

Сначала настройте SSH ключи:

```powershell
# Создать SSH ключ
ssh-keygen -t ed25519 -C "ваша_почта@example.com"

# Добавить ключ на GitHub: https://github.com/settings/keys
```

---

## 📊 Что будет загружено на GitHub

```
MyJobInMap/
├── app/                      # Android приложение (Kotlin)
│   └── src/main/java/...     # 40+ файлов с исходным кодом
│
├── portal/                   # Веб-портал (React + TypeScript)
│   ├── src/                  # Компоненты, страницы, хуки
│   └── package.json          # Dependencies
│
├── server/                   # FastAPI backend (Python)
│   ├── app/                  # API, models, schemas, services
│   ├── tests/                # 20+ тестов
│   └── requirements.txt      # Dependencies
│
├── bot/                      # Telegram бот
├── docs/                     # Документация
├── README.md                 # Основной гайд
├── CHANGELOG.md              # История версий
└── Makefile                  # Команды разработки
```

**Размер:** ~60 МБ (с бэкапами БД)

---

## ✨ После публикации

### 1. Проверить, что всё загрузилось

```powershell
# Откройте в браузере:
# https://github.com/ВАШ_ЛОГИН_ГИТХАБ/FieldWorker
```

### 2. Рекомендуемые действия

#### Создать ветку разработки:
```powershell
git checkout -b develop
git push origin develop
```

#### Обновить код локально:
```powershell
git add .
git commit -m "Описание изменений"
git push origin main  # или develop
```

#### Создать GitHub Pages для документации:
1. На GitHub: **Settings** → **Pages**
2. Source: `main` branch → `/root` folder
3. Нажмите **Save**

#### Включить GitHub Actions для CI/CD:
1. Создайте `.github/workflows/tests.yml`
2. Добавьте автоматические тесты

---

## 🐛 Решение типичных проблем

### ❌ Ошибка: "fatal: remote origin already exists"

```powershell
# Решение: удалить старый origin
git remote remove origin
# Затем добавить заново
git remote add origin https://github.com/ВАШ_ЛОГИН/FieldWorker.git
```

### ❌ Ошибка: "Authentication failed"

```powershell
# Проверьте Personal Access Token:
# https://github.com/settings/tokens

# Или используйте SSH:
git remote set-url origin git@github.com:ВАШ_ЛОГИН/FieldWorker.git
```

### ❌ Ошибка: "Updates were rejected"

```powershell
# Если репозиторий на GitHub не пуст:
git pull origin main --allow-unrelated-histories
git push origin main
```

### ❌ Ошибка: Большие файлы в коммите

Если файлы > 100 МБ, GitHub их отклонит. Используйте Git LFS:

```powershell
# Установить Git LFS
# https://git-lfs.com

# Отследить большие файлы
git lfs track "*.sqlite.gz"
git add .gitattributes
git commit -m "Add Git LFS tracking"
git push origin main
```

---

## 📚 Дополнительная информация

### Полезные команды Git

```powershell
# Проверить статус
git status

# Просмотреть историю коммитов
git log --oneline

# Просмотреть удалённые репозитории
git remote -v

# Обновить локальный код с GitHub
git pull origin main

# Создать новую ветку
git checkout -b feature/моя-фишка
git push origin feature/моя-фишка
```

### Структура файлов в GitHub

- `README.md` — автоматически отображается на главной странице
- `CHANGELOG.md` — история версий
- `docs/` — папка с документацией
- `.github/workflows/` — GitHub Actions
- `.gitignore` — исключённые файлы

### Защита репозитория

На GitHub в **Settings** → **Branches** можно добавить:
- ✓ Require pull request reviews
- ✓ Require status checks to pass
- ✓ Dismiss stale pull request approvals
- ✓ Require branches to be up to date

---

## 🎉 Готово!

После отправки кода на GitHub:

1. ✓ Код сохранён в облаке
2. ✓ Есть история версий
3. ✓ Можно сотрудничать с командой
4. ✓ Можно использовать GitHub Actions для CI/CD
5. ✓ Можно создавать релизы и теги

**Поздравляем с публикацией проекта! 🚀**

---

## 📞 Нужна помощь?

- GitHub Docs: https://docs.github.com
- Git Cheat Sheet: https://github.github.com/training-kit/downloads/github-git-cheat-sheet.pdf
- Общение в Issues: https://github.com/YOUR_NAME/FieldWorker/issues

---

**Версия инструкции:** 1.0  
**Дата:** 15 января 2026  
**Проект:** FieldWorker v2.4.0
