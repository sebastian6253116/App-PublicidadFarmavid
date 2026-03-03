# Guía de Despliegue en Dokploy

## 1. Configuración de Variables de Entorno (IMPORTANTE)

Para que la aplicación se conecte a tu base de datos MySQL en producción, debes configurar las siguientes variables de entorno en la pestaña **"Environment"** de tu aplicación en Dokploy:

```env
DB_HOST=mysql-publicidad  # Nombre del servicio MySQL en Dokploy (o la IP interna si es externo)
DB_PORT=3306              # Puerto interno de Docker (usualmente 3306 entre contenedores)
DB_USER=publicidad
DB_PASS=8SPMzGNXyQ93oHyAw87R
DB_NAME=AppPublicidad
```

**Nota sobre la conexión:**
*   Si la base de datos y la aplicación están en el mismo Dokploy, usa el **Nombre del Servicio** (ej. `mysql-publicidad`) como `DB_HOST` y el puerto `3306`.
*   Si te conectas desde fuera (tu PC local), usa la IP `38.171.255.22` y el puerto `3311`.
*   Pero **dentro del servidor (entre contenedores)**, es más rápido y seguro usar la red interna de Docker.

## 2. Persistencia de Datos (Volúmenes)

Asegúrate de tener mapeado el volumen para las imágenes:

| Host Path | Container Path |
| :--- | :--- |
| `/etc/dokploy/volumes/app-tv/uploads` | `/app/public/uploads` |

*(Ya no necesitas el volumen de `data` para JSON porque ahora todo está en MySQL).*

## 3. Despliegue Automático

Al haber subido los cambios al repositorio, si tienes activado el "Auto Deploy" en Dokploy (generalmente por defecto al conectar GitHub), la aplicación se actualizará sola en unos minutos. Si no, dale al botón **"Deploy"** manualmente.
