// ui.js — Utilidades de interfaz del panel (toasts, modales, confirmaciones).
// Reutiliza sólo clases del design system (css/app.css). Sin dependencias externas.
(function (window, document) {
    'use strict';

    var TOAST_ICONS = { success: '\u2713', error: '\u2715', info: '\u2139' };

    // Escapa texto para contextos donde se construya HTML por cadena.
    // La regla del panel es usar textContent; esto queda como red de seguridad.
    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Crea un elemento con clases, texto y atributos sin usar innerHTML.
    function el(tag, options, children) {
        var node = document.createElement(tag);
        var opts = options || {};

        if (opts.className) node.className = opts.className;
        if (opts.text != null) node.textContent = String(opts.text);

        if (opts.attrs) {
            Object.keys(opts.attrs).forEach(function (key) {
                var value = opts.attrs[key];
                if (value != null) node.setAttribute(key, String(value));
            });
        }

        if (opts.props) {
            Object.keys(opts.props).forEach(function (key) {
                node[key] = opts.props[key];
            });
        }

        if (children) {
            children.forEach(function (child) {
                if (child) node.appendChild(child);
            });
        }

        return node;
    }

    // Devuelve la URL sólo si apunta a un destino seguro (relativo o http/https).
    function safeUrl(url) {
        var value = String(url == null ? '' : url).trim();
        if (!value) return '';
        if (value.charAt(0) === '/') return value;
        if (/^https?:\/\//i.test(value)) return value;
        return '';
    }

    // Apila un toast no bloqueante. Tipos: success | error | info.
    function toast(message, options) {
        var opts = options || {};
        var type = opts.type || 'info';
        var stack = document.getElementById('toastStack');
        if (!stack) return function () {};

        var node = el('div', {
            className: 'toast toast--' + type,
            attrs: { role: 'status' }
        }, [
            el('span', {
                className: 'toast__icon',
                text: TOAST_ICONS[type] || TOAST_ICONS.info,
                attrs: { 'aria-hidden': 'true' }
            }),
            el('div', { className: 'toast__body' }, [
                opts.title ? el('div', { className: 'toast__title', text: opts.title }) : null,
                el('div', { text: message })
            ])
        ]);

        stack.appendChild(node);

        var dismissed = false;
        function dismiss() {
            if (dismissed) return;
            dismissed = true;
            if (node.parentNode) node.parentNode.removeChild(node);
        }

        node.addEventListener('click', dismiss);
        var duration = typeof opts.duration === 'number' ? opts.duration : 4000;
        if (duration > 0) window.setTimeout(dismiss, duration);
        return dismiss;
    }

    // Abre un modal centrado y lo monta en <body>. Devuelve el handle.
    // content: nodo | array de nodos. actions: [{ label, variant, onClick, closeOnClick }].
    function openModal(options) {
        var opts = options || {};

        var title = el('h2', { className: 'modal__title', text: opts.title || '' });
        var closeBtn = el('button', {
            className: 'btn btn--icon btn--sm',
            text: '\u2715',
            attrs: { type: 'button', 'aria-label': 'Cerrar' }
        });
        var header = el('div', { className: 'modal__header' }, [title, closeBtn]);

        var bodyEl = el('div', { className: 'modal__body' });
        var contentNodes = Array.isArray(opts.content) ? opts.content : [opts.content];
        contentNodes.forEach(function (node) {
            if (node) bodyEl.appendChild(node);
        });

        var panel = el('div', { className: 'modal__panel' }, [header, bodyEl]);
        var root = el('div', { className: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true' } });

        var actions = opts.actions || [];
        var footer = null;
        if (actions.length) {
            footer = el('div', { className: 'modal__footer' });
            actions.forEach(function (action) {
                var button = el('button', {
                    className: 'btn btn--' + (action.variant || 'primary'),
                    text: action.label,
                    attrs: { type: 'button' }
                });
                button.addEventListener('click', function () {
                    if (action.onClick) action.onClick();
                    if (action.closeOnClick !== false) close();
                });
                footer.appendChild(button);
            });
            panel.appendChild(footer);
        }

        root.appendChild(panel);
        document.body.appendChild(root);

        var closed = false;
        function close() {
            if (closed) return;
            closed = true;
            document.removeEventListener('keydown', onKey);
            if (root.parentNode) root.parentNode.removeChild(root);
            if (typeof opts.onClose === 'function') opts.onClose();
        }
        function onKey(event) {
            if (event.key === 'Escape') close();
        }

        closeBtn.addEventListener('click', close);
        root.addEventListener('mousedown', function (event) {
            if (event.target === root) close();
        });
        document.addEventListener('keydown', onKey);

        var focusTarget = bodyEl.querySelector('input, select, textarea, button') ||
            (footer && footer.querySelector('button')) || closeBtn;
        if (focusTarget && focusTarget.focus) focusTarget.focus();

        return { root: root, panel: panel, body: bodyEl, footer: footer, close: close };
    }

    // Confirmacion modal. Resuelve true/false; nunca usa confirm() nativo.
    function confirmDialog(options) {
        var opts = options || {};
        return new Promise(function (resolve) {
            var resolved = false;
            function finish(value) {
                if (resolved) return;
                resolved = true;
                resolve(value);
            }

            var message = el('p', { className: 'text-muted', text: opts.message || '' });
            openModal({
                title: opts.title || 'Confirmar',
                content: message,
                onClose: function () { finish(false); },
                actions: [
                    {
                        label: opts.cancelLabel || 'Cancelar',
                        variant: 'secondary',
                        onClick: function () { finish(false); }
                    },
                    {
                        label: opts.confirmLabel || 'Confirmar',
                        variant: opts.danger ? 'danger' : 'primary',
                        onClick: function () { finish(true); }
                    }
                ]
            });
        });
    }

    // Formatea milisegundos a segundos legibles (entero).
    function formatSeconds(ms) {
        if (ms == null || ms === '') return '';
        var seconds = Math.round(Number(ms) / 1000);
        return isNaN(seconds) ? '' : String(seconds);
    }

    window.FV = window.FV || {};
    window.FV.ui = {
        escapeHtml: escapeHtml,
        el: el,
        safeUrl: safeUrl,
        toast: toast,
        openModal: openModal,
        confirm: confirmDialog,
        formatSeconds: formatSeconds
    };
})(window, document);
