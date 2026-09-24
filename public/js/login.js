// Login del panel: envia credenciales a /api/login y guarda la sesion.
// El contrato (endpoint, claves de localStorage y redireccion) no se toca.
(function () {
    'use strict';

    var form = document.getElementById('loginForm');
    var usernameInput = document.getElementById('username');
    var passwordInput = document.getElementById('password');
    var toggleBtn = document.getElementById('togglePassword');
    var iconShow = document.getElementById('iconShow');
    var iconHide = document.getElementById('iconHide');
    var errorMsg = document.getElementById('errorMsg');
    var submitBtn = document.getElementById('submitBtn');
    var submitLabel = document.getElementById('submitLabel');
    var submitSpinner = document.getElementById('submitSpinner');

    // Muestra el mensaje de error del servidor y lo anuncia al lector de pantalla.
    function showError(message) {
        errorMsg.textContent = message;
        errorMsg.classList.add('is-visible');
    }

    function clearError() {
        errorMsg.textContent = '';
        errorMsg.classList.remove('is-visible');
    }

    // Alterna la visibilidad de la contrasena sin tocar su valor.
    function togglePassword() {
        var isHidden = passwordInput.type === 'password';
        passwordInput.type = isHidden ? 'text' : 'password';
        toggleBtn.setAttribute('aria-pressed', String(isHidden));
        toggleBtn.setAttribute('aria-label', isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña');
        // OJO: SVGElement NO hereda de HTMLElement, asi que no tiene la propiedad
        // .hidden: asignarla crea una propiedad suelta que nunca toca el atributo
        // y el CSS no reacciona (era el bug de los DOS iconos visibles a la vez).
        // Los iconos se alternan por clase, igual que en el panel.
        iconShow.classList.toggle('is-hidden', isHidden);
        iconHide.classList.toggle('is-hidden', !isHidden);
        passwordInput.focus();
    }

    // Estado de carga: deshabilita el boton y evita el doble envio.
    function setLoading(isLoading) {
        submitBtn.disabled = isLoading;
        submitLabel.textContent = isLoading ? 'Ingresando…' : 'Ingresar';
        submitSpinner.hidden = !isLoading;
        form.setAttribute('aria-busy', String(isLoading));
    }

    toggleBtn.addEventListener('click', togglePassword);

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        clearError();

        var username = usernameInput.value;
        var password = passwordInput.value;

        setLoading(true);

        try {
            var res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username, password: password })
            });
            var data = await res.json();

            if (data.success) {
                localStorage.setItem('admin_token', data.token);
                localStorage.setItem('admin_user', data.username);
                window.location.href = '/admin.html';
            } else {
                showError(data.message);
                setLoading(false);
            }
        } catch (err) {
            showError('Error de conexión');
            setLoading(false);
        }
    });
})();
