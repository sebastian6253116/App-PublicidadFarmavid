const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { initDB, User, Screen, MediaItem, PlaylistItem, Playlist, SavedPlaylistItem, sequelize } = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('public/uploads'));

// Redirección raíz -> tv.html
app.get('/', (req, res) => {
    res.redirect('/tv.html');
});

// Directorios
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// --- INICIALIZAR DB ---
initDB();

// --- MIDDLEWARE AUTH ---
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'admin-token-secret') {
        next();
    } else {
        res.status(401).json({ success: false, message: 'No autorizado' });
    }
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});

const upload = multer({ 
    storage,
    limits: { fileSize: 150 * 1024 * 1024 } // 150MB Límite
});

let connectedSockets = {}; 

// --- API AUTH & USERS ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ where: { username } });
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
        }

        if (user.password !== password) {
            return res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
        }

        res.json({ success: true, token: 'admin-token-secret', username: user.username });
    } catch (e) {
        console.error('Login Error:', e);
        res.status(500).json({ message: 'Error interno de servidor: ' + e.message });
    }
});

app.get('/api/users', requireAuth, async (req, res) => {
    const users = await User.findAll({ attributes: ['id', 'username'] });
    res.json(users);
});

app.post('/api/users', requireAuth, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Datos incompletos' });
    try {
        await User.create({ username, password });
        res.json({ success: true, message: 'Usuario creado' });
    } catch (e) { res.status(400).json({ message: 'Error o usuario duplicado' }); }
});

app.put('/api/users/:id/password', requireAuth, async (req, res) => {
    const { password } = req.body;
    const id = parseInt(req.params.id);
    try {
        await User.update({ password }, { where: { id } });
        res.json({ success: true, message: 'Contraseña actualizada' });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

app.delete('/api/users/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const user = await User.findByPk(id);
    if (user && user.username === 'admin') return res.status(403).json({ message: 'No puedes borrar al admin principal' });
    
    await User.destroy({ where: { id } });
    res.json({ success: true, message: 'Usuario eliminado' });
});

// --- API PANTALLAS ---
app.get('/api/screens', requireAuth, async (req, res) => {
    // Limpiar pantallas inactivas NO autorizadas (> 5 min)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const { Op } = require('sequelize');
    
    // Debug: Ver qué pantallas hay y su lastSeen
    /*
    const allScreens = await Screen.findAll();
    console.log("--- SCREEN CHECK ---");
    allScreens.forEach(s => {
        console.log(`ID: ${s.screenId}, Auth: ${s.authorized}, LastSeen: ${s.lastSeen}, 5minAgo: ${fiveMinutesAgo}`);
    });
    */

    try {
        const deletedCount = await Screen.destroy({
            where: {
                authorized: false,
                [Op.or]: [
                    { lastSeen: { [Op.lt]: fiveMinutesAgo } },
                    { lastSeen: null } // También borrar si lastSeen es null
                ]
            }
        });
        if (deletedCount > 0) console.log(`🗑️ Eliminadas ${deletedCount} pantallas inactivas no autorizadas.`);
    } catch (err) {
        console.error("Error limpiando pantallas:", err);
    }

    // Pantallas en BD
    const dbScreens = await Screen.findAll();
    const result = dbScreens.map(s => {
        const socketData = Object.values(connectedSockets).find(sock => sock.screenId === s.screenId);
        return {
            id: s.screenId,
            authorized: s.authorized,
            online: !!socketData,
            isApk: socketData ? socketData.isApk : false,
            name: s.name,
            lastSeen: s.lastSeen
        };
    });

    // Pantallas online pero NO en BD (nuevas)
    for (const [socketId, data] of Object.entries(connectedSockets)) {
        if (!result.find(r => r.id === data.screenId)) {
            result.push({
                id: data.screenId,
                authorized: false,
                online: true,
                isApk: data.isApk,
                name: data.screenId
            });
        }
    }
    res.json(result);
});

app.post('/api/screens/:id/rename', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    try {
        const screen = await Screen.findOne({ where: { screenId: id } });
        if (screen) {
            screen.name = name;
            await screen.save();
            res.json({ success: true, message: 'Pantalla renombrada' });
        } else {
            res.status(404).json({ message: 'Pantalla no encontrada' });
        }
    } catch (e) { res.status(500).json({ message: 'Error DB' }); }
});

app.post('/api/screens/:id/authorize', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { authorized } = req.body;

    try {
        const [screen, created] = await Screen.findOrCreate({
            where: { screenId: id },
            defaults: { name: id, authorized }
        });

        if (!created) {
            screen.authorized = authorized;
            await screen.save();
        }

        // Notificar Socket
        const socketEntry = Object.entries(connectedSockets).find(([_, s]) => s.screenId === id);
        if (socketEntry) {
            io.to(socketEntry[0]).emit('authorization_change', { authorized });
            if (authorized) {
                const playlist = await getEffectivePlaylist(id);
                io.to(socketEntry[0]).emit('update_playlist', { playlist, restart: true });
            }
        }
        res.json({ success: true, message: `Pantalla ${authorized ? 'autorizada' : 'desactivada'}` });
    } catch (e) { res.status(500).json({ message: 'Error DB' }); }
});

app.delete('/api/screens/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const deleted = await Screen.destroy({ where: { screenId: id } });
        
        // Buscar si está conectado (aunque no esté en BD o ya se haya borrado)
        const socketEntry = Object.entries(connectedSockets).find(([sid, data]) => data.screenId === id);
        
        if (deleted || socketEntry) {
            if (socketEntry) {
                const [socketId] = socketEntry;
                io.to(socketId).emit('force_reload'); // Forzar recarga en el cliente
                
                // Forzamos desconexión del socket para limpiar estado
                const socketObj = io.sockets.sockets.get(socketId);
                if (socketObj) socketObj.disconnect(true);
            }
            res.json({ success: true, message: 'Pantalla eliminada' });
        } else {
            // Si no estaba en BD y tampoco conectado, entonces sí es un 404 real
            // PERO: Puede que el frontend tenga la pantalla en lista pero el socket ya se desconectó y no estaba en BD.
            // En ese caso, para el usuario es "eliminar de la lista visual".
            // Así que devolvemos 200 OK para que el frontend refresque y desaparezca.
            res.json({ success: true, message: 'Pantalla no encontrada (probablemente ya desconectada)' });
        }
    } catch (e) { 
        console.error(e);
        res.status(500).json({ message: 'Error DB' }); 
    }
});

// --- API PLAYLIST ---

// Helper para obtener playlist formateada
async function getEffectivePlaylist(screenId) {
    const screen = await Screen.findOne({ where: { screenId } });
    
    // Si la pantalla existe y NO está autorizada, devolver vacío
    if (screen && !screen.authorized) return [];
    
    // 1. Buscar playlist específica
    let items = await PlaylistItem.findAll({
        where: { targetScreen: screenId },
        include: MediaItem,
        order: [['order', 'ASC']]
    });

    // 2. Si no hay, buscar Global ('ALL')
    if (items.length === 0) {
        items = await PlaylistItem.findAll({
            where: { targetScreen: 'ALL' },
            include: MediaItem,
            order: [['order', 'ASC']]
        });
    }

    // Formatear para el frontend
    return items.map(item => ({
        id: item.id, // ID de la relación playlist-item
        mediaId: item.MediaItem.id,
        type: item.MediaItem.type,
        url: item.MediaItem.url,
        // Usar override si existe, sino el default del media
        duration: item.duration || item.MediaItem.duration,
        transition: item.transition || item.MediaItem.transition,
        name: item.MediaItem.originalName
    }));
}

app.get('/api/playlist/:target', requireAuth, async (req, res) => {
    // Aquí devolvemos exactamente lo que hay configurado para ese target, sin herencia
    const items = await PlaylistItem.findAll({
        where: { targetScreen: req.params.target },
        include: MediaItem,
        order: [['order', 'ASC']]
    });
    
    const formatted = items.map(item => ({
        id: item.id,
        mediaId: item.MediaItem.id,
        type: item.MediaItem.type,
        url: item.MediaItem.url,
        duration: item.duration || item.MediaItem.duration,
        transition: item.transition || item.MediaItem.transition,
        name: item.MediaItem.originalName
    }));
    res.json(formatted);
});

// --- GESTIÓN DE PLANTILLAS (PLAYLISTS GUARDADAS) ---

// 1. Guardar la cola actual de una pantalla como una Nueva Playlist (Template)
app.post('/api/templates/save-from-screen', requireAuth, async (req, res) => {
    const { name, sourceScreen } = req.body;
    try {
        // Verificar nombre único
        const exists = await Playlist.findOne({ where: { name } });
        if (exists) return res.status(400).json({ message: 'Ya existe una playlist con ese nombre' });

        // Obtener items actuales
        const currentItems = await PlaylistItem.findAll({
            where: { targetScreen: sourceScreen },
            order: [['order', 'ASC']]
        });

        if (currentItems.length === 0) return res.status(400).json({ message: 'La pantalla está vacía' });

        // Crear Playlist
        const playlist = await Playlist.create({ name });

        // Copiar items
        for (const item of currentItems) {
            await SavedPlaylistItem.create({
                PlaylistId: playlist.id,
                MediaItemId: item.MediaItemId,
                order: item.order,
                duration: item.duration,
                transition: item.transition
            });
        }

        res.json({ success: true, message: 'Playlist guardada exitosamente' });
    } catch (e) { console.error(e); res.status(500).json({ message: 'Error al guardar' }); }
});

// 2. Listar todas las Playlists guardadas
app.get('/api/templates', requireAuth, async (req, res) => {
    try {
        const playlists = await Playlist.findAll();
        res.json(playlists);
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

// 3. Cargar una Playlist guardada en una pantalla (Reemplazar)
app.post('/api/templates/:id/load', requireAuth, async (req, res) => {
    const { targetScreen } = req.body;
    const templateId = req.params.id;

    try {
        // Obtener items de la plantilla
        const templateItems = await SavedPlaylistItem.findAll({
            where: { PlaylistId: templateId },
            order: [['order', 'ASC']]
        });

        if (templateItems.length === 0) return res.status(400).json({ message: 'La playlist está vacía' });

        // Borrar cola actual
        await PlaylistItem.destroy({ where: { targetScreen } });

        // Insertar nuevos
        for (const item of templateItems) {
            await PlaylistItem.create({
                targetScreen,
                MediaItemId: item.MediaItemId,
                order: item.order,
                duration: item.duration,
                transition: item.transition
            });
        }

        await notifyUpdate(targetScreen, true); // true = restart
        res.json({ success: true, message: 'Playlist cargada en pantalla' });
    } catch (e) { console.error(e); res.status(500).json({ message: 'Error al cargar' }); }
});

// 4. Eliminar una Playlist guardada
app.delete('/api/templates/:id', requireAuth, async (req, res) => {
    try {
        await Playlist.destroy({ where: { id: req.params.id } });
        res.json({ success: true, message: 'Playlist eliminada' });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

// --- EDICIÓN DE ITEMS EN COLA ACTIVA ---

// Editar duración/transición de un item específico en la cola
app.put('/api/playlist-item/:id', requireAuth, async (req, res) => {
    const { duration, transition } = req.body;
    try {
        const item = await PlaylistItem.findByPk(req.params.id);
        if (!item) return res.status(404).json({ message: 'Item no encontrado' });

        if (duration) item.duration = duration;
        if (transition) item.transition = transition;
        
        await item.save();

        await notifyUpdate(item.targetScreen, true); // Reiniciar para aplicar cambios
        res.json({ success: true, message: 'Item actualizado' });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

// Actualizar Orden (Recibe array de objetos con ID)
app.post('/api/playlist/update', requireAuth, async (req, res) => {
    const { targetScreen, newPlaylist } = req.body; // newPlaylist es array de items ya formateados
    
    try {
        // Borrar playlist actual de ese target
        await PlaylistItem.destroy({ where: { targetScreen } });

        // Insertar nuevos en orden
        for (let i = 0; i < newPlaylist.length; i++) {
            const item = newPlaylist[i];
            await PlaylistItem.create({
                order: i,
                targetScreen: targetScreen,
                MediaItemId: item.mediaId
            });
        }

        await notifyUpdate(targetScreen, true);
        res.json({ success: true, message: 'Playlist actualizada' });
    } catch (e) { 
        console.error(e);
        res.status(500).json({ message: 'Error al actualizar' }); 
    }
});

// Subir Múltiples Archivos
app.post('/api/publish', requireAuth, (req, res) => {
    upload.array('media')(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            // Error de Multer (ej. archivo muy grande)
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ message: 'Error: El archivo supera el límite de 150MB.' });
            }
            return res.status(500).json({ message: `Error de subida: ${err.message}` });
        } else if (err) {
            return res.status(500).json({ message: `Error desconocido: ${err.message}` });
        }

        // Si todo va bien, procesamos los archivos
        const { duration, targetScreen, transition } = req.body;
        
        if (!req.files || req.files.length === 0) return res.status(400).json({ message: 'Falta contenido' });

        try {
            // Obtener el último orden
            const lastItem = await PlaylistItem.findOne({
                where: { targetScreen },
                order: [['order', 'DESC']]
            });
            let nextOrder = lastItem ? lastItem.order + 1 : 0;

            for (const file of req.files) {
                const isVideo = file.mimetype.startsWith('video/');
                
                // 1. Crear MediaItem
                const media = await MediaItem.create({
                    type: isVideo ? 'video' : 'image',
                    url: `/uploads/${file.filename}`,
                    filename: file.filename,
                    originalName: file.originalname,
                    duration: parseInt(duration) * 1000,
                    transition: transition || 'fade'
                });

                // 2. Asociar a Playlist
                await PlaylistItem.create({
                    order: nextOrder++,
                    targetScreen: targetScreen,
                    MediaItemId: media.id
                });
            }

            await notifyUpdate(targetScreen, true);
            res.json({ success: true, message: `${req.files.length} elementos agregados` });
        } catch (e) {
            console.error(e);
            res.status(500).json({ message: 'Error guardando en BD' });
        }
    });
});

app.post('/api/clear', requireAuth, async (req, res) => {
    const { targetScreen } = req.body;
    try {
        await PlaylistItem.destroy({ where: { targetScreen } });
        await notifyUpdate(targetScreen, true);
        res.json({ success: true, message: 'Playlist limpiada' });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

// --- NOTIFICACIONES SOCKET ---
async function notifyUpdate(targetScreen, restart = false) {
    if (targetScreen === 'ALL') {
        // Notificar a todos los que dependen de Global
        for (const [sid, data] of Object.entries(connectedSockets)) {
            // Verificar si la pantalla tiene playlist propia
            const hasOwn = await PlaylistItem.count({ where: { targetScreen: data.screenId } });
            const screen = await Screen.findOne({ where: { screenId: data.screenId } });
            
            if (!hasOwn && screen && screen.authorized) {
                const playlist = await getEffectivePlaylist(data.screenId);
                io.to(sid).emit('update_playlist', { playlist, restart });
            }
        }
    } else {
        // Notificar pantalla específica
        const matchingSockets = Object.entries(connectedSockets).filter(([_, s]) => s.screenId === targetScreen);
        if (matchingSockets.length > 0) {
            const screen = await Screen.findOne({ where: { screenId: targetScreen } });
            if (screen && screen.authorized) {
                const playlist = await getEffectivePlaylist(targetScreen);
                for (const [sid] of matchingSockets) {
                    io.to(sid).emit('update_playlist', { playlist, restart });
                }
            }
        }
    }
}

io.on('connection', (socket) => {
    socket.on('register_screen', async (data) => {
        // Soporte para cliente antiguo (string) o nuevo (objeto con isApk)
        let screenId = '';
        let isApk = false;
        
        if (typeof data === 'string') {
            screenId = data;
        } else if (data && data.screenId) {
            screenId = data.screenId;
            isApk = !!data.isApk;
        }

        connectedSockets[socket.id] = { screenId, isApk };
        console.log(`Pantalla conectada: ${screenId} (APK: ${isApk})`);
        
        const screen = await Screen.findOne({ where: { screenId } });

        if (screen) {
            screen.lastSeen = new Date();
            await screen.save();
        }

        if (screen && screen.authorized) {
            socket.emit('authorization_change', { authorized: true });
            const playlist = await getEffectivePlaylist(screenId);
            socket.emit('update_playlist', { playlist, restart: true });
        } else {
            socket.emit('authorization_change', { authorized: false });
        }
    });
    
    socket.on('disconnect', () => {
        delete connectedSockets[socket.id];
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
