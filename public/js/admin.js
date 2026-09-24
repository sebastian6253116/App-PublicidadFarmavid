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
        dom.previewBtn = $('previewBtn');
        dom.templateForm = $('templateForm');
        dom.templateName = $('templateName');
        dom.templateList = $('templateList');
        dom.usersPanel = $('usersPanel');
        dom.userList = $('userList');
        dom.addUserForm = $('addUserForm');

        dom.currentUser.textContent = api.getUser() || '';

        wireEvents();

        // ---------------------------------------------------------------------
        // SECCIONES RESTRINGIDAS AL ADMIN.
        //
        // AVISO: esto es COSMETICO, NO es seguridad. El servidor todavia no valida
        // el rol (todos los usuarios reciben el mismo token), asi que un no-admin
        // puede llamar igual a la API desde la consola del navegador. La proteccion
        // real llega con la Fase C: columna role + sesion con identidad +
        // requireRole('admin') en el servidor.
        // ---------------------------------------------------------------------
        if (!state.isAdmin) {
            // Gestion de pantallas: autorizar, bloquear, renombrar y eliminar.
            // El selector "Destino" NO se toca: lo necesitan para publicar contenido.
            var screensPanel = document.querySelector('.admin-panel--screens');
            if (screensPanel && screensPanel.parentNode) screensPanel.parentNode.removeChild(screensPanel);
            var screensTab = dom.tabbar.querySelector('[data-tab="pantallas"]');
            if (screensTab && screensTab.parentNode) screensTab.parentNode.removeChild(screensTab);
            dom.screenList = null;

            // Gestion de usuarios (ya estaba restringida).
            if (dom.usersPanel && dom.usersPanel.parentNode) dom.usersPanel.parentNode.removeChild(dom.usersPanel);
            var usersTab = dom.tabbar.querySelector('[data-tab="usuarios"]');
            if (usersTab && usersTab.parentNode) usersTab.parentNode.removeChild(usersTab);

            // La pestana activa por defecto era "pantallas", que ya no existe: nos
            // movemos a "contenido", que es lo que un operador necesita para subir.
            setActiveTab('contenido');
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
        $('previewBtn').addEventListener('click', openPreviewModal);
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
        // Si el usuario no es admin, la lista se removio del DOM: no hay nada que pintar.
        if (!dom.screenList) return;
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
                if (dom.previewBtn) dom.previewBtn.disabled = true;
                container.textContent = '';
                container.appendChild(emptyState('⚠️', 'No se pudo cargar', error.message));
            });
    }

    function renderPlaylist() {
        var container = dom.playlistContainer;
        container.textContent = '';
        // El boton "Previo" solo tiene sentido con elementos que reproducir.
        updatePreviewButton();
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

    // --- Previo (vista previa del reproductor) ------------------------------
    // Reproduce state.playlist (incluido el orden sin guardar) en un modal que
    // espeja el reproductor real de tv.html: dos slots alternos y las mismas
    // transiciones. No llama a la API ni modifica la playlist.
    var PV_EFFECTS = {
        'fade': true,
        'slide-left': true,
        'slide-right': true,
        'zoom-in': true,
        'none': true
    };

    function updatePreviewButton() {
        if (!dom.previewBtn) return;
        dom.previewBtn.disabled = !state.playlist.length;
    }

    function previewTargetLabel() {
        if (state.target === 'ALL') return 'Global';
        var screen = findScreen(state.target);
        return screen ? (screen.name || screen.id) : state.target;
    }

    // Formatea milisegundos como m:ss (mismo criterio que muestra la TV).
    function formatClock(ms) {
        var totalSeconds = Math.max(0, Math.round((ms || 0) / 1000));
        var minutes = Math.floor(totalSeconds / 60);
        var seconds = totalSeconds % 60;
        return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
    }

    function openPreviewModal() {
        if (!state.playlist.length) return;

        // Bandera de cierre: corta callbacks asincronos (play/.catch) que podrian
        // programar timers DESPUES de cerrar el modal.
        var closed = false;

        var slots = [
            el('div', { className: 'pv-stage__slot' }),
            el('div', { className: 'pv-stage__slot' })
        ];
        var stage = el('div', { className: 'pv-stage' }, slots);

        var playBtn = el('button', {
            className: 'btn btn--secondary',
            text: 'Pausar',
            attrs: { type: 'button' }
        });
        var prevBtn = el('button', {
            className: 'btn btn--secondary btn--icon',
            text: '⏮',
            attrs: { type: 'button', 'aria-label': 'Anterior', title: 'Anterior' }
        });
        var nextBtn = el('button', {
            className: 'btn btn--secondary btn--icon',
            text: '⏭',
            attrs: { type: 'button', 'aria-label': 'Siguiente', title: 'Siguiente' }
        });

        var progressBar = el('div', { className: 'progress__bar progress__bar--value' });
        var progress = el('div', {
            className: 'progress',
            attrs: {
                role: 'progressbar',
                'aria-valuemin': '0',
                'aria-valuemax': '100',
                'aria-valuenow': '0'
            }
        }, [progressBar]);

        var timeEl = el('span', { className: 'text-muted fs-sm', text: '0:00 / 0:00' });
        var captionEl = el('span', { className: 'pv-controls__caption text-muted fs-sm' });

        var controls = el('div', { className: 'pv-controls' }, [
            el('div', { className: 'pv-controls__buttons' }, [prevBtn, playBtn, nextBtn]),
            progress,
            el('div', { className: 'pv-controls__status' }, [timeEl, captionEl])
        ]);

        // Estado del reproductor de previa.
        var currentSlotIndex = 0;
        var currentIndex = 0;
        var currentVideo = null;
        var mediaNodes = [];
        var advanceTimer = null;
        var tickTimer = null;
        var itemDuration = 0;
        var itemElapsed = 0;
        var itemStart = 0;
        var paused = false;

        function stopTimers() {
            if (advanceTimer) { window.clearTimeout(advanceTimer); advanceTimer = null; }
            if (tickTimer) { window.clearInterval(tickTimer); tickTimer = null; }
        }

        function clearSlot(slot) {
            var videos = slot.querySelectorAll('video');
            Array.prototype.forEach.call(videos, function (video) {
                video.pause();
                video.removeAttribute('src');
                video.load();
            });
            slot.textContent = '';
        }

        function pauseVideosIn(slot) {
            var videos = slot.querySelectorAll('video');
            Array.prototype.forEach.call(videos, function (video) {
                if (!video.paused) video.pause();
            });
        }

        function normalizeEffect(transition) {
            return (transition && PV_EFFECTS[transition]) ? transition : 'fade';
        }

        function startTick() {
            if (tickTimer) window.clearInterval(tickTimer);
            tickTimer = window.setInterval(updateProgressUI, 200);
        }

        function skipSoon(ms) {
            if (closed || paused) return;
            if (advanceTimer) window.clearTimeout(advanceTimer);
            advanceTimer = window.setTimeout(advance, ms);
        }

        function playVideo(video) {
            var promise = video.play();
            if (promise && promise.catch) {
                promise.catch(function () {
                    if (closed) return;
                    video.muted = true;
                    var retry = video.play();
                    if (retry && retry.catch) retry.catch(function () { skipSoon(2000); });
                });
            }
        }

        function buildMedia(item) {
            var src = ui.safeUrl(item.url);
            var media;
            if (item.type === 'video') {
                media = el('video', {
                    className: 'pv-stage__media',
                    props: { muted: true, autoplay: true, playsInline: true }
                });
                media.addEventListener('ended', onMediaEnded);
                media.addEventListener('error', onMediaError);
            } else {
                media = el('img', { className: 'pv-stage__media', attrs: { alt: '' } });
                media.addEventListener('error', onMediaError);
            }
            if (src) media.src = src;
            mediaNodes.push(media);
            return media;
        }

        function updateCaption() {
            var item = state.playlist[currentIndex];
            if (!item) { captionEl.textContent = ''; return; }
            captionEl.textContent = 'Ítem ' + (currentIndex + 1) + ' de ' +
                state.playlist.length + ' · ' + (item.name || 'Sin nombre');
        }

        function updateProgressUI() {
            var item = state.playlist[currentIndex];
            if (!item) return;
            var total = 0;
            var elapsed = 0;
            if (item.type === 'video' && currentVideo &&
                isFinite(currentVideo.duration) && currentVideo.duration > 0) {
                total = currentVideo.duration * 1000;
                elapsed = currentVideo.currentTime * 1000;
            } else if (item.type !== 'video') {
                total = itemDuration;
                elapsed = itemElapsed + (paused ? 0 : (Date.now() - itemStart));
            }
            var percent = total > 0 ? Math.max(0, Math.min(100, (elapsed / total) * 100)) : 0;
            progressBar.style.setProperty('--progress', percent + '%');
            progress.setAttribute('aria-valuenow', String(Math.round(percent)));
            timeEl.textContent = formatClock(elapsed) + ' / ' + formatClock(total);
        }

        // Doble buffer: el item nuevo entra en el siguiente slot y el anterior
        // sale animado. Espeja showCurrentItem() del reproductor.
        function renderCurrent() {
            if (closed) return;
            var items = state.playlist;
            if (!items.length) return;
            var item = items[currentIndex];

            stopTimers();

            var nextSlotIndex = (currentSlotIndex + 1) % 2;
            var currentSlot = slots[currentSlotIndex];
            var nextSlot = slots[nextSlotIndex];

            // El slot que sale conserva su cuadro durante la transicion; sus
            // videos se pausan y su contenido se libera al reutilizar el slot.
            pauseVideosIn(currentSlot);
            clearSlot(nextSlot);

            var media = buildMedia(item);
            nextSlot.appendChild(media);

            var effect = normalizeEffect(item.transition);
            nextSlot.className = 'pv-stage__slot pv-effect-' + effect;
            currentSlot.className = 'pv-stage__slot pv-effect-' + effect + ' is-exit';

            void nextSlot.offsetWidth; // reflow: la transicion arranca en el proximo frame

            nextSlot.classList.add('is-active');
            currentSlot.classList.remove('is-active');

            currentSlotIndex = nextSlotIndex;
            updateCaption();

            if (item.type === 'video') {
                currentVideo = media;
                itemDuration = 0;
                itemElapsed = 0;
                if (!paused) playVideo(media);
            } else {
                currentVideo = null;
                itemDuration = Number(item.duration) > 0 ? Number(item.duration) : 5000;
                itemElapsed = 0;
                itemStart = Date.now();
                if (!paused) advanceTimer = window.setTimeout(advance, itemDuration);
            }

            updateProgressUI();
            if (!paused) startTick();
        }

        function advance() {
            if (closed || !state.playlist.length) return;
            currentIndex = (currentIndex + 1) % state.playlist.length;
            renderCurrent();
        }

        function goPrevious() {
            if (closed || !state.playlist.length) return;
            currentIndex = (currentIndex - 1 + state.playlist.length) % state.playlist.length;
            renderCurrent();
        }

        function pausePlayback() {
            if (paused || closed) return;
            paused = true;
            var item = state.playlist[currentIndex];
            if (item && item.type !== 'video') itemElapsed += Date.now() - itemStart;
            stopTimers();
            pauseVideosIn(slots[currentSlotIndex]);
            playBtn.textContent = 'Reproducir';
            updateProgressUI();
        }

        function resumePlayback() {
            if (!paused || closed) return;
            paused = false;
            var item = state.playlist[currentIndex];
            if (!item) return;
            if (item.type === 'video') {
                if (currentVideo) playVideo(currentVideo);
            } else {
                itemStart = Date.now();
                advanceTimer = window.setTimeout(advance, Math.max(0, itemDuration - itemElapsed));
            }
            startTick();
            playBtn.textContent = 'Pausar';
            updateProgressUI();
        }

        function togglePlay() {
            if (paused) resumePlayback(); else pausePlayback();
        }

        function onMediaEnded() { advance(); }

        function onMediaError() { skipSoon(2000); }

        function onKeyDown(event) {
            if (closed) return;
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                goPrevious();
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                advance();
            } else if (event.key === ' ' || event.key === 'Spacebar') {
                event.preventDefault();
                togglePlay();
            }
        }

        // Limpieza total al cerrar: timers, listeners, video y slots.
        function cleanup() {
            closed = true;
            stopTimers();
            document.removeEventListener('keydown', onKeyDown);
            mediaNodes.forEach(function (media) {
                media.removeEventListener('ended', onMediaEnded);
                media.removeEventListener('error', onMediaError);
                if (media.tagName === 'VIDEO') {
                    media.pause();
                    media.removeAttribute('src');
                    media.load();
                }
            });
            mediaNodes = [];
            clearSlot(slots[0]);
            clearSlot(slots[1]);
        }

        playBtn.addEventListener('click', togglePlay);
        prevBtn.addEventListener('click', goPrevious);
        nextBtn.addEventListener('click', advance);
        document.addEventListener('keydown', onKeyDown);

        var handle = ui.openModal({
            title: 'Previo · ' + previewTargetLabel(),
            content: [stage, controls],
            onClose: cleanup
        });
        handle.panel.classList.add('modal__panel--wide');

        renderCurrent();
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
