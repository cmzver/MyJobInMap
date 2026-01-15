/**
 * Utilities Module
 */

export const Utils = {
    // String helpers
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Date formatting
    formatDate(dateStr) {
        if (!dateStr) return '—';
        const date = new Date(dateStr);
        return date.toLocaleDateString('ru-RU', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric'
        });
    },

    formatDateTime(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('ru-RU', { 
            day: '2-digit', 
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    },

    formatCurrency(amount) {
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            minimumFractionDigits: 0
        }).format(amount || 0);
    },

    // UI Helpers
    showToast(message, type = 'info') {
        // Remove existing toasts if too many
        const existingToasts = document.querySelectorAll('.toast-container .toast');
        if (existingToasts.length > 3) {
            existingToasts[0].remove();
        }

        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            container.style.zIndex = '9999';
            document.body.appendChild(container);
        }

        const bgColors = {
            'success': 'bg-success text-white',
            'danger': 'bg-danger text-white',
            'warning': 'bg-warning',
            'info': 'bg-primary text-white'
        };
        const bgClass = bgColors[type] || bgColors['info'];
        
        const icon = type === 'success' ? 'bi-check-circle' : 
                     type === 'danger' ? 'bi-exclamation-circle' : 'bi-info-circle';

        const toastHtml = `
            <div class="toast show ${bgClass}" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="bi ${icon} me-2"></i>${message}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                </div>
            </div>
        `;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = toastHtml;
        const toastEl = wrapper.firstElementChild;
        container.appendChild(toastEl);

        setTimeout(() => {
            toastEl.classList.remove('show');
            setTimeout(() => toastEl.remove(), 300);
        }, 3000);
    },

    // Badges
    getStatusBadge(status) {
        const badges = {
            'NEW': '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">Новая</span>',
            'IN_PROGRESS': '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">В работе</span>',
            'DONE': '<span class="badge bg-success-subtle text-success border border-success-subtle">Выполнена</span>',
            'CANCELLED': '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">Отменена</span>'
        };
        // Fallback for old styles if needed, or mapping to specific classes
        const oldBadges = {
             'NEW': '<span class="badge-status badge-new">Новая</span>',
             'IN_PROGRESS': '<span class="badge-status badge-progress">В работе</span>',
             'DONE': '<span class="badge-status badge-done">Выполнена</span>',
             'CANCELLED': '<span class="badge-status badge-cancelled">Отменена</span>'
        };
        
        return oldBadges[status] || badges[status] || status;
    },

    getPriorityBadge(priority) {
        const badges = {
            1: '<span class="text-success"><i class="bi bi-calendar3"></i> Плановая</span>',
            2: '<span class="text-primary"><i class="bi bi-clock"></i> Текущая</span>',
            3: '<span class="text-warning"><i class="bi bi-exclamation-triangle"></i> Срочная</span>',
            4: '<span class="text-danger fw-bold"><i class="bi bi-lightning-fill"></i> Аварийная</span>'
        };
        // Use simpler HTML for reusability, CSS classes handle styling
         const badgesHtml = {
            1: '<span class="badge-priority p1">Плановая</span>',
            2: '<span class="badge-priority p2">Текущая</span>',
            3: '<span class="badge-priority p3">Срочная</span>',
            4: '<span class="badge-priority p4">Аварийная</span>'
        };
        return badgesHtml[priority] || priority;
    },
    
    // Modal Helpers
    setupModalFocusHandler(modalEl) {
        if (modalEl) {
            modalEl.addEventListener('hide.bs.modal', function() {
                const focusedEl = modalEl.querySelector(':focus');
                if (focusedEl) {
                    focusedEl.blur();
                }
            });
        }
    }
};
