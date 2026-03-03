# App Multimedia Publicidad (Digital Signage)

Sistema de gestión de publicidad para pantallas (Digital Signage) basado en tecnologías web. Permite administrar contenido multimedia (imágenes y videos) de forma remota y reproducirlo en Smart TVs o dispositivos conectados.

## 🚀 Características

*   **Panel Administrativo Web:**
    *   Subida de imágenes y videos (soporte drag & drop).
    *   Gestión de Playlist: Reordenar elementos, eliminar, vaciar lista.
    *   Selección de transiciones entre imágenes (Fade, Slide, Zoom, None).
    *   Gestión de Pantallas: Autorizar o bloquear dispositivos conectados.
    *   Gestión de Usuarios: Crear/Eliminar usuarios y cambiar contraseñas.
*   **Reproductor (Player):**
    *   Compatible con cualquier navegador moderno (Smart TV, PC, Raspberry Pi).
    *   Transiciones suaves (CSS Animations).
    *   Reproducción automática de video (sin sonido).
    *   Modo Pantalla Completa.
    *   Recuperación automática ante desconexiones.
*   **Arquitectura:**
    *   Backend en Node.js + Express + Socket.io (Comunicación en tiempo real).
    *   Persistencia de datos en archivos JSON (No requiere base de datos externa).

## 📋 Requisitos Previos

*   [Node.js](https://nodejs.org/) (Versión 14 o superior).
*   Navegador Web Moderno (Chrome, Firefox, Edge, Safari).

## 🛠️ Instalación y Puesta en Marcha

1.  **Clonar el repositorio:**
    ```bash
    git clone https://github.com/sebastian6253116/App-PublicidadFarmavid.git
    cd App-PublicidadFarmavid
    ```

2.  **Instalar dependencias:**
    ```bash
    npm install
    ```

3.  **Iniciar el servidor:**
    ```bash
    npm start
    # O para desarrollo con reinicio automático (si tienes nodemon):
    # npx nodemon server.js
    ```
    El servidor iniciará por defecto en el puerto `3000`.

## 📖 Uso

### 1. Acceso Administrativo
1.  Abre en tu navegador: `http://localhost:3000/admin.html` (o la IP del servidor).
2.  Credenciales por defecto:
    *   **Usuario:** `admin`
    *   **Contraseña:** `123`
3.  Desde aquí podrás gestionar todo el sistema.

### 2. Configurar una Pantalla (TV)
1.  En el Smart TV o dispositivo, abre el navegador y ve a: `http://IP_DEL_SERVIDOR:3000/tv.html`
    *   Puedes asignar un ID específico añadiendo `?id=NOMBRE`, ej: `http://.../tv.html?id=Recepcion`
2.  Aparecerá un mensaje de **"⛔ No Autorizada"**.
3.  Ve al Panel Administrativo, busca la pantalla en la lista y dale a **"Autorizar"**.
4.  La pantalla comenzará a reproducir el contenido asignado.

## 📂 Estructura del Proyecto

*   `server.js`: Servidor principal (Express + Socket.io).
*   `public/`: Archivos estáticos (Frontend).
    *   `admin.html`: Panel de control.
    *   `tv.html`: Reproductor para las pantallas.
    *   `login.html`: Página de inicio de sesión.
    *   `uploads/`: Carpeta donde se guardan las imágenes y videos subidos.
*   `data/`: Base de datos en archivos JSON.
    *   `users.json`: Usuarios del sistema.
    *   `screens.json`: Estado de las pantallas.
    *   `playlists.json`: Contenido de las listas de reproducción.

## 🔒 Seguridad (Notas para Producción)

*   **Cambiar la contraseña del admin** inmediatamente después de la instalación.
*   Este sistema usa autenticación básica por token simple. Para entornos públicos, se recomienda implementar HTTPS (SSL) y mejorar el mecanismo de sesión.
*   Asegúrate de que el puerto 3000 (o el que configures) esté abierto en el firewall del servidor.

## 🤝 Contribuir

Si deseas contribuir, por favor abre un Pull Request o crea un Issue para discutir los cambios propuestos.
