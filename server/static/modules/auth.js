/**
 * Authentication Module
 */

export class Auth {
    constructor(tokenKey = 'token', userKey = 'user', loginUrl = '/admin/login') {
        this.tokenKey = tokenKey;
        this.userKey = userKey;
        this.loginUrl = loginUrl;
        this.currentUser = this.loadUser();
    }

    getToken() {
        return localStorage.getItem(this.tokenKey);
    }

    loadUser() {
        try {
            return JSON.parse(localStorage.getItem(this.userKey) || 'null');
        } catch {
            return null;
        }
    }

    getUser() {
        return this.currentUser;
    }

    isAuthenticated() {
        return !!this.getToken();
    }

    checkRole(role) {
        return this.currentUser && this.currentUser.role === role;
    }

    saveSession(token, user) {
        localStorage.setItem(this.tokenKey, token);
        localStorage.setItem(this.userKey, JSON.stringify(user));
        this.currentUser = user;
    }

    logout() {
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.userKey);
        this.currentUser = null;
        window.location.href = this.loginUrl;
    }

    async login(username, password, apiBase = '') {
        const response = await fetch(`${apiBase}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
        });

        const data = await response.json();

        if (response.ok && data.access_token) {
            return data;
        } else {
            throw new Error(data.detail || 'Ошибка авторизации');
        }
    }

    async fetchMe(apiClient) {
        const response = await apiClient.get('/api/auth/me');
        if (response.ok) {
            const user = await response.json();
            // Update stored user but keep token
            localStorage.setItem(this.userKey, JSON.stringify(user));
            this.currentUser = user;
            return user;
        }
        throw new Error('Failed to fetch user info');
    }
}
