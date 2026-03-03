const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { initDB, User, Screen, MediaItem, PlaylistItem, sequelize } = require('./database');

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
const upload = multer({ storage });

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
    // Pantallas en BD
    const dbScreens = await Screen.findAll();
    const result = dbScreens.map(s => ({
        id: s.screenId,
        authorized: s.authorized,
        online: Object.values(connectedSockets).some(sock => sock.screenId === s.screenId),
        name: s.name
    }));

    // Pantallas online pero NO en BD (nuevas)
    for (const [socketId, data] of Object.entries(connectedSockets)) {
        if (!result.find(r => r.id === data.screenId)) {
            result.push({
                id: data.screenId,
                authorized: false,
                online: true,
                name: data.screenId
            });
        }
    }
    res.json(result);
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
                io.to(socketEntry[0]).emit('update_playlist', playlist);
            }
        }
        res.json({ success: true, message: `Pantalla ${authorized ? 'autorizada' : 'desactivada'}` });
    } catch (e) { res.status(500).json({ message: 'Error DB' }); }
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
        duration: item.MediaItem.duration,
        transition: item.MediaItem.transition,
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
        duration: item.MediaItem.duration,
        transition: item.MediaItem.transition,
        name: item.MediaItem.originalName
    }));
    res.json(formatted);
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

        await notifyUpdate(targetScreen);
        res.json({ success: true, message: 'Playlist actualizada' });
    } catch (e) { 
        console.error(e);
        res.status(500).json({ message: 'Error al actualizar' }); 
    }
});

// Subir Múltiples Archivos
app.post('/api/publish', requireAuth, upload.array('media'), async (req, res) => {
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

        await notifyUpdate(targetScreen);
        res.json({ success: true, message: `${req.files.length} elementos agregados` });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error guardando en BD' });
    }
});

app.post('/api/clear', requireAuth, async (req, res) => {
    const { targetScreen } = req.body;
    try {
        await PlaylistItem.destroy({ where: { targetScreen } });
        await notifyUpdate(targetScreen);
        res.json({ success: true, message: 'Playlist limpiada' });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

// --- NOTIFICACIONES SOCKET ---
async function notifyUpdate(targetScreen) {
    if (targetScreen === 'ALL') {
        // Notificar a todos los que dependen de Global
        for (const [sid, data] of Object.entries(connectedSockets)) {
            // Verificar si la pantalla tiene playlist propia
            const hasOwn = await PlaylistItem.count({ where: { targetScreen: data.screenId } });
            const screen = await Screen.findOne({ where: { screenId: data.screenId } });
            
            if (!hasOwn && screen && screen.authorized) {
                const playlist = await getEffectivePlaylist(data.screenId);
                io.to(sid).emit('update_playlist', playlist);
            }
        }
    } else {
        // Notificar pantalla específica
        const socketEntry = Object.entries(connectedSockets).find(([_, s]) => s.screenId === targetScreen);
        if (socketEntry) {
            const screen = await Screen.findOne({ where: { screenId: targetScreen } });
            if (screen && screen.authorized) {
                const playlist = await getEffectivePlaylist(targetScreen);
                io.to(socketEntry[0]).emit('update_playlist', playlist);
            }
        }
    }
}

io.on('connection', (socket) => {
    socket.on('register_screen', async (screenId) => {
        connectedSockets[socket.id] = { screenId };
        console.log(`Pantalla conectada: ${screenId}`);
        
        const screen = await Screen.findOne({ where: { screenId } });
        if (screen && screen.authorized) {
            socket.emit('authorization_change', { authorized: true });
            const playlist = await getEffectivePlaylist(screenId);
            socket.emit('update_playlist', playlist);
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
