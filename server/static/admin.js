import { Auth } from './modules/auth.js';
import { ApiClient } from './modules/api.js';
import { Utils } from './modules/utils.js';

/**
 * FieldWorker Admin Panel JavaScript
 */

// Initialize Modules
const auth = new Auth('token', 'user', '/admin/login');
const api = new ApiClient(auth);

// Global State
let tasks = [];
let users = [];
let devices = [];
let currentUser = auth.getUser() || {};

// Auto-refresh settings
let autoRefreshInterval = null;
let autoRefreshSeconds = parseInt(localStorage.getItem('autoRefreshSeconds') || '30');
let autoRefreshEnabled = localStorage.getItem('autoRefreshEnabled') !== 'false';

// Modal instances
let taskModal = null;
let userModal = null;
let customFieldModal = null;
let importTaskModal = null;

// Expose Utils to window for HTML templates if needed (though mostly we use them here)
window.Utils = Utils;

// Check authentication
if (!auth.isAuthenticated() || currentUser.role !== 'admin') {
    auth.logout();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Modals
    const modalIds = ['taskModal', 'userModal', 'customFieldModal', 'importTaskModal'];
    modalIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const modal = new bootstrap.Modal(el);
            Utils.setupModalFocusHandler(el);
            
            // Assign to global variables
            if (id === 'taskModal') taskModal = modal;
            if (id === 'userModal') userModal = modal;
            if (id === 'customFieldModal') customFieldModal = modal;
            if (id === 'importTaskModal') importTaskModal = modal;
        }
    });

    // Set current user
    const userDisplay = document.getElementById('current-user');
    if (userDisplay) userDisplay.textContent = currentUser.full_name || currentUser.username;
    
    // Navigation
    document.querySelectorAll('[data-page]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showPage(link.dataset.page);
        });
    });
    
    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        auth.logout();
    });
    
    // Buttons
    document.getElementById('btn-create-task')?.addEventListener('click', () => openTaskModal());
    document.getElementById('btn-save-task')?.addEventListener('click', saveTask);
    document.getElementById('btn-delete-task')?.addEventListener('click', deleteTask);
    document.getElementById('btn-import-task')?.addEventListener('click', () => openImportTaskModal());
    
    document.getElementById('btn-create-user')?.addEventListener('click', () => openUserModal());
    document.getElementById('btn-save-user')?.addEventListener('click', saveUser);
    document.getElementById('btn-delete-user')?.addEventListener('click', deleteUser);
    
    // Filters
    ['filter-status', 'filter-priority', 'filter-user', 'filter-date-from', 'filter-date-to'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', renderTasks);
    });
    document.getElementById('filter-search')?.addEventListener('input', renderTasks);
    
    // Finance filters
    document.getElementById('finance-period')?.addEventListener('change', loadFinanceData);
    document.getElementById('finance-user-filter')?.addEventListener('change', loadFinanceData);
    
    // Load initial data
    loadDashboard();
    loadTasks();
    loadUsers().then(() => loadFinanceData());
    loadDevices();
    loadSettings();
    
    // Setup auto-refresh
    setupAutoRefresh();

    // Setup Drop Zones for Card Builder
    setTimeout(setupDropZones, 500);
});

// ============================================ 
// Auto-refresh
// ============================================ 

function setupAutoRefresh() {
    updateAutoRefreshUI();
    if (autoRefreshEnabled) {
        startAutoRefresh();
    }
}

function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshInterval = setInterval(() => {
        refreshAllData();
    }, autoRefreshSeconds * 1000);
    autoRefreshEnabled = true;
    localStorage.setItem('autoRefreshEnabled', 'true');
    updateAutoRefreshUI();
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
    autoRefreshEnabled = false;
    localStorage.setItem('autoRefreshEnabled', 'false');
    updateAutoRefreshUI();
}

// Expose to window
window.toggleAutoRefresh = function() {
    if (autoRefreshEnabled) {
        stopAutoRefresh();
    } else {
        startAutoRefresh();
    }
};

window.setAutoRefreshInterval = function(seconds) {
    autoRefreshSeconds = seconds;
    localStorage.setItem('autoRefreshSeconds', seconds.toString());
    if (autoRefreshEnabled) {
        startAutoRefresh();
    }
    updateAutoRefreshUI();
};

function updateAutoRefreshUI() {
    const statusEl = document.getElementById('auto-refresh-status');
    const toggleBtn = document.getElementById('auto-refresh-toggle');
    const intervalSelect = document.getElementById('auto-refresh-interval');
    
    if (statusEl) {
        statusEl.innerHTML = autoRefreshEnabled 
            ? `<span class="badge bg-success"><i class="bi bi-arrow-repeat me-1"></i>Авто: ${autoRefreshSeconds}с</span>` 
            : `<span class="badge bg-secondary"><i class="bi bi-pause-circle me-1"></i>Выкл</span>`;
    }
    
    if (toggleBtn) {
        toggleBtn.innerHTML = autoRefreshEnabled 
            ? '<i class="bi bi-pause-fill"></i>' 
            : '<i class="bi bi-play-fill"></i>';
        toggleBtn.className = autoRefreshEnabled 
            ? 'btn btn-sm btn-outline-warning' 
            : 'btn btn-sm btn-outline-success';
    }
    
    if (intervalSelect) {
        intervalSelect.value = autoRefreshSeconds.toString();
    }
}

window.refreshAllData = async function() {
    console.log('🔄 Auto-refreshing data...');
    try {
        await Promise.all([
            loadTasks(),
            loadUsers(),
            loadDevices()
        ]);
        updateDashboardStats();
        renderRecentTasks();
        
        const statusEl = document.getElementById('auto-refresh-status');
        if (statusEl && autoRefreshEnabled) {
            statusEl.classList.add('pulse');
            setTimeout(() => statusEl.classList.remove('pulse'), 500);
        }
    } catch (err) {
        console.error('Auto-refresh error:', err);
    }
};

// Navigation
function showPage(pageId) {
    document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    
    const page = document.getElementById(pageId);
    const link = document.querySelector(`[data-page="${pageId}"]`);
    
    if (page) page.classList.add('active');
    if (link) link.classList.add('active');
}

// ============================================ 
// Dashboard
// ============================================ 

async function loadDashboard() {
    try {
        const response = await api.get('/api/tasks?all_tasks=true&size=1000');
        if (response.ok) {
            const data = await response.json();
            tasks = data.items || [];
            updateDashboardStats();
            renderRecentTasks();
        }
    } catch (err) {
        console.error('Error loading dashboard:', err);
    }
}

function updateDashboardStats() {
    const total = tasks.length;
    const newCount = tasks.filter(t => t.status === 'NEW').length;
    const progressCount = tasks.filter(t => t.status === 'IN_PROGRESS').length;
    const doneCount = tasks.filter(t => t.status === 'DONE').length;
    
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-new').textContent = newCount;
    document.getElementById('stat-progress').textContent = progressCount;
    document.getElementById('stat-done').textContent = doneCount;
}

function renderRecentTasks() {
    const tbody = document.getElementById('recent-tasks');
    const recent = tasks.slice(0, 5);
    
    if (recent.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">Нет заявок</td></tr>';
        return;
    }
    
    tbody.innerHTML = recent.map(task => `
        <tr class="clickable-row" onclick="openTaskModal(${task.id})">
            <td><span class="badge bg-secondary">${task.task_number || 'Z-' + task.id.toString().padStart(5, '0')}</span></td>
            <td>${Utils.escapeHtml(task.title)}</td>
            <td>${Utils.getStatusBadge(task.status)}</td>
            <td>${task.assigned_user_name || '<span class="text-muted">—</span>'}</td>
        </tr>
    `).join('');
}

// ============================================ 
// Tasks
// ============================================ 

window.loadTasks = async function() {
    try {
        const response = await api.get('/api/tasks?all_tasks=true&size=1000');
        if (response.ok) {
            const data = await response.json();
            tasks = data.items || [];
            renderTasks();
            updateDashboardStats();
            renderRecentTasks();
        }
    } catch (err) {
        console.error('Error loading tasks:', err);
    }
};

function renderTasks() {
    const tbody = document.getElementById('tasks-table');
    const statusFilter = document.getElementById('filter-status').value;
    const priorityFilter = document.getElementById('filter-priority').value;
    const userFilter = document.getElementById('filter-user').value;
    const searchFilter = document.getElementById('filter-search').value.toLowerCase();
    const dateFrom = document.getElementById('filter-date-from').value;
    const dateTo = document.getElementById('filter-date-to').value;
    
    let filtered = tasks;
    
    if (statusFilter) filtered = filtered.filter(t => t.status === statusFilter);
    if (priorityFilter) filtered = filtered.filter(t => t.priority == priorityFilter);
    if (userFilter === 'unassigned') filtered = filtered.filter(t => !t.assigned_user_id);
    else if (userFilter) filtered = filtered.filter(t => t.assigned_user_id == userFilter);
    
    if (searchFilter) {
        filtered = filtered.filter(t => 
            t.title.toLowerCase().includes(searchFilter) ||
            t.raw_address.toLowerCase().includes(searchFilter) ||
            (t.task_number || '').toLowerCase().includes(searchFilter)
        );
    }
    
    if (dateFrom) filtered = filtered.filter(t => new Date(t.created_at) >= new Date(dateFrom));
    if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        filtered = filtered.filter(t => new Date(t.created_at) <= toDate);
    }
    
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Заявки не найдены</td></tr>';
        return;
    }
    
    tbody.innerHTML = filtered.map(task => {
        const icons = [];
        if (task.is_remote) icons.push('<i class="bi bi-house-door text-warning" title="Удалённая"></i>');
        if (task.is_paid) icons.push('<i class="bi bi-currency-dollar text-success" title="Платная: ' + Utils.formatCurrency(task.payment_amount) + '"></i>');
        const iconsHtml = icons.length > 0 ? `<span class="ms-2">${icons.join(' ')}</span>` : '';
        
        return `
            <tr class="clickable-row" onclick="openTaskModal(${task.id})">
                <td><span class="badge bg-secondary">${task.task_number || 'Z-' + task.id.toString().padStart(5, '0')}</span></td>
                <td>${Utils.escapeHtml(task.title)}${iconsHtml}</td>
                <td class="text-truncate" style="max-width: 200px" title="${Utils.escapeHtml(task.raw_address)}">${Utils.escapeHtml(task.raw_address)}</td>
                <td>${Utils.getStatusBadge(task.status)}</td>
                <td>${Utils.getPriorityBadge(task.priority)}</td>
                <td>${task.assigned_user_name || '<span class="text-muted">—</span>'}</td>
                <td>${task.planned_date ? Utils.formatDate(task.planned_date).split(',')[0] : '<span class="text-muted">—</span>'}</td>
                <td>${Utils.formatDate(task.created_at)}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="event.stopPropagation(); openTaskModal(${task.id})">
                        <i class="bi bi-pencil"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

window.openTaskModal = function(taskId = null) {
    const deleteBtn = document.getElementById('btn-delete-task');
    const commentSection = document.getElementById('comment-input-section');
    const commentsContainer = document.getElementById('task-comments');
    
    // Populate user select
    const userSelect = document.getElementById('task-user');
    userSelect.innerHTML = '<option value="">Не назначен</option>' + 
        users.filter(u => u.role === 'worker').map(u => 
            `<option value="${u.id}">${Utils.escapeHtml(u.full_name || u.username)}</option>`
        ).join('');
    
    // Reset comments
    commentsContainer.innerHTML = '<div class="text-center text-muted py-4"><i class="bi bi-chat-dots fs-1 opacity-25"></i><p class="mt-2 mb-0">Нет комментариев</p></div>';
    document.getElementById('comments-count').textContent = '0';
    document.getElementById('new-comment').value = '';
    
    const isPaidCheckbox = document.getElementById('task-is-paid');
    const paymentAmountGroup = document.getElementById('payment-amount-group');
    isPaidCheckbox.onchange = function() {
        paymentAmountGroup.style.display = this.checked ? 'block' : 'none';
        if (!this.checked) document.getElementById('task-payment-amount').value = '';
    };
    
    if (taskId) {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        
        document.getElementById('taskModalTitle').textContent = `Заявка ${task.task_number || 'Z-' + task.id.toString().padStart(5, '0')}`;
        document.getElementById('task-id').value = task.id;
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-address').value = task.raw_address;
        document.getElementById('task-planned-date').value = task.planned_date ? task.planned_date.split('T')[0] : '';
        document.getElementById('task-description').value = task.description;
        document.getElementById('task-priority').value = task.priority;
        document.getElementById('task-status').value = task.status;
        document.getElementById('task-user').value = task.assigned_user_id || '';
        
        document.getElementById('task-is-remote').checked = task.is_remote || false;
        document.getElementById('task-is-paid').checked = task.is_paid || false;
        document.getElementById('task-payment-amount').value = task.payment_amount || '';
        paymentAmountGroup.style.display = task.is_paid ? 'block' : 'none';
        
        if (deleteBtn) deleteBtn.style.display = 'block';
        if (commentSection) commentSection.style.display = 'block';
        
        loadTaskComments(taskId);
        loadTaskPhotos(taskId);
    } else {
        document.getElementById('taskModalTitle').textContent = 'Новая заявка';
        document.getElementById('task-form').reset();
        document.getElementById('task-id').value = '';
        document.getElementById('task-planned-date').value = '';
        
        document.getElementById('task-is-remote').checked = false;
        document.getElementById('task-is-paid').checked = false;
        document.getElementById('task-payment-amount').value = '';
        paymentAmountGroup.style.display = 'none';
        
        if (deleteBtn) deleteBtn.style.display = 'none';
        if (commentSection) commentSection.style.display = 'none';
        
        document.getElementById('photos-section').style.display = 'none';
    }
    
    if (taskModal) taskModal.show();
};

async function loadTaskComments(taskId) {
    try {
        const response = await api.get(`/api/tasks/${taskId}/comments`);
        if (response.ok) {
            const comments = await response.json();
            renderComments(comments);
        }
    } catch (err) {
        console.error('Error loading comments:', err);
    }
}

function renderComments(comments) {
    const container = document.getElementById('task-comments');
    document.getElementById('comments-count').textContent = comments.length;
    
    if (comments.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-3"><i class="bi bi-chat-dots opacity-25" style="font-size: 2rem;"></i><p class="mt-2 mb-0 small">Нет комментариев</p></div>';
        return;
    }
    
    container.innerHTML = comments.map(c => {
        const isStatusChange = c.old_status && c.new_status;
        
        if (isStatusChange) {
            return `
                <div class="comment-item" style="background: linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%);">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <i class="bi bi-arrow-repeat text-primary me-1"></i>
                            <span class="comment-author">${Utils.escapeHtml(c.author)}</span>
                        </div>
                        <span class="comment-time">${Utils.formatDateTime(c.created_at)}</span>
                    </div>
                    <div class="comment-status-change">
                        ${Utils.escapeHtml(c.text)}
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="comment-item">
                <div class="d-flex justify-content-between align-items-center">
                    <span class="comment-author">
                        <i class="bi bi-person-circle me-1"></i>${Utils.escapeHtml(c.author)}
                    </span>
                    <span class="comment-time">${Utils.formatDateTime(c.created_at)}</span>
                </div>
                <div class="comment-text">${Utils.escapeHtml(c.text)}</div>
            </div>
        `;
    }).join('');
    
    container.scrollTop = container.scrollHeight;
}

window.addComment = async function() {
    const taskId = document.getElementById('task-id').value;
    const text = document.getElementById('new-comment').value.trim();
    
    if (!taskId || !text) return;
    
    try {
        const response = await api.post(`/api/tasks/${taskId}/comments`, { 
            text: text, 
            author: currentUser.full_name || currentUser.username 
        });
        
        if (response.ok) {
            document.getElementById('new-comment').value = '';
            loadTaskComments(taskId);
        }
    } catch (err) {
        console.error('Error adding comment:', err);
    }
};

async function saveTask() {
    const taskId = document.getElementById('task-id').value;
    const isPaid = document.getElementById('task-is-paid').checked;
    const data = {
        title: document.getElementById('task-title').value,
        address: document.getElementById('task-address').value,
        planned_date: document.getElementById('task-planned-date').value || null,
        description: document.getElementById('task-description').value,
        priority: parseInt(document.getElementById('task-priority').value),
        status: document.getElementById('task-status').value,
        assigned_user_id: document.getElementById('task-user').value || null,
        is_remote: document.getElementById('task-is-remote').checked,
        is_paid: isPaid,
        payment_amount: isPaid ? parseFloat(document.getElementById('task-payment-amount').value) || 0 : 0
    };
    
    try {
        let response;
        if (taskId) {
            response = await api.patch(`/api/admin/tasks/${taskId}`, data);
        } else {
            response = await api.post('/api/tasks', data);
        }
        
        if (response.ok) {
            taskModal?.hide();
            loadTasks();
            Utils.showToast('Заявка сохранена', 'success');
        } else {
            const error = await response.json();
            alert(error.detail || 'Ошибка сохранения');
        }
    } catch (err) {
        alert('Ошибка сохранения: ' + err.message);
    }
}

async function deleteTask() {
    const taskId = document.getElementById('task-id').value;
    if (!taskId || !confirm('Удалить заявку?')) return;
    
    try {
        const response = await api.delete(`/api/tasks/${taskId}`);
        if (response.ok) {
            taskModal?.hide();
            loadTasks();
            Utils.showToast('Заявка удалена', 'success');
        }
    } catch (err) {
        alert('Ошибка удаления: ' + err.message);
    }
}

// ============================================ 
// Import Task
// ============================================ 

window.openImportTaskModal = function() {
    document.getElementById('import-text').value = '';
    document.getElementById('import-preview').style.display = 'none';
    document.getElementById('import-error').style.display = 'none';
    document.getElementById('btn-create-from-import').style.display = 'none';
    
    const assigneeSelect = document.getElementById('import-assignee');
    assigneeSelect.innerHTML = '<option value="">Не назначен</option>' +
        users.filter(u => u.role === 'worker' || u.role === 'dispatcher').map(u =>
            `<option value="${u.id}">${Utils.escapeHtml(u.full_name || u.username)}</option>`
        ).join('');
    
    if (importTaskModal) importTaskModal.show();
};

window.parseImportText = async function() {
    const text = document.getElementById('import-text').value.trim();
    if (!text) {
        showImportError('Введите текст сообщения');
        return;
    }
    
    try {
        const response = await api.post('/api/tasks/parse', { text });
        const result = await response.json();
        
        if (result.success && result.data) {
            showImportPreview(result.data);
        } else {
            showImportError(result.error || 'Не удалось распознать формат сообщения');
        }
    } catch (err) {
        showImportError('Ошибка при распознавании: ' + err.message);
    }
};

function showImportPreview(data) {
    document.getElementById('import-error').style.display = 'none';
    document.getElementById('import-preview').style.display = 'block';
    document.getElementById('btn-create-from-import').style.display = 'block';
    
    document.getElementById('import-title').value = data.title || '';
    document.getElementById('import-address').value = data.address || '';
    document.getElementById('import-description').value = data.description || '';
    document.getElementById('import-priority').value = data.priority || 2;
    document.getElementById('import-phone').value = data.contact_phone || '';
    document.getElementById('import-apartment').value = data.apartment || '';
    document.getElementById('import-external-id').value = data.external_id || '';
}

function showImportError(message) {
    document.getElementById('import-preview').style.display = 'none';
    document.getElementById('btn-create-from-import').style.display = 'none';
    const errorEl = document.getElementById('import-error');
    errorEl.style.display = 'block';
    document.getElementById('import-error-text').textContent = message;
}

window.createTaskFromImport = async function() {
    const taskData = {
        title: document.getElementById('import-title').value,
        address: document.getElementById('import-address').value,
        description: document.getElementById('import-description').value,
        priority: parseInt(document.getElementById('import-priority').value),
        status: 'NEW'
    };
    
    const assigneeId = document.getElementById('import-assignee').value;
    if (assigneeId) taskData.assigned_user_id = parseInt(assigneeId);
    
    try {
        const response = await api.post('/api/tasks', taskData);
        if (response.ok) {
            importTaskModal?.hide();
            loadTasks();
            Utils.showToast('Заявка успешно создана из текста!', 'success');
        } else {
            const error = await response.json();
            showImportError(error.detail || 'Ошибка создания заявки');
        }
    } catch (err) {
        showImportError('Ошибка создания заявки: ' + err.message);
    }
};

// ============================================ 
// Users
// ============================================ 

window.loadUsers = async function() {
    try {
        const response = await api.get('/api/admin/users');
        if (response.ok) {
            users = await response.json();
            renderUsers();
            updateUserFilter();
            renderUsersSummary();
        }
    } catch (err) {
        console.error('Error loading users:', err);
    }
};

function renderUsers() {
    const tbody = document.getElementById('users-table');
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">Нет пользователей</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr class="clickable-row" onclick="openUserModal(${user.id})">
            <td>${user.id}</td>
            <td><code>${Utils.escapeHtml(user.username)}</code></td>
            <td>${Utils.escapeHtml(user.full_name) || '—'}</td>
            <td>${user.role === 'admin' ? '<span class="badge bg-danger">Админ</span>' : '<span class="badge bg-primary">Работник</span>'}</td>
            <td>${Utils.escapeHtml(user.email) || '—'}</td>
            <td>${Utils.escapeHtml(user.phone) || '—'}</td>
            <td><span class="badge bg-info">${user.assigned_tasks_count || 0}</span></td>
            <td>${user.is_active ? '<span class="badge bg-success">Активен</span>' : '<span class="badge bg-secondary">Заблокирован</span>'}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="event.stopPropagation(); openUserModal(${user.id})">
                    <i class="bi bi-pencil"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderUsersSummary() {
    const container = document.getElementById('users-summary');
    const workers = users.filter(u => u.role === 'worker' && u.is_active);
    
    if (workers.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-3">Нет активных работников</div>';
        return;
    }
    
    container.innerHTML = workers.map(user => `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <span>
                <i class="bi bi-person-circle me-2"></i>
                ${Utils.escapeHtml(user.full_name || user.username)}
            </span>
            <span class="badge bg-info">${user.assigned_tasks_count || 0} заявок</span>
        </div>
    `).join('');
}

function updateUserFilter() {
    const select = document.getElementById('filter-user');
    const workers = users.filter(u => u.role === 'worker');
    
    select.innerHTML = '<option value="">Все исполнители</option><option value="unassigned">Не назначены</option>';
    
    workers.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.full_name || user.username;
        select.appendChild(option);
    });
}

window.openUserModal = function(userId = null) {
    const deleteBtn = document.getElementById('btn-delete-user');
    const usernameInput = document.getElementById('user-username');
    
    if (userId) {
        const user = users.find(u => u.id === userId);
        if (!user) return;
        
        document.getElementById('userModalTitle').textContent = `Пользователь: ${user.username}`;
        document.getElementById('user-id').value = user.id;
        document.getElementById('user-username').value = user.username;
        document.getElementById('user-password').value = '';
        document.getElementById('user-fullname').value = user.full_name || '';
        document.getElementById('user-email').value = user.email || '';
        document.getElementById('user-phone').value = user.phone || '';
        document.getElementById('user-role').value = user.role;
        document.getElementById('user-active').value = user.is_active ? 'true' : 'false';
        usernameInput.readOnly = true;
        deleteBtn.style.display = user.id !== currentUser.id ? 'block' : 'none';
    } else {
        document.getElementById('userModalTitle').textContent = 'Новый пользователь';
        document.getElementById('user-form').reset();
        document.getElementById('user-id').value = '';
        usernameInput.readOnly = false;
        deleteBtn.style.display = 'none';
    }
    
    if (userModal) userModal.show();
};

async function saveUser() {
    const userId = document.getElementById('user-id').value;
    const data = {
        username: document.getElementById('user-username').value,
        full_name: document.getElementById('user-fullname').value,
        email: document.getElementById('user-email').value || null,
        phone: document.getElementById('user-phone').value || null,
        role: document.getElementById('user-role').value,
        is_active: document.getElementById('user-active').value === 'true'
    };
    
    const password = document.getElementById('user-password').value;
    if (password) data.password = password;
    
    try {
        let response;
        if (userId) {
            response = await api.patch(`/api/admin/users/${userId}`, data);
        } else {
            if (!password) {
                alert('Введите пароль для нового пользователя');
                return;
            }
            response = await api.post('/api/admin/users', data);
        }
        
        if (response.ok) {
            userModal?.hide();
            loadUsers();
            loadTasks();
            Utils.showToast('Пользователь сохранён', 'success');
        } else {
            const error = await response.json();
            alert(error.detail || 'Ошибка сохранения');
        }
    } catch (err) {
        alert('Ошибка сохранения: ' + err.message);
    }
}

async function deleteUser() {
    const userId = document.getElementById('user-id').value;
    if (!userId || !confirm('Удалить пользователя?')) return;
    
    try {
        const response = await api.delete(`/api/admin/users/${userId}`);
        if (response.ok) {
            userModal?.hide();
            loadUsers();
            Utils.showToast('Пользователь удалён', 'success');
        }
    } catch (err) {
        alert('Ошибка удаления: ' + err.message);
    }
}

// ============================================ 
// Devices
// ============================================ 

window.loadDevices = async function() {
    try {
        const response = await api.get('/api/admin/devices');
        if (response.ok) {
            devices = await response.json();
            renderDevices();
        }
    } catch (err) {
        console.error('Error loading devices:', err);
    }
};

function renderDevices() {
    const tbody = document.getElementById('devices-table');
    
    if (devices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Нет зарегистрированных устройств</td></tr>';
        return;
    }
    
    tbody.innerHTML = devices.map(device => `
        <tr>
            <td>${device.id}</td>
            <td>${Utils.escapeHtml(device.user_name || 'Неизвестный')}</td>
            <td>${Utils.escapeHtml(device.device_name || 'Устройство')}</td>
            <td><code class="text-truncate d-inline-block" style="max-width: 200px">${device.fcm_token.substring(0, 30)}...</code></td>
            <td>${Utils.formatDate(device.last_active)}</td>
            <td>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteDevice(${device.id})">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

window.deleteDevice = async function(deviceId) {
    if (!confirm('Удалить устройство?')) return;
    try {
        const response = await api.delete(`/api/admin/devices/${deviceId}`);
        if (response.ok) {
            loadDevices();
            Utils.showToast('Устройство удалено', 'success');
        }
    } catch (err) {
        alert('Ошибка удаления: ' + err.message);
    }
};

window.sendTestNotification = async function() {
    try {
        const response = await api.post('/api/notifications/test', {});
        const data = await response.json();
        if (response.ok) {
            Utils.showToast(`Уведомление отправлено: ${data.sent || 0} устройств`, 'success');
        } else {
            alert(data.detail || 'Ошибка отправки');
        }
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
};

// ============================================ 
// Settings
// ============================================ 

let systemSettings = {};

window.loadSettings = async function() {
    try {
        const response = await api.get('/api/devices');
        if (response.ok) {
            const data = await response.json();
            document.getElementById('firebase-status').className = 
                `alert ${data.firebase_enabled ? 'alert-success' : 'alert-warning'}`;
            document.getElementById('firebase-status').textContent = 
                data.firebase_enabled ? 'Firebase настроен ✓' : 'Firebase не настроен. Добавьте firebase-service-account.json';
        }
        
        document.getElementById('server-info').innerHTML = `
            <div class="mb-2"><strong>API:</strong> <a href="/docs" target="_blank">/docs</a></div>
            <div class="mb-2"><strong>Устройств:</strong> ${devices.length}</div>
            <div class="mb-2"><strong>Заявок:</strong> ${tasks.length}</div>
            <div class="mb-2"><strong>Пользователей:</strong> ${users.length}</div>
        `;
        
        await loadSystemSettings();
        await loadCustomFields();
        await loadPermissions();
        await loadCardLayout();
    } catch (err) {
        console.error('Error loading settings:', err);
    }
};

window.seedDatabase = async function() {
    if (!confirm('Создать тестовые заявки?')) return;
    try {
        const response = await api.post('/api/seed', {});
        if (response.ok) {
            loadTasks();
            Utils.showToast('Тестовые данные созданы', 'success');
        }
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
};

window.clearDatabase = async function() {
    if (!confirm('ВНИМАНИЕ! Все заявки будут удалены. Продолжить?')) return;
    try {
        const response = await api.delete('/api/admin/tasks/clear');
        if (response.ok) {
            loadTasks();
            Utils.showToast('База очищена', 'success');
        }
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
};

// ... [System Settings rendering logic - keeping mostly same but using api.put] 
// For brevity, assuming renderSettingInput, renderImageSettings etc are kept or adapted slightly. 
// I will implement a generic render and update for settings.

async function loadSystemSettings() {
    try {
        const response = await api.get('/api/admin/settings');
        if (response.ok) {
            const groups = await response.json();
            systemSettings = {};
            groups.forEach(group => {
                group.settings.forEach(setting => systemSettings[setting.key] = setting);
            });
            renderAllSettings();
        }
    } catch (err) {
        console.error('Error loading system settings:', err);
    }
}

function renderAllSettings() {
    renderSettingsForm('image-settings-form', ['image_optimization_enabled', 'image_quality', 'image_max_dimension', 'image_convert_to_webp']);
    renderSettingsForm('backup-settings-form', ['backup_enabled', 'backup_retention_days', 'backup_include_photos']);
    renderSettingsForm('notification-settings-form', ['push_enabled', 'notify_on_new_task', 'notify_on_status_change']);
    renderSettingsForm('security-settings-form', ['rate_limit_attempts', 'rate_limit_window', 'session_timeout_hours']);
    renderSettingsForm('interface-settings', ['tasks_per_page', 'auto_refresh_interval', 'default_task_priority']);
    
    loadBackupList();
}

function renderSettingsForm(containerId, keys) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const html = keys
        .filter(key => systemSettings[key])
        .map(key => renderSettingInput(systemSettings[key]))
        .join('');
    
    container.innerHTML = html || '<p class="text-muted">Нет настроек</p>';
}

function renderSettingInput(setting) {
    const id = `setting-${setting.key}`;
    const disabled = setting.is_readonly ? 'disabled' : '';
    
    if (setting.value_type === 'bool') {
        return `
            <div class="form-check form-switch mb-3">
                <input class="form-check-input" type="checkbox" id="${id}" 
                    ${setting.value ? 'checked' : ''} ${disabled}
                    onchange="updateSetting('${setting.key}', this.checked)">
                <label class="form-check-label" for="${id}">
                    ${setting.label}
                    <small class="text-muted d-block">${setting.description || ''}</small>
                </label>
            </div>
        `;
    } else if (setting.value_type === 'select' && setting.options) {
        const options = setting.options.map(opt => 
            `<option value="${opt.value}" ${setting.value == opt.value ? 'selected' : ''}>${opt.label}</option>`
        ).join('');
        return `
            <div class="mb-3">
                <label class="form-label" for="${id}">${setting.label}</label>
                <select class="form-select" id="${id}" ${disabled}
                    onchange="updateSetting('${setting.key}', this.value)">
                    ${options}
                </select>
                <small class="text-muted">${setting.description || ''}</small>
            </div>
        `;
    } else {
        const type = setting.value_type === 'int' ? 'number' : 'text';
        return `
            <div class="mb-3">
                <label class="form-label" for="${id}">${setting.label}</label>
                <input type="${type}" class="form-control" id="${id}" value="${setting.value || ''}" ${disabled}
                    onchange="updateSetting('${setting.key}', this.type === 'number' ? parseInt(this.value) : this.value)">
                <small class="text-muted">${setting.description || ''}</small>
            </div>
        `;
    }
}

window.updateSetting = async function(key, value) {
    try {
        const response = await api.patch(`/api/admin/settings/${key}`, { value });
        if (response.ok) {
            systemSettings[key].value = value;
            Utils.showToast('Настройка сохранена', 'success');
        } else {
            const err = await response.json();
            Utils.showToast(err.detail || 'Ошибка сохранения', 'danger');
        }
    } catch (err) {
        Utils.showToast('Ошибка сохранения', 'danger');
    }
};

// ============================================ 
// Finance
// ============================================ 

let workerStats = [];

window.loadFinanceData = async function() {
    if (users.length === 0) return;
    
    // Populate filter
    const userFilter = document.getElementById('finance-user-filter');
    if (userFilter && userFilter.options.length <= 1) {
        userFilter.innerHTML = '<option value="">Все исполнители</option>' + 
            users.filter(u => u.role === 'worker').map(u => 
                `<option value="${u.id}">${Utils.escapeHtml(u.full_name || u.username)}</option>`
            ).join('');
    }
    
    workerStats = [];
    const workers = users.filter(u => u.role === 'worker');
    
    for (const worker of workers) {
        try {
            const response = await api.get(`/api/admin/users/${worker.id}/stats`);
            if (response.ok) {
                const stats = await response.json();
                workerStats.push(stats);
            }
        } catch (err) {
            console.error('Error loading stats:', err);
        }
    }
    
    renderFinanceData();
};

function renderFinanceData() {
    const period = document.getElementById('finance-period').value;
    const selectedUserId = document.getElementById('finance-user-filter').value;
    
    let filteredStats = selectedUserId 
        ? workerStats.filter(s => s.user_id == selectedUserId)
        : workerStats;
    
    let totalCompleted = 0, totalPaid = 0, totalRemote = 0, totalAmount = 0;
    
    filteredStats.forEach(stats => {
        if (period === 'week') {
            totalCompleted += stats.completed_this_week || 0;
            totalAmount += stats.earnings_this_week || 0;
            totalPaid += stats.paid_tasks_count || 0;
            totalRemote += stats.remote_tasks_count || 0;
        } else if (period === 'month') {
            totalCompleted += stats.completed_this_month || 0;
            totalAmount += stats.earnings_this_month || 0;
            totalPaid += stats.paid_tasks_count || 0;
            totalRemote += stats.remote_tasks_count || 0;
        } else {
            totalCompleted += stats.completed_tasks || 0;
            totalPaid += stats.paid_tasks_count || 0;
            totalRemote += stats.remote_tasks_count || 0;
            totalAmount += stats.total_earnings || 0;
        }
    });
    
    document.getElementById('finance-completed-tasks').textContent = totalCompleted;
    document.getElementById('finance-paid-tasks').textContent = totalPaid;
    document.getElementById('finance-remote-tasks').textContent = totalRemote;
    document.getElementById('finance-total-amount').textContent = Utils.formatCurrency(totalAmount);
    
    const tbody = document.getElementById('finance-workers-table');
    if (filteredStats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Нет данных</td></tr>';
        return;
    }
    
    tbody.innerHTML = filteredStats.map(stats => {
        const earnings = period === 'week' ? stats.earnings_this_week 
            : period === 'month' ? stats.earnings_this_month 
            : stats.total_earnings;
        const completed = period === 'week' ? stats.completed_this_week
            : period === 'month' ? stats.completed_this_month
            : stats.completed_tasks;
            
        return `
            <tr>
                <td>
                    <strong>${Utils.escapeHtml(stats.full_name || stats.username)}</strong>
                    <div class="small text-muted">@${Utils.escapeHtml(stats.username)}</div>
                </td>
                <td>${stats.total_tasks}</td>
                <td><span class="text-success">${completed}</span></td>
                <td><span class="text-warning">${stats.in_progress_tasks}</span></td>
                <td><span class="text-primary">${stats.paid_tasks_count}</span></td>
                <td><span class="text-info">${stats.remote_tasks_count}</span></td>
                <td><strong class="text-success">${Utils.formatCurrency(earnings)}</strong></td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="showUserDetails(${stats.user_id})">
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

window.showUserDetails = function(userId) {
    const stats = workerStats.find(s => s.user_id === userId);
    if (!stats) return;
    alert(`Статистика: ${stats.full_name}\n\nВсего: ${stats.total_tasks}\nЗаработано: ${Utils.formatCurrency(stats.total_earnings)}`);
};

// ============================================ 
// Photos Logic
// ============================================ 

let photoObjectUrls = [];

function revokePhotoObjectUrls() {
    photoObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    photoObjectUrls = [];
}

async function fetchPhotoBlobUrl(photoUrl) {
    const token = auth.getToken();
    const headers = {};
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(photoUrl, { headers });
    if (!response.ok) {
        throw new Error(`Failed to load photo: ${response.status}`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    photoObjectUrls.push(objectUrl);
    return objectUrl;
}

async function hydratePhotoThumbnails(container) {
    const images = container.querySelectorAll('img[data-photo-url]');
    await Promise.all(Array.from(images).map(async (img) => {
        const photoUrl = img.dataset.photoUrl;
        if (!photoUrl) return;
        try {
            const objectUrl = await fetchPhotoBlobUrl(photoUrl);
            img.src = objectUrl;
            img.onclick = () => window.open(objectUrl, '_blank');
        } catch (err) {
            console.error('Error loading photo:', err);
            img.classList.add('photo-load-failed');
        }
    }));
}

async function loadTaskPhotos(taskId) {
    const section = document.getElementById('photos-section');
    const container = document.getElementById('task-photos');
    section.style.display = 'block';
    
    try {
        const response = await api.get(`/api/tasks/${taskId}/photos`);
        if (response.ok) {
            const photos = await response.json();
            renderPhotos(photos);
        }
    } catch (err) {
        container.innerHTML = '<div class="text-center text-muted">Ошибка загрузки</div>';
    }
}

function renderPhotos(photos) {
    const container = document.getElementById('task-photos');
    document.getElementById('photos-count').textContent = photos.length;
    revokePhotoObjectUrls();
    
    if (photos.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-4 w-100"><i class="bi bi-image fs-2 opacity-25"></i><p class="mt-2 mb-0 small">Нет фотографий</p></div>';
        return;
    }
    
    container.innerHTML = photos.map(photo => `
        <div class="photo-wrapper">
            <div class="photo-img-container">
                <img src="data:," data-photo-url="${photo.url}" class="photo-thumbnail">
                <div class="photo-actions">
                     <button class="photo-action-btn delete" onclick="event.stopPropagation(); deletePhoto(${photo.id})"><i class="bi bi-trash"></i></button>
                </div>
            </div>
            <span class="photo-type-badge">${photo.photo_type}</span>
        </div>
    `).join('');
    
    hydratePhotoThumbnails(container).catch((err) => console.error(err));
}

window.deletePhoto = async function(photoId) {
    if (!confirm('Удалить фото?')) return;
    try {
        const response = await api.delete(`/api/photos/${photoId}`);
        if (response.ok) {
            Utils.showToast('Фото удалено', 'success');
            const taskId = document.getElementById('task-id').value;
            if (taskId) loadTaskPhotos(taskId);
        }
    } catch (err) {
        Utils.showToast('Ошибка удаления', 'danger');
    }
};

// ============================================ 
// Backup Logic
// ============================================ 

async function loadBackupList() {
    const container = document.getElementById('backup-list');
    if (!container) return;
    try {
        const response = await api.get('/api/admin/backups');
        if (response.ok) {
            const data = await response.json();
            if (data.backups.length === 0) {
                container.innerHTML = '<p class="text-muted text-center">Бэкапов нет</p>';
                return;
            }
            container.innerHTML = data.backups.map(b => `
                <div class="d-flex justify-content-between border-bottom py-2">
                    <span>${b.name}</span>
                    <small class="text-muted">${Utils.formatFileSize(b.size)}</small>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error(err);
    }
}

window.runBackup = async function() {
    if (!confirm('Создать бэкап?')) return;
    try {
        const response = await api.post('/api/admin/backups', {});
        if (response.ok) {
            Utils.showToast('Бэкап создан', 'success');
            loadBackupList();
        }
    } catch (err) {
        Utils.showToast('Ошибка', 'danger');
    }
};

// ============================================ 
// Custom Fields & Permissions & Layout
// ============================================ 
// These sections are simplified for brevity but follow the same pattern

let customFields = [];
window.loadCustomFields = async function() {
    try {
        const response = await api.get('/api/admin/custom-fields');
        if (response.ok) {
            customFields = await response.json();
            renderCustomFieldsList();
        }
    } catch (err) { console.error(err); }
};

function renderCustomFieldsList() {
    const container = document.getElementById('custom-fields-list');
    if (!container) return;
    if (customFields.length === 0) {
        container.innerHTML = '<div class="text-center text-muted">Нет полей</div>';
        return;
    }
    container.innerHTML = `<table class="table"><tbody>${customFields.map(f => `
        <tr>
            <td>${Utils.escapeHtml(f.label)}</td>
            <td><code>${f.name}</code></td>
            <td>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteCustomField(${f.id})"><i class="bi bi-trash"></i></button>
            </td>
        </tr>
    `).join('')}</tbody></table>`;
}

window.showAddFieldModal = function() {
    if (customFieldModal) customFieldModal.show();
};

window.saveCustomField = async function() {
    const data = {
        name: document.getElementById('field-name').value,
        label: document.getElementById('field-label').value,
        field_type: document.getElementById('field-type').value,
        is_required: document.getElementById('field-required').checked,
        show_in_list: document.getElementById('field-show-list').checked,
        show_in_card: document.getElementById('field-show-card').checked
    };
    try {
        const response = await api.post('/api/admin/custom-fields', data);
        if (response.ok) {
            customFieldModal.hide();
            loadCustomFields();
            Utils.showToast('Поле создано', 'success');
        }
    } catch (err) { Utils.showToast('Ошибка', 'danger'); }
};

window.deleteCustomField = async function(id) {
    if (!confirm('Удалить поле?')) return;
    await api.delete(`/api/admin/custom-fields/${id}`);
    loadCustomFields();
};

// ============================================ 
// Permissions
// ============================================ 

let rolePermissions = {};
const permissionLabels = {
    'view_dashboard': 'Просмотр дашборда',
    'view_tasks': 'Просмотр заявок',
    'create_tasks': 'Создание заявок',
    'edit_tasks': 'Редактирование заявок',
    'delete_tasks': 'Удаление заявок',
    'change_task_status': 'Изменение статуса заявки',
    'assign_tasks': 'Назначение исполнителя',
    'view_photos': 'Просмотр фото',
    'add_photos': 'Добавление фото',
    'delete_photos': 'Удаление фото',
    'view_comments': 'Просмотр комментариев',
    'add_comments': 'Добавление комментариев',
    'view_users': 'Просмотр пользователей',
    'edit_users': 'Редактирование пользователей',
    'view_finance': 'Просмотр финансов',
    'view_devices': 'Просмотр устройств',
    'view_settings': 'Просмотр настроек',
    'view_custom_fields': 'Просмотр полей заявок',
    'edit_custom_fields': 'Редактирование полей заявок'
};
const roleLabels = { 'admin': 'Администратор', 'dispatcher': 'Диспетчер', 'worker': 'Работник' };

window.loadPermissions = async function() {
    try {
        const response = await api.get('/api/admin/permissions');
        if (response.ok) {
            rolePermissions = await response.json();
            renderPermissionsTable();
        }
    } catch (err) { console.error('Error loading permissions:', err); }
};

function renderPermissionsTable() {
    const container = document.getElementById('permissions-table');
    if (!container) return;
    const roles = ['admin', 'dispatcher', 'worker'];
    const permissions = Object.keys(permissionLabels);
    
    container.innerHTML = `
        <div class="table-responsive">
            <table class="table table-bordered">
                <thead class="table-light">
                    <tr><th>Разрешение</th>${roles.map(role => `<th class="text-center">${roleLabels[role]}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${permissions.map(perm => `
                        <tr>
                            <td>${permissionLabels[perm]}</td>
                            ${roles.map(role => {
                                const isAllowed = rolePermissions[role] && rolePermissions[role][perm];
                                const disabled = role === 'admin' ? 'disabled' : '';
                                return `<td class="text-center"><input type="checkbox" class="form-check-input" ${isAllowed ? 'checked' : ''} ${disabled} onchange="updatePermission('${role}', '${perm}', this.checked)"></td>`;
                            }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        <div class="alert alert-info mt-3"><i class="bi bi-info-circle me-2"></i>Права администратора изменить нельзя.</div>
    `;
}

window.updatePermission = async function(role, permission, isAllowed) {
    try {
        const response = await api.patch(`/api/admin/permissions/${role}`, { permissions: { [permission]: isAllowed } });
        if (response.ok) {
            if (!rolePermissions[role]) rolePermissions[role] = {};
            rolePermissions[role][permission] = isAllowed;
            Utils.showToast('Права обновлены', 'success');
        } else {
            Utils.showToast('Ошибка обновления', 'danger');
            loadPermissions();
        }
    } catch (err) { Utils.showToast('Ошибка обновления', 'danger'); }
};

// ============================================ 
// Card Builder
// ============================================ 

const systemFields = [
    { id: 'task_number', name: 'task_number', label: 'Номер заявки', type: 'system', icon: 'bi-hash' },
    { id: 'title', name: 'title', label: 'Заголовок', type: 'system', icon: 'bi-card-heading' },
    { id: 'status', name: 'status', label: 'Статус', type: 'system', icon: 'bi-flag' },
    { id: 'priority', name: 'priority', label: 'Приоритет', type: 'system', icon: 'bi-exclamation-triangle' },
    { id: 'address', name: 'address', label: 'Адрес', type: 'system', icon: 'bi-geo-alt' },
    { id: 'description', name: 'description', label: 'Описание', type: 'system', icon: 'bi-text-paragraph' },
    { id: 'phone', name: 'phone', label: 'Телефон', type: 'system', icon: 'bi-telephone' },
    { id: 'assignee', name: 'assignee', label: 'Исполнитель', type: 'system', icon: 'bi-person' },
    { id: 'created_at', name: 'created_at', label: 'Дата создания', type: 'system', icon: 'bi-calendar' },
    { id: 'planned_date', name: 'planned_date', label: 'Плановая дата', type: 'system', icon: 'bi-calendar-check' },
    { id: 'is_paid', name: 'is_paid', label: 'Платная', type: 'system', icon: 'bi-currency-dollar' },
    { id: 'amount', name: 'amount', label: 'Сумма', type: 'system', icon: 'bi-cash' }
];

let cardLayout = { header: ['priority', 'task_number', 'status'], main: ['title', 'address', 'phone'], details: ['description', 'assignee'], footer: ['created_at', 'planned_date', 'is_paid'] };
let allAvailableFields = [];
let draggedField = null;

window.loadCardLayout = async function() {
    try {
        const response = await api.get('/api/admin/settings/card_layout');
        if (response.ok) {
            const data = await response.json();
            if (data.value) {
                cardLayout = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
            }
        }
    } catch (err) { console.log('Using default card layout'); }
    
    allAvailableFields = [...systemFields];
    customFields.forEach(cf => {
        if (cf.is_active) {
            allAvailableFields.push({ id: 'custom_' + cf.name, name: cf.name, label: cf.label, type: 'custom', icon: 'bi-input-cursor' });
        }
    });
    renderAvailableFields();
    renderCardPreview();
};

function renderAvailableFields() {
    const container = document.getElementById('available-fields-list');
    if (!container) return;
    const fieldsInUse = new Set([...cardLayout.header, ...cardLayout.main, ...cardLayout.details, ...cardLayout.footer]);
    container.innerHTML = allAvailableFields.map(field => {
        const inUse = fieldsInUse.has(field.id);
        return `
            <div class="field-item ${inUse ? 'in-use' : ''}" draggable="${!inUse}" data-field-id="${field.id}" ondragstart="onFieldDragStart(event)" ondragend="onFieldDragEnd(event)">
                <div class="field-icon ${field.type}"><i class="bi ${field.icon}"></i></div>
                <div class="field-info"><div class="field-name">${Utils.escapeHtml(field.label)}</div></div>
                <div class="field-actions">${!inUse ? `<button class="btn btn-outline-primary btn-sm" onclick="addFieldToZone('${field.id}')"><i class="bi bi-plus"></i></button>` : `<button class="btn btn-outline-secondary btn-sm" disabled><i class="bi bi-check"></i></button>`}</div>
            </div>`;
    }).join('');
}

function renderCardPreview() {
    ['header', 'main', 'details', 'footer'].forEach(zone => renderZone(zone, cardLayout[zone]));
}

function renderZone(zoneName, fieldIds) {
    const container = document.getElementById(`zone-${zoneName}`);
    if (!container) return;
    if (fieldIds.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = fieldIds.map((fieldId, index) => {
        const field = allAvailableFields.find(f => f.id === fieldId);
        if (!field) return '';
        return `
            <div class="preview-field" draggable="true" data-field-id="${fieldId}" data-zone="${zoneName}" data-index="${index}" ondragstart="onPreviewFieldDragStart(event)" ondragend="onFieldDragEnd(event)">
                <span class="drag-handle"><i class="bi bi-grip-vertical"></i></span>
                <span class="preview-label">${Utils.escapeHtml(field.label)}:</span>
                <span class="preview-value">...</span>
                <button class="remove-field" onclick="removeFieldFromZone('${zoneName}', '${fieldId}')"><i class="bi bi-x"></i></button>
            </div>`;
    }).join('');
}

window.onFieldDragStart = function(event) {
    draggedField = { id: event.target.dataset.fieldId, source: 'available' };
    event.target.classList.add('dragging');
};

window.onPreviewFieldDragStart = function(event) {
    draggedField = { id: event.target.dataset.fieldId, source: 'preview', zone: event.target.dataset.zone, index: parseInt(event.target.dataset.index) };
    event.target.classList.add('dragging');
    event.stopPropagation();
};

window.onFieldDragEnd = function(event) {
    event.target.classList.remove('dragging');
    draggedField = null;
    document.querySelectorAll('.preview-card').forEach(el => el.classList.remove('drag-over'));
};

window.setupDropZones = function() {
    ['header', 'main', 'details', 'footer'].forEach(zoneName => {
        const zoneEl = document.getElementById(`zone-${zoneName}`);
        if (!zoneEl) return;
        const card = zoneEl.closest('.preview-card');
        if (!card) return;
        
        card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('drag-over'); });
        card.addEventListener('dragleave', (e) => { if (!card.contains(e.relatedTarget)) card.classList.remove('drag-over'); });
        card.addEventListener('drop', (e) => {
            e.preventDefault();
            card.classList.remove('drag-over');
            if (!draggedField) return;
            
            if (draggedField.source === 'available') {
                if (!cardLayout[zoneName].includes(draggedField.id)) cardLayout[zoneName].push(draggedField.id);
            } else if (draggedField.source === 'preview') {
                cardLayout[draggedField.zone] = cardLayout[draggedField.zone].filter(id => id !== draggedField.id);
                cardLayout[zoneName].push(draggedField.id);
            }
            renderAvailableFields();
            renderCardPreview();
        });
    });
};

window.addFieldToZone = function(fieldId) {
    if (!cardLayout.main.includes(fieldId)) cardLayout.main.push(fieldId);
    renderAvailableFields();
    renderCardPreview();
};

window.removeFieldFromZone = function(zoneName, fieldId) {
    cardLayout[zoneName] = cardLayout[zoneName].filter(id => id !== fieldId);
    renderAvailableFields();
    renderCardPreview();
};

window.resetCardLayout = function() {
    if (!confirm('Сбросить раскладку?')) return;
    cardLayout = { header: ['priority', 'task_number', 'status'], main: ['title', 'address', 'phone'], details: ['description', 'assignee'], footer: ['created_at', 'planned_date', 'is_paid'] };
    renderAvailableFields();
    renderCardPreview();
};

window.saveCardLayout = async function() {
    try {
        const response = await api.patch('/api/admin/settings/card_layout', { value: cardLayout });
        if (response.ok) Utils.showToast('Сохранено', 'success');
        else Utils.showToast('Ошибка сохранения', 'danger');
    } catch (err) { Utils.showToast('Ошибка сохранения', 'danger'); }
};
