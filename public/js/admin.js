// admin.js — Lógica del panel de administración FarmaVid.
// Requiere js/ui.js y js/api.js cargados antes. Vanilla JS, sin dependencias.
(function (window, document) {
    'use strict';

    var api = window.FV.api;
    var ui = window.FV.ui;
    var el = ui.el;

    var TRANSITION_LABELS = {
        'fade': 'Suave (Fade)',
        'slide-left': 'Deslizar izquierda',
        'slide-right': 'Deslizar derecha',
        'zoom-in': 'Zoom In',
        'none': 'Ninguna'
    };

    var POLL_MS = 10000;

    var state = {
        screens: [],
        target: 'ALL',
        playlist: [],
        draggingIndex: null,
        pollTimer: null,
        activeTab: 'pantallas',
        isAdmin: api.getUser() === 'admin'
    };

    var dom = {};

    function $(id) { return document.getElementById(id); }

    function findScreen(id) {
        for (var i = 0; i < state.screens.length; i++) {
            if (state.screens[i].id === id) return state.screens[i];
        }
        return null;
    }

    // --- Estado vacio reutilizable ---
    function emptyState(icon, title, hint) {
        return el('div', { className: 'empty' }, [
            el('div', { className: 'empty__icon', text: icon, attrs: { 'aria-hidden': 'true' } }),
            el('div', { className: 'empty__title', text: title }),
            el('div', { className: 'empty__hint', text: hint })
        ]);
    }

    // --- Arranque ---
    function init() {
        if (!api.getToken()) { api.logout(); return; }

        dom.currentUser = $('currentUser');
        dom.layout = $('adminLayout');
        dom.tabbar = $('tabbar');
        dom.targetSelect = $('targetSelect');
        dom.screenList = $('screenList');
        dom.uploadForm = $('uploadForm');
        dom.uploadOverlay = $('uploadOverlay');
        dom.uploadProgress = $('uploadProgress');
        dom.uploadProgressBar = $('uploadProgressBar');
        dom.uploadProgressText = $('uploadProgressText');
        dom.playlistContainer = $('playlistContainer');
        dom.templateForm = $('templateForm');
        dom.templateName = $('templateName');
        dom.templateList = $('templateList');
        dom.usersPanel = $('usersPanel');
        dom.userList = $('userList');
        dom.addUserForm = $('addUserForm');

        dom.currentUser.textContent = api.getUser() || '';

        wireEvents();

        // La sección de usuarios es sólo para admin (cosmético: el servidor no lo exige).
        if (!state.isAdmin) {
            if (dom.usersPanel && dom.usersPanel.parentNode) dom.usersPanel.parentNode.removeChild(dom.usersPanel);
            var usersTab = dom.tabbar.querySelector('[data-tab="usuarios"]');
            if (usersTab && usersTab.parentNode) usersTab.parentNode.removeChild(usersTab);
            setActiveTab('pantallas');
        }

        loadScreens().then(function () {
            state.target = dom.targetSelect.value || 'ALL';
            return loadPlaylist();
        });
        loadTemplates();
        if (state.isAdmin) loadUsers();

        startPolling();
    }

    function wireEvents() {
        $('logoutBtn').addEventListener('click', function () { api.logout(); });

        dom.targetSelect.addEventListener('change', function () {
            state.target = dom.targetSelect.value;
            loadPlaylist();
        });

        dom.tabbar.addEventListener('click', function (event) {
            var button = event.target.closest('[data-tab]');
            if (!button) return;
            setActiveTab(button.getAttribute('data-tab'));
        });

        dom.uploadForm.addEventListener('submit', onSubmitUpload);
        dom.templateForm.addEventListener('submit', onSaveTemplate);
        $('saveOrderBtn').addEventListener('click', saveOrder);
        $('clearPlaylistBtn').addEventListener('click', onClearPlaylist);
        dom.addUserForm.addEventListener('submit', onCreateUser);
    }

    // Cambia de panel en móvil mediante un atributo de datos (la visibilidad la decide CSS).
    function setActiveTab(tab) {
        state.activeTab = tab;
        dom.layout.setAttribute('data-active-tab', tab);
        var buttons = dom.tabbar.querySelectorAll('[data-tab]');
        Array.prototype.forEach.call(buttons, function (button) {
            var active = button.getAttribute('data-tab') === tab;
            button.classList.toggle('tabbar__item--active', active);
            button.setAttribute('aria-current', active ? 'true' : 'false');
        });
    }

    // --- Pantallas ---
    // Carga pantallas y actualiza el selector, SIN tocar la playlist.
    // Es la única función que corre en el sondeo periódico.
    function loadScreens() {
        return api.get('/api/screens').then(function (screens) {
            state.screens = Array.isArray(screens) ? screens : [];
            renderScreens();
            updateTargetOptions();
        }).catch(function (error) {
            if (error.status !== 401) ui.toast(error.message, { type: 'error' });
        });
    }

    function renderScreens() {
        dom.screenList.textContent = '';
        if (!state.screens.length) {
            dom.screenList.appendChild(emptyState('📡', 'No hay pantallas',
                'Las pantallas aparecen aquí cuando se conectan por primera vez.'));
            return;
        }
        state.screens.forEach(function (screen) {
            dom.screenList.appendChild(screenRow(screen));
        });
    }

    function screenRow(screen) {
        var dot = el('span', {
            className: 'dot ' + (screen.online ? 'dot--online' : 'dot--offline'),
            attrs: { title: screen.online ? 'En línea' : 'Desconectado', 'aria-hidden': 'true' }
        });

        var meta = el('div', { className: 'row__meta' }, [
            el('span', { text: 'ID: ' + screen.id }),
            el('span', {
                className: 'badge ' + (screen.authorized ? 'badge--image' : 'badge--neutral'),
                text: screen.authorized ? 'Autorizada' : 'Sin autorizar'
            })
        ]);
        if (screen.online) {
            meta.appendChild(el('span', {
                className: 'badge badge--neutral',
                text: screen.isApk ? '📱 TV/APK' : '🌐 Web'
            }));
        }

        var main = el('div', { className: 'row__main' }, [
            el('span', { className: 'row__title', text: screen.name || screen.id }),
            meta
        ]);

        var actions = el('div', { className: 'row__actions' });

        var renameBtn = el('button', {
            className: 'btn btn--secondary',
            text: 'Renombrar',
            attrs: { type: 'button' }
        });
        renameBtn.addEventListener('click', function () { openRenameModal(screen); });
        actions.appendChild(renameBtn);

        if (screen.authorized) {
            var blockBtn = el('button', {
                className: 'btn btn--danger',
                text: 'Bloquear',
                attrs: { type: 'button' }
            });
            blockBtn.addEventListener('click', function () { setAuthorized(screen, false); });
            actions.appendChild(blockBtn);
        } else {
            var authBtn = el('button', {
                className: 'btn btn--success',
                text: 'Autorizar',
                attrs: { type: 'button' }
            });
            authBtn.addEventListener('click', function () { setAuthorized(screen, true); });
            actions.appendChild(authBtn);

            var deleteBtn = el('button', {
                className: 'btn btn--danger btn--icon',
                text: '🗑️',
                attrs: { type: 'button', 'aria-label': 'Eliminar pantalla', title: 'Eliminar' }
            });
            deleteBtn.addEventListener('click', function () { onDeleteScreen(screen); });
            actions.appendChild(deleteBtn);
        }

        return el('div', { className: 'row' }, [dot, main, actions]);
    }

    // Rellena el selector con Global + pantallas autorizadas, preservando la
    // selección del usuario. Nunca re-renderiza la playlist.
    function updateTargetOptions() {
        var select = dom.targetSelect;
        var previous = state.target || select.value || 'ALL';

        select.textContent = '';
        select.appendChild(el('option', { text: '🌍 Global (Todas)', props: { value: 'ALL' } }));

        var found = previous === 'ALL';
        state.screens.forEach(function (screen) {
            if (!screen.authorized) return;
            select.appendChild(el('option', {
                text: '🖥️ ' + (screen.name || screen.id),
                props: { value: screen.id }
            }));
            if (screen.id === previous) found = true;
        });

        if (found) {
            select.value = previous;
        } else {
            // La pantalla elegida dejó de estar autorizada: conservamos la selección
            // para no perder el trabajo, marcándola como no disponible.
            var screen = findScreen(previous);
            select.appendChild(el('option', {
                text: '⚠️ ' + (screen ? screen.name : previous) + ' (sin autorizar)',
                props: { value: previous }
            }));
            select.value = previous;
        }

        state.target = select.value;
    }

    function setAuthorized(screen, authorized) {
        api.post('/api/screens/' + encodeURIComponent(screen.id) + '/authorize', { authorized: authorized })
            .then(function (data) {
                ui.toast((data && data.message) || 'Cambios guardados', { type: 'success' });
                var changedTarget = !authorized && state.target === screen.id;
                if (changedTarget) state.target = 'ALL';
                return loadScreens().then(function () {
                    if (changedTarget) return loadPlaylist();
                });
            })
            .catch(function (error) {
                if (error.status !== 401) ui.toast(error.message, { type: 'error' });
            });
    }

    function onDeleteScreen(screen) {
        ui.confirm({
            title: 'Eliminar pantalla',
            message: '¿Eliminar la pantalla "' + (screen.name || screen.id) + '"? Se quitará de la lista.',
            confirmLabel: 'Eliminar',
            danger: true
        }).then(function (ok) {
            if (!ok) return;
            api.del('/api/screens/' + encodeURIComponent(screen.id))
                .then(function (data) {
                    ui.toast((data && data.message) || 'Pantalla eliminada', { type: 'success' });
                    var changedTarget = state.target === screen.id;
                    if (changedTarget) state.target = 'ALL';
                    return loadScreens().then(function () {
                        if (changedTarget) return loadPlaylist();
                    });
                })
                .catch(function (error) {
                    if (error.status !== 401) ui.toast(error.message, { type: 'error' });
                });
        });
    }

    function openRenameModal(screen) {
        var input = el('input', {
            className: 'input',
            attrs: { id: 'renameInput', type: 'text', autocomplete: 'off' }
        });
        input.value = screen.name || '';
        var field = el('div', { className: 'field' }, [
            el('label', { className: 'field__label', text: 'Nuevo nombre', attrs: { for: 'renameInput' } }),
            input
        ]);
        var errorEl = el('div', { className: 'field__error' });

        function submit() {
            var value = input.value.trim();
            if (!value) { errorEl.textContent = 'Escribe un nombre.'; return; }
            if (value === screen.name) { modal.close(); return; }
            api.post('/api/screens/' + encodeURIComponent(screen.id) + '/rename', { name: value })
                .then(function (data) {
                    modal.close();
                    ui.toast((data && data.message) || 'Pantalla renombrada', { type: 'success' });
                    return loadScreens();
                })
                .catch(function (error) {
                    if (error.status !== 401) errorEl.textContent = error.message;
                });
        }

        input.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') { event.preventDefault(); submit(); }
        });

        var modal = ui.openModal({
            title: 'Renombrar pantalla',
            content: [field, errorEl],
            actions: [
                { label: 'Cancelar', variant: 'secondary' },
                { label: 'Guardar', variant: 'primary', closeOnClick: false, onClick: submit }
            ]
        });
    }

    // --- Plantillas ---
    function loadTemplates() {
        return api.get('/api/templates').then(function (templates) {
            var list = Array.isArray(templates) ? templates : [];
            dom.templateList.textContent = '';
            if (!list.length) {
                dom.templateList.appendChild(emptyState('📄', 'No hay plantillas',
                    'Guarda la playlist actual como plantilla para reutilizarla.'));
                return;
            }
            list.forEach(function (template) {
                dom.templateList.appendChild(templateRow(template));
            });
        }).catch(function (error) {
            if (error.status !== 401) ui.toast(error.message, { type: 'error' });
        });
    }

    function templateRow(template) {
        var loadBtn = el('button', {
            className: 'btn btn--success',
            text: 'Cargar',
            attrs: { type: 'button' }
        });
        loadBtn.addEventListener('click', function () { onLoadTemplate(template); });

        var deleteBtn = el('button', {
            className: 'btn btn--danger btn--icon',
            text: '🗑️',
            attrs: { type: 'button', 'aria-label': 'Eliminar plantilla', title: 'Eliminar' }
        });
        deleteBtn.addEventListener('click', function () { onDeleteTemplate(template); });

        return el('div', { className: 'row' }, [
            el('div', { className: 'row__main' }, [el('span', { className: 'row__title', text: template.name })]),
            el('div', { className: 'row__actions' }, [loadBtn, deleteBtn])
        ]);
    }

    function onSaveTemplate(event) {
        event.preventDefault();
        var name = dom.templateName.value.trim();
        if (!name) { ui.toast('Escribe un nombre para la plantilla.', { type: 'error' }); return; }

        api.post('/api/templates/save-from-screen', { name: name, sourceScreen: state.target })
            .then(function (data) {
                ui.toast((data && data.message) || 'Plantilla guardada', { type: 'success' });
                dom.templateName.value = '';
                return loadTemplates();
            })
            .catch(function (error) {
                if (error.status !== 401) ui.toast(error.message, { type: 'error' });
            });
    }

    function onLoadTemplate(template) {
        var targetLabel = state.target === 'ALL' ? 'Global' : 'la pantalla seleccionada';
        ui.confirm({
            title: 'Cargar plantilla',
            message: '¿Cargar "' + template.name + '" en ' + targetLabel + '? Se reemplazará la lista actual.',
            confirmLabel: 'Cargar',
            danger: true
        }).then(function (ok) {
            if (!ok) return;
            api.post('/api/templates/' + encodeURIComponent(template.id) + '/load', { targetScreen: state.target })
                .then(function (data) {
                    ui.toast((data && data.message) || 'Plantilla cargada', { type: 'success' });
                    return loadPlaylist();
                })
                .catch(function (error) {
                    if (error.status !== 401) ui.toast(error.message, { type: 'error' });
                });
        });
    }

    function onDeleteTemplate(template) {
        ui.confirm({
            title: 'Eliminar plantilla',
            message: '¿Eliminar la plantilla "' + template.name + '"?',
            confirmLabel: 'Eliminar',
            danger: true
        }).then(function (ok) {
            if (!ok) return;
            api.del('/api/templates/' + encodeURIComponent(template.id))
                .then(function (data) {
                    ui.toast((data && data.message) || 'Plantilla eliminada', { type: 'success' });
                    return loadTemplates();
                })
                .catch(function (error) {
                    if (error.status !== 401) ui.toast(error.message, { type: 'error' });
                });
        });
    }

    // --- Playlist ---
    // Sólo se llama ante acciones explícitas del usuario (destino, subida,
    // plantilla, eliminar, guardar, editar). Nunca desde el sondeo.
    function loadPlaylist() {
        var container = dom.playlistContainer;
        container.textContent = '';
        container.appendChild(el('p', { className: 'text-muted', text: 'Cargando…' }));

        return api.get('/api/playlist/' + encodeURIComponent(state.target))
            .then(function (items) {
                state.playlist = Array.isArray(items) ? items : [];
                renderPlaylist();
            })
            .catch(function (error) {
                if (error.status === 401) return;
                container.textContent = '';
                container.appendChild(emptyState('⚠️', 'No se pudo cargar', error.message));
            });
    }

    function renderPlaylist() {
        var container = dom.playlistContainer;
        container.textContent = '';
        if (!state.playlist.length) {
            container.appendChild(emptyState('🎞️', 'La lista está vacía',
                'Sube contenido para agregar elementos a este destino.'));
            return;
        }
        state.playlist.forEach(function (item, index) {
            container.appendChild(playlistItem(item, index));
        });
    }

    function playlistItem(item, index) {
        var preview;
        var src = ui.safeUrl(item.url);
        if (item.type === 'video') {
            preview = el('video', { className: 'playlist__preview', props: { muted: true, preload: 'metadata' } });
            preview.muted = true;
        } else {
            preview = el('img', { className: 'playlist__preview', attrs: { alt: '' } });
        }
        if (src) preview.src = src;

        var info = el('div', { className: 'playlist__info' }, [
            el('span', { className: 'playlist__name', text: item.name || 'Sin nombre' }),
            el('span', {
                className: 'badge ' + (item.type === 'video' ? 'badge--video' : 'badge--image'),
                text: item.type === 'video'
                    ? 'Video'
                    : 'Imagen · ' + (ui.formatSeconds(item.duration) || '?') + ' s'
            })
        ]);
        var head = el('div', { className: 'playlist__head' }, [preview, info]);

        // Controles de escritorio: arrastrar + editar + eliminar.
        var editDesktop = el('button', {
            className: 'btn btn--secondary btn--icon',
            text: '✎',
            attrs: { type: 'button', 'aria-label': 'Editar', title: 'Editar' }
        });
        editDesktop.addEventListener('click', function () { openEditModal(index); });

        var deleteDesktop = el('button', {
            className: 'btn btn--danger btn--icon',
            text: '✕',
            attrs: { type: 'button', 'aria-label': 'Eliminar', title: 'Eliminar' }
        });
        deleteDesktop.addEventListener('click', function () { onRemoveItem(index); });

        var desktopControls = el('div', {
            className: 'playlist__actions item__controls--desktop'
        }, [editDesktop, deleteDesktop]);

        // Controles de móvil: subir/bajar + editar + eliminar.
        var up = el('button', {
            className: 'btn btn--secondary btn--icon',
            text: '⬆',
            attrs: { type: 'button', 'aria-label': 'Subir', title: 'Subir' }
        });
        up.disabled = index === 0;
        up.addEventListener('click', function () { moveItem(index, -1); });

        var down = el('button', {
            className: 'btn btn--secondary btn--icon',
            text: '⬇',
            attrs: { type: 'button', 'aria-label': 'Bajar', title: 'Bajar' }
        });
        down.disabled = index === state.playlist.length - 1;
        down.addEventListener('click', function () { moveItem(index, 1); });

        var editMobile = el('button', {
            className: 'btn btn--secondary btn--icon',
            text: '✎',
            attrs: { type: 'button', 'aria-label': 'Editar', title: 'Editar' }
        });
        editMobile.addEventListener('click', function () { openEditModal(index); });

        var deleteMobile = el('button', {
            className: 'btn btn--danger',
            text: 'Eliminar',
            attrs: { type: 'button' }
        });
        deleteMobile.addEventListener('click', function () { onRemoveItem(index); });

        var mobileControls = el('div', {
            className: 'playlist__actions item__controls--mobile'
        }, [
            el('div', { className: 'playlist__move' }, [up, down]),
            el('div', { className: 'playlist__move' }, [editMobile, deleteMobile])
        ]);

        var drag = el('span', { className: 'playlist__drag', text: '☰', attrs: { 'aria-hidden': 'true' } });

        var node = el('article', {
            className: 'playlist__item',
            attrs: { draggable: 'true' }
        }, [drag, head, desktopControls, mobileControls]);
        node.dataset.index = index;

        node.addEventListener('dragstart', onDragStart);
        node.addEventListener('dragover', onDragOver);
        node.addEventListener('dragleave', onDragLeave);
        node.addEventListener('drop', onDrop);
        node.addEventListener('dragend', onDragEnd);

        return node;
    }

    function openEditModal(index) {
        var item = state.playlist[index];
        if (!item) return;

        var durationInput = el('input', {
            className: 'input',
            attrs: { id: 'editDuration', type: 'number', min: '1', step: '1', inputmode: 'numeric' }
        });
        durationInput.value = item.duration ? String(Math.round(item.duration / 1000)) : '';
        var durationField = el('div', { className: 'field' }, [
            el('label', { className: 'field__label', text: 'Duración (segundos)', attrs: { for: 'editDuration' } }),
            durationInput,
            el('span', { className: 'field__hint', text: 'Sólo se aplica a imágenes.' })
        ]);

        var transitionSelect = el('select', { className: 'select', attrs: { id: 'editTransition' } });
        transitionSelect.appendChild(el('option', { text: '(Por defecto)', props: { value: '' } }));
        Object.keys(TRANSITION_LABELS).forEach(function (key) {
            transitionSelect.appendChild(el('option', { text: TRANSITION_LABELS[key], props: { value: key } }));
        });
        transitionSelect.value = (item.transition && TRANSITION_LABELS[item.transition]) ? item.transition : '';
        var transitionField = el('div', { className: 'field' }, [
            el('label', { className: 'field__label', text: 'Transición', attrs: { for: 'editTransition' } }),
            transitionSelect
        ]);

        var errorEl = el('div', { className: 'field__error' });

        function submit() {
            var rawDuration = durationInput.value.trim();
            var durationMs = rawDuration === '' ? null : Math.round(Number(rawDuration) * 1000);
            if (rawDuration !== '' && (!isFinite(durationMs) || durationMs <= 0)) {
                errorEl.textContent = 'La duración debe ser un número mayor a 0.';
                return;
            }
            var body = { duration: durationMs, transition: transitionSelect.value || null };
            api.put('/api/playlist-item/' + encodeURIComponent(item.id), body)
                .then(function (data) {
                    modal.close();
                    ui.toast((data && data.message) || 'Elemento actualizado', { type: 'success' });
                    return loadPlaylist();
                })
                .catch(function (error) {
                    if (error.status !== 401) errorEl.textContent = error.message;
                });
        }

        var modal = ui.openModal({
            title: 'Editar elemento',
            content: [durationField, transitionField, errorEl],
            actions: [
                { label: 'Cancelar', variant: 'secondary' },
                { label: 'Guardar', variant: 'primary', closeOnClick: false, onClick: submit }
            ]
        });
    }

    function persistOrder() {
        return api.post('/api/playlist/update', {
            targetScreen: state.target,
            newPlaylist: state.playlist
        });
    }

    function saveOrder() {
        persistOrder()
            .then(function (data) {
                ui.toast((data && data.message) || 'Orden guardado', { type: 'success' });
            })
            .catch(function (error) {
                if (error.status !== 401) ui.toast(error.message, { type: 'error' });
            });
    }

    function onRemoveItem(index) {
        var item = state.playlist[index];
        if (!item) return;
        ui.confirm({
            title: 'Eliminar elemento',
            message: '¿Eliminar "' + (item.name || 'este elemento') + '" de la lista?',
            confirmLabel: 'Eliminar',
            danger: true
        }).then(function (ok) {
            if (!ok) return;
            state.playlist.splice(index, 1);
            renderPlaylist();
            persistOrder()
                .then(function () { ui.toast('Elemento eliminado', { type: 'success' }); })
                .catch(function (error) {
                    if (error.status === 401) return;
                    ui.toast(error.message, { type: 'error' });
                    loadPlaylist();
                });
        });
    }

    function onClearPlaylist() {
        var targetLabel = state.target === 'ALL' ? 'Global' : 'la pantalla seleccionada';
        ui.confirm({
            title: 'Vaciar playlist',
            message: '¿Vaciar toda la lista de ' + targetLabel + '? Esta acción no se puede deshacer.',
            confirmLabel: 'Vaciar',
            danger: true
        }).then(function (ok) {
            if (!ok) return;
            api.post('/api/clear', { targetScreen: state.target })
                .then(function (data) {
                    ui.toast((data && data.message) || 'Playlist vaciada', { type: 'success' });
                    return loadPlaylist();
                })
                .catch(function (error) {
                    if (error.status !== 401) ui.toast(error.message, { type: 'error' });
                });
        });
    }

    // --- Drag & drop (escritorio) ---
    function onDragStart(event) {
        state.draggingIndex = Number(event.currentTarget.dataset.index);
        event.currentTarget.classList.add('dragging');
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(state.draggingIndex));
        }
    }

    function onDragOver(event) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        event.currentTarget.classList.add('is-dragover');
    }

    function onDragLeave(event) {
        event.currentTarget.classList.remove('is-dragover');
    }

    function onDragEnd(event) {
        event.currentTarget.classList.remove('dragging');
    }

    function onDrop(event) {
        event.preventDefault();
        event.currentTarget.classList.remove('is-dragover');
        var to = Number(event.currentTarget.dataset.index);
        var from = state.draggingIndex;
        if (from == null || isNaN(from) || from === to) return;
        var moved = state.playlist.splice(from, 1)[0];
        state.playlist.splice(to, 0, moved);
        state.draggingIndex = null;
        renderPlaylist();
    }

    // Reorden explícito con flechas (móvil).
    function moveItem(index, delta) {
        var target = index + delta;
        if (target < 0 || target >= state.playlist.length) return;
        var moved = state.playlist.splice(index, 1)[0];
        state.playlist.splice(target, 0, moved);
        renderPlaylist();
    }

    // --- Subida ---
    function onSubmitUpload(event) {
        event.preventDefault();
        var form = event.currentTarget;
        var fileInput = form.querySelector('input[type="file"]');
        if (!fileInput || fileInput.files.length === 0) {
            ui.toast('Selecciona al menos un archivo.', { type: 'error' });
            return;
        }

        var duration = form.querySelector('input[name="duration"]').value || '10';
        var transition = form.querySelector('select[name="transition"]').value;
        var files = fileInput.files;

        var formData = new FormData();
        for (var i = 0; i < files.length; i++) formData.append('media', files[i]);
        formData.append('duration', duration);
        formData.append('targetScreen', state.target);
        formData.append('transition', transition);

        setUploadVisible(true);
        setUploadProgress(0);

        api.upload('/api/publish', formData, setUploadProgress)
            .then(function (data) {
                setUploadVisible(false);
                ui.toast((data && data.message) || 'Contenido publicado', { type: 'success' });
                form.reset();
                return loadPlaylist();
            })
            .catch(function (error) {
                setUploadVisible(false);
                if (error.status !== 401) ui.toast(error.message, { type: 'error' });
            });
    }

    function setUploadVisible(visible) {
        if (!dom.uploadOverlay) return;
        dom.uploadOverlay.classList.toggle('is-hidden', !visible);
    }

    // El ancho se comunica por variable CSS: sin reglas de estilo en linea.
    function setUploadProgress(percent) {
        var value = Math.max(0, Math.min(100, percent));
        if (dom.uploadProgressBar) dom.uploadProgressBar.style.setProperty('--progress', value + '%');
        if (dom.uploadProgress) dom.uploadProgress.setAttribute('aria-valuenow', String(value));
        if (dom.uploadProgressText) dom.uploadProgressText.textContent = value + '%';
    }

    // --- Usuarios (sólo admin) ---
    function loadUsers() {
        return api.get('/api/users').then(function (users) {
            var list = Array.isArray(users) ? users : [];
            dom.userList.textContent = '';
            if (!list.length) {
                dom.userList.appendChild(emptyState('👥', 'No hay usuarios',
                    'Crea un usuario para que pueda ingresar al panel.'));
                return;
            }
            list.forEach(function (user) {
                dom.userList.appendChild(userRow(user));
            });
        }).catch(function (error) {
            if (error.status !== 401) ui.toast(error.message, { type: 'error' });
        });
    }

    function userRow(user) {
        var actions = el('div', { className: 'row__actions' });

        var passBtn = el('button', {
            className: 'btn btn--secondary btn--icon',
            text: '🔑',
            attrs: { type: 'button', 'aria-label': 'Cambiar contraseña', title: 'Cambiar contraseña' }
        });
        passBtn.addEventListener('click', function () { openPasswordModal(user); });
        actions.appendChild(passBtn);

        if (user.username !== 'admin') {
            var delBtn = el('button', {
                className: 'btn btn--danger btn--icon',
                text: '🗑️',
                attrs: { type: 'button', 'aria-label': 'Eliminar usuario', title: 'Eliminar' }
            });
            delBtn.addEventListener('click', function () { onDeleteUser(user); });
            actions.appendChild(delBtn);
        }

        return el('div', { className: 'row' }, [
            el('div', { className: 'row__main' }, [el('span', { className: 'row__title', text: user.username })]),
            actions
        ]);
    }

    function onCreateUser(event) {
        event.preventDefault();
        var username = $('newUsername').value.trim();
        var password = $('newPassword').value;
        if (!username || !password) { ui.toast('Completa usuario y contraseña.', { type: 'error' }); return; }

        api.post('/api/users', { username: username, password: password })
            .then(function (data) {
                ui.toast((data && data.message) || 'Usuario creado', { type: 'success' });
                dom.addUserForm.reset();
                return loadUsers();
            })
            .catch(function (error) {
                if (error.status !== 401) ui.toast(error.message, { type: 'error' });
            });
    }

    function onDeleteUser(user) {
        ui.confirm({
            title: 'Eliminar usuario',
            message: '¿Eliminar al usuario "' + user.username + '"?',
            confirmLabel: 'Eliminar',
            danger: true
        }).then(function (ok) {
            if (!ok) return;
            api.del('/api/users/' + encodeURIComponent(user.id))
                .then(function (data) {
                    ui.toast((data && data.message) || 'Usuario eliminado', { type: 'success' });
                    return loadUsers();
                })
                .catch(function (error) {
                    if (error.status !== 401) ui.toast(error.message, { type: 'error' });
                });
        });
    }

    function openPasswordModal(user) {
        var input = el('input', {
            className: 'input',
            attrs: { id: 'newPassInput', type: 'password', autocomplete: 'new-password' }
        });
        var field = el('div', { className: 'field' }, [
            el('label', {
                className: 'field__label',
                text: 'Nueva contraseña para ' + user.username,
                attrs: { for: 'newPassInput' }
            }),
            input
        ]);
        var errorEl = el('div', { className: 'field__error' });

        function submit() {
            var password = input.value;
            if (!password) { errorEl.textContent = 'Escribe una contraseña.'; return; }
            api.put('/api/users/' + encodeURIComponent(user.id) + '/password', { password: password })
                .then(function (data) {
                    modal.close();
                    ui.toast((data && data.message) || 'Contraseña actualizada', { type: 'success' });
                })
                .catch(function (error) {
                    if (error.status !== 401) errorEl.textContent = error.message;
                });
        }

        input.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') { event.preventDefault(); submit(); }
        });

        var modal = ui.openModal({
            title: 'Cambiar contraseña',
            content: [field, errorEl],
            actions: [
                { label: 'Cancelar', variant: 'secondary' },
                { label: 'Guardar', variant: 'primary', closeOnClick: false, onClick: submit }
            ]
        });
    }

    // --- Sondeo: SOLO refresca pantallas (nunca la playlist) ---
    function startPolling() {
        stopPolling();
        state.pollTimer = window.setInterval(loadScreens, POLL_MS);
    }

    function stopPolling() {
        if (state.pollTimer) {
            window.clearInterval(state.pollTimer);
            state.pollTimer = null;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window, document);
