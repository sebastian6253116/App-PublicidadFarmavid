// api.js — Cliente HTTP del panel.
// Inyecta el token RAW en Authorization (el servidor lo compara literal, SIN "Bearer"),
// centraliza el manejo de 401 y expone la subida con progreso via XMLHttpRequest.
(function (window, document) {
    'use strict';

    var TOKEN_KEY = 'admin_token';
    var USER_KEY = 'admin_user';
    var LOGIN_URL = '/login.html';

    function getToken() { return window.localStorage.getItem(TOKEN_KEY); }
    function getUser() { return window.localStorage.getItem(USER_KEY); }

    // Limpia la sesion y vuelve al login. Idempotente.
    function logout() {
        window.localStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(USER_KEY);
        window.location.href = LOGIN_URL;
    }

    // Headers con el token tal cual lo espera el servidor (raw, sin prefijo).
    function authHeaders(extra) {
        var headers = {};
        if (extra) {
            Object.keys(extra).forEach(function (key) { headers[key] = extra[key]; });
        }
        var token = getToken();
        if (token) headers.Authorization = token;
        return headers;
    }

    function apiError(message, status) {
        var error = new Error(message || 'Error de conexión');
        error.status = status || 0;
        return error;
    }

    async function parseBody(response) {
        var text = await response.text();
        if (!text) return null;
        try { return JSON.parse(text); } catch (e) { return null; }
    }

    async function handleResponse(response) {
        // Cualquier 401 cierra la sesion y manda al login.
        if (response.status === 401) {
            logout();
            throw apiError('Sesión expirada', 401);
        }
        var data = await parseBody(response);
        if (!response.ok) {
            throw apiError((data && data.message) || 'Error del servidor (' + response.status + ')', response.status);
        }
        return data;
    }

    async function request(method, url, body) {
        var options = { method: method, headers: authHeaders() };
        if (body !== undefined) {
            options.headers = authHeaders({ 'Content-Type': 'application/json' });
            options.body = JSON.stringify(body);
        }

        var response;
        try {
            response = await fetch(url, options);
        } catch (e) {
            throw apiError('No se pudo conectar con el servidor', 0);
        }
        return handleResponse(response);
    }

    function get(url) { return request('GET', url); }
    function post(url, body) { return request('POST', url, body); }
    function put(url, body) { return request('PUT', url, body); }
    function del(url) { return request('DELETE', url); }

    // Subida multipart con progreso real (fetch no expone progreso de subida).
    function upload(url, formData, onProgress) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', url);

            var token = getToken();
            if (token) xhr.setRequestHeader('Authorization', token); // raw, sin "Bearer"

            if (xhr.upload && typeof onProgress === 'function') {
                xhr.upload.onprogress = function (event) {
                    if (event.lengthComputable) {
                        onProgress(Math.round((event.loaded / event.total) * 100));
                    }
                };
            }

            xhr.onload = function () {
                if (xhr.status === 401) {
                    logout();
                    reject(apiError('Sesión expirada', 401));
                    return;
                }
                var data = null;
                try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(data);
                } else {
                    reject(apiError((data && data.message) || 'Error de subida', xhr.status));
                }
            };

            xhr.onerror = function () {
                reject(apiError('Error de conexión o subida fallida', 0));
            };

            xhr.send(formData);
        });
    }

    window.FV = window.FV || {};
    window.FV.api = {
        getToken: getToken,
        getUser: getUser,
        logout: logout,
        get: get,
        post: post,
        put: put,
        del: del,
        upload: upload
    };
})(window, document);
