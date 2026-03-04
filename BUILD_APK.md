# Guía para Generar el APK de Android TV

Esta guía te ayudará a convertir la aplicación web en una aplicación nativa para Android TV utilizando Capacitor.

## Requisitos Previos

Para generar el archivo `.apk` final, necesitas un entorno de desarrollo Android. No se puede generar directamente en el servidor sin estas herramientas.

1.  **Node.js** (Ya lo tienes instalado).
2.  **Android Studio**: Debes descargarlo e instalarlo en tu computadora local (Windows, Mac o Linux). [Descargar Android Studio](https://developer.android.com/studio).
3.  **Java JDK**: Generalmente viene incluido con Android Studio.

## Pasos para Generar el APK

Una vez tengas Android Studio instalado:

1.  **Sincronizar el proyecto:**
    Asegúrate de que los cambios más recientes de tu código web estén sincronizados con el proyecto nativo. Ejecuta en la terminal de tu proyecto:
    ```bash
    npx cap sync android
    ```

2.  **Abrir en Android Studio:**
    Ejecuta el siguiente comando para abrir el proyecto nativo:
    ```bash
    npx cap open android
    ```
    Esto abrirá Android Studio automáticamente con tu proyecto cargado.

3.  **Construir el APK (Build):**
    Dentro de Android Studio:
    *   Espera a que Gradle termine de sincronizarse (verás barras de progreso en la parte inferior).
    *   Ve al menú superior: **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
    *   Android Studio comenzará a compilar la aplicación.
    *   Cuando termine, aparecerá una notificación "APK(s) generated successfully". Haz clic en **locate** para abrir la carpeta donde está el archivo `.apk` (generalmente `debug.apk`).

4.  **Instalar en tu TV:**
    *   Copia el archivo `.apk` generado a una memoria USB.
    *   Conéctala a tu Android TV.
    *   Usa un explorador de archivos en el TV para instalar el APK.

## Configuración Actual

La aplicación está configurada para cargar remotamente:
*   **URL:** `https://tv.farmavid.com.ve/tv.html`
*   **Pantalla:** Se mantendrá siempre encendida (Keep Awake activo).
*   **Auto-Inicio:** La aplicación se iniciará automáticamente cuando el TV se encienda (Boot Completed).
*   **Compatibilidad:** Optimizada para Android TV (Leanback) y pantallas sin táctil.

## Solución de Problemas

*   **Pantalla en blanco:** Asegúrate de que el dispositivo Android TV tenga conexión a internet, ya que la app carga el contenido directamente de la web.
*   **Errores de compilación:** Verifica que tienes el SDK de Android instalado (Android Studio te pedirá instalarlo si falta al abrir el proyecto).
