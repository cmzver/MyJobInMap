/**
 * API Client Module
 */

const API_BASE = '';

export class ApiClient {
    constructor(authModule) {
        this.auth = authModule;
    }

    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        const token = this.auth.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        try {
            const response = await fetch(`${API_BASE}${endpoint}`, {
                ...options,
                headers
            });
            
            if (response.status === 401) {
                this.auth.logout();
                throw new Error('Unauthorized');
            }
            
            return response;
        } catch (error) {
            console.error('API Request failed:', error);
            throw error;
        }
    }

    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    async post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    async put(endpoint, body) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }

    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    // Helper for file uploads
    async upload(endpoint, formData) {
        const headers = {};
        const token = this.auth.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        // Note: Content-Type is set automatically for FormData
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers,
            body: formData
        });

        if (response.status === 401) {
            this.auth.logout();
            throw new Error('Unauthorized');
        }

        return response;
    }
}
