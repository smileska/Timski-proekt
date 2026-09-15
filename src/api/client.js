const BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const TOKEN_KEY = 'fitfuel_token';

export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
    onUnauthorized = fn;
}

async function request(path, { method = 'GET', body, headers = {}, raw } = {}) {
    const token = getToken();
    const opts = { method, headers: { ...headers } };

    if (raw) {
        opts.body = raw; // FormData — let the browser set Content-Type
    } else if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    if (token) opts.headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${BASE}${path}`, opts);
    let data = null;
    try {
        data = await res.json();
    } catch {
        /* no body */
    }

    if (res.status === 401) {
        onUnauthorized();
    }
    if (!res.ok) {
        const err = new Error((data && data.error) || `Request failed (${res.status})`);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

export const api = {
    base: BASE,
    get: (p) => request(p),
    post: (p, body) => request(p, { method: 'POST', body }),
    put: (p, body) => request(p, { method: 'PUT', body }),
    del: (p) => request(p, { method: 'DELETE' }),
    upload: (p, formData) => request(p, { method: 'POST', raw: formData }),
};
