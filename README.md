# App Multimedia Publicidad (Digital Signage)

Sistema de gestión de publicidad para pantallas (Digital Signage) basado en tecnologías web modernas. Permite administrar contenido multimedia (imágenes y videos) de forma remota y reproducirlo en Smart TVs o dispositivos conectados, con una interfaz administrativa totalmente responsive y optimizada para móviles.

## 🚀 Características Principales

### 📱 Panel Administrativo (Responsive)
*   **Diseño Adaptable:** Interfaz optimizada para PC, Tablets y Móviles.
*   **Gestión de Playlist:**
    *   Subida de imágenes y videos (Límite de **150MB** por archivo).
    *   Reordenamiento intuitivo (Drag & Drop en PC, Botones Táctiles en Móvil).
    *   Eliminación persistente de contenido.
    *   Selección de transiciones (Fade, Slide, Zoom, None).
*   **Gestión de Pantallas (TVs):**
    *   **Autorización:** Control total sobre qué dispositivos pueden reproducir contenido.
    *   **Identificación Persistente:** Los TVs autorizados recuerdan su ID y configuración aunque se reinicien.
    *   **Limpieza Automática:** Las pantallas no autorizadas inactivas por más de 5 minutos se eliminan automáticamente.
    *   **Renombrado:** Asigna nombres personalizados a cada pantalla (ej. "TV Recepción", "TV Pasillo").
    *   **Eliminación Manual:** Posibilidad de eliminar pantallas no autorizadas directamente desde el panel.
*   **Gestión de Usuarios:**
    *   Acceso basado en roles (Solo `admin` puede gestionar otros usuarios).
    *   Cambio de contraseña propio y de terceros.

### 📺 Reproductor (Player)
*   **Compatibilidad Universal:** Funciona en cualquier navegador moderno (Smart TV, PC, Raspberry Pi, Fire TV).
*   **Reproducción Mixta:** Soporte fluido para imágenes y videos (con autoplay y muteado).
*   **Transiciones Suaves:** Efectos visuales profesionales entre elementos.
*   **Recuperación Automática:** Reconexión automática ante caídas de red.
*   **Modo Pantalla Completa:** Botón integrado para maximizar la visualización.

## 🏗️ Arquitectura Tecnológica

*   **Backend:** Node.js + Express.
*   **Base de Datos:** MySQL + Sequelize (ORM).
*   **Comunicación Real-Time:** Socket.io (para actualizaciones instantáneas en pantallas).
*   **Frontend:** HTML5, CSS3 (Grid/Flexbox), JavaScript Vanilla.
*   **Despliegue:** Preparado para Dokploy / Docker.

## 📋 Requisitos Previos

*   [Node.js](https://nodejs.org/) (v16 o superior).
*   Servidor MySQL.
*   Navegador Web Moderno.

## 🛠️ Instalación y Configuración

1.  **Clonar el repositorio:**
    ```bash
    git clone https://github.com/sebastian6253116/App-PublicidadFarmavid.git
    cd App-PublicidadFarmavid
    ```

2.  **Instalar dependencias:**
    ```bash
    npm install
    ```

3.  **Configurar Base de Datos:**
    Asegúrate de tener un servidor MySQL corriendo. El sistema intentará conectarse usando las variables de entorno o la configuración por defecto en `database.js`.
    
    *   Crea una base de datos llamada `railway` (o configura tu propia conexión).

4.  **Iniciar el servidor:**
    ```bash
    npm start
    ```
    El servidor iniciará en el puerto `3000` (o el definido en `PORT`).
    La base de datos se sincronizará automáticamente (`alter: true`), creando las tablas necesarias.

## 📖 Guía de Uso Rápido

### 1. Acceso Administrativo
1.  Navega a: `http://localhost:3000/admin.html`
2.  **Login:**
    *   Usuario por defecto: `admin`
    *   Contraseña por defecto: `123`
3.  **Primeros pasos:**
    *   Cambia tu contraseña desde el botón "Cambiar Clave".
    *   Si eres admin, puedes crear usuarios adicionales (ej. para empleados) que tendrán acceso restringido (no podrán gestionar otros usuarios).

### 2. Conectar una Pantalla (TV)
1.  En el Smart TV, abre el navegador y ve a: `http://TU_IP:3000/tv.html`
2.  Aparecerá un mensaje de **"⛔ No Autorizada"** y un ID (ej. `TV-4821`).
3.  **En el Panel Admin:**
    *   Verás la nueva pantalla en la lista de "Pantallas Conectadas".
    *   Haz clic en el botón **"Autorizar"**.
    *   (Opcional) Haz clic en el lápiz (✏️) para cambiarle el nombre (ej. "Sala de Espera").
4.  **En el TV:**
    *   Automáticamente cambiará a "Esperando contenido..." o comenzará a reproducir la playlist asignada.
    *   **Nota:** Una vez autorizada, la TV recordará su ID. Si se desautoriza, generará un nuevo ID cada vez que se refresque para seguridad.

### 3. Gestionar Contenido
1.  Selecciona la pantalla destino en el menú desplegable.
2.  Arrastra archivos (imágenes/videos) al área de carga o usa el botón "Seleccionar Archivos".
3.  Configura la duración (para imágenes) y la transición.
4.  Haz clic en **"Publicar"**.
5.  **Reordenar:**
    *   **PC:** Arrastra y suelta los elementos de la lista.
    *   **Móvil:** Usa los botones de flecha (⬆ ⬇) para mover elementos.
6.  Los cambios se reflejan en tiempo real en la TV seleccionada.

## 🔒 Seguridad y Mantenimiento

*   **Usuarios:** El usuario `admin` es el único con privilegios totales.
*   **Limpieza:** El sistema elimina automáticamente de la base de datos las pantallas no autorizadas que lleven más de 5 minutos desconectadas.
*   **Persistencia:** Si eliminas un video de la playlist, el cambio se guarda permanentemente en la base de datos.

## 🐳 Despliegue con Docker (Dokploy)

El proyecto incluye un `Dockerfile` optimizado.
1.  Asegúrate de configurar las variables de entorno para la conexión MySQL en tu plataforma de despliegue.
2.  Mapea el volumen `/app/public/uploads` para persistir los archivos multimedia subidos.
