# Guía de Despliegue en Dokploy

Sigue estos pasos para desplegar tu aplicación en un VPS utilizando Dokploy.

## 1. Preparación del Proyecto (Ya realizado)
Hemos añadido un `Dockerfile` y un script de inicio (`npm start`) al repositorio. Esto asegura que Dokploy sepa exactamente cómo construir y ejecutar tu aplicación.

## 2. Configuración en Dokploy

1.  **Ingresa a tu panel de Dokploy.**
2.  Ve a la sección **"Projects"** (Proyectos) y crea uno nuevo (ej. `PublicidadTV`).
3.  Dentro del proyecto, haz clic en **"Create Service"** (Crear Servicio) -> **"Application"**.
4.  Ponle un nombre (ej. `app-tv`) y selecciona **GitHub** como proveedor.
5.  Selecciona tu repositorio: `sebastian6253116/App-PublicidadFarmavid`.
6.  Branch: `master`.

## 3. Configuración del Servicio

Una vez creado el servicio, ve a la pestaña **"Environment"** o **"General"**:

*   **Build Type:** Selecciona `Dockerfile`.
*   **Context Path:** `/`
*   **Docker Image path:** `/Dockerfile`

## 4. Persistencia de Datos (¡Muy Importante!)

Para que no pierdas las imágenes subidas ni la configuración de usuarios/pantallas cada vez que actualices la app, debes configurar los **Volúmenes**.

Ve a la pestaña **"Volumes"** (o "Advanced" -> "Volumes") y agrega dos entradas:

| Host Path (Ruta en el VPS) | Container Path (Ruta en la App) |
| :--- | :--- |
| `/etc/dokploy/volumes/app-tv/uploads` | `/app/public/uploads` |
| `/etc/dokploy/volumes/app-tv/data` | `/app/data` |

*Nota: La "Host Path" puede ser cualquier carpeta de tu servidor donde quieras guardar los datos. Asegúrate de que exista o que Dokploy tenga permisos para crearla.*

## 5. Dominio y Red

1.  Ve a la pestaña **"Network"** o **"Domains"**.
2.  Agrega tu dominio (ej. `tv.farmavid.com`).
3.  **Container Port:** `3000`.
4.  Activa **HTTPS** (Let's Encrypt) para tener conexión segura.

## 6. Desplegar

1.  Haz clic en el botón **"Deploy"**.
2.  Espera a que termine el proceso de "Build". Puedes ver los logs en la pestaña "Logs".

## 7. Verificación

Entra a tu dominio (`https://tv.farmavid.com`).
*   Deberías ver la pantalla de Login del Admin.
*   **Usuario:** `admin` / **Password:** `123` (Si es la primera vez).

---
**Nota sobre WebSockets (Socket.io):**
Como usamos Socket.io, es posible que necesites activar "WebSockets Support" en la configuración de Nginx/Traefik de Dokploy si notas que se desconecta frecuentemente. Generalmente funciona por defecto.
