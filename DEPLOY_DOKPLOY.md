# Guía de Despliegue en Dokploy

## 1. Variables de entorno (NUNCA hardcodear credenciales)

Las credenciales se configuran **únicamente** en la pestaña **"Environment"** de la aplicación en Dokploy.
Este archivo sólo documenta los **nombres** de las variables, nunca sus valores.

```env
DB_HOST=<nombre-del-servicio-mysql-o-host-interno>
DB_PORT=3306
DB_USER=<usuario>
DB_PASS=<contraseña>
DB_NAME=AppPublicidad
```

**Notas de conexión:**
* Dentro de Docker, usar el **nombre del servicio** MySQL como `DB_HOST` y el puerto interno `3306`.
* Nunca exponer el puerto de MySQL a internet. La app debe conectarse por la red interna de Docker.

> ⚠️ **Regla del proyecto:** ninguna contraseña, token, IP de servidor ni usuario real debe escribirse en el repositorio. Si necesitás documentar una credencial, documentá el **nombre de la variable de entorno**.

---

## 2. Persistencia de archivos (CRÍTICO)

La aplicación **NO tiene persistencia por defecto** para `public/uploads`.
Sin un mount configurado, **TODOS los archivos subidos (imágenes y videos) se pierden en cada redeploy**.

### Mount requerido

En Dokploy → App → **Advanced → Mounts**, agregar:

| Host Path | Container Path |
| :--- | :--- |
| `/etc/dokploy/volumes/app-tv/uploads` | `/app/public/uploads` |

### Verificación obligatoria

```bash
docker inspect <app-container> --format '{{json .Mounts}}'
```

- Si devuelve `[]` → **la galería está en riesgo**. Un redeploy borra todo el contenido.
- Debe mostrar el mount con destino `/app/public/uploads`.

**Contexto:** se detectó que este mount faltaba y que la galería vivía únicamente en la capa de escritura del contenedor (~218 MB en riesgo). Los archivos fueron rescatados al path de host indicado arriba. El mount es lo que los mantiene vivos entre despliegues.

---

## 3. Base de datos

MySQL persiste correctamente en el volume de Docker `basededatos-<app>-<hash>-data` montado en `/var/lib/mysql`.

**Importante:** la aplicación **no** debe usar `sequelize.sync({ alter: true })`. Esa opción puede ELIMINAR columnas presentes en la base de datos pero ausentes en los modelos, destruyendo datos. El arranque usa `sync()` simple más migraciones idempotentes y explícitas.

---

## 4. Backups

Ver `scripts/backup.sh`. Ejecuta `mysqldump` de la base y empaqueta la galería de uploads.
Programar por `cron` y **probar el restore** periódicamente (un backup que nunca se restauró no es un backup).

---

## 5. Despliegue automático

Con "Auto Deploy" activado, cada push al repositorio reconstruye y redespliega la aplicación.
Esto **reemplaza el contenedor**: cualquier dato que no esté en un volume persistente se pierde.
Por eso el mount del punto 2 es obligatorio antes de considerar el auto-deploy seguro.
