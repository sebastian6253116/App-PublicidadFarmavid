const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('public/uploads'));

// --- PERSISTENCIA DE DATOS (JSON) ---
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SCREENS_FILE = path.join(DATA_DIR, 'screens.json');
const PLAYLISTS_FILE = path.join(DATA_DIR, 'playlists.json'); // Nueva persistencia para playlists

// Asegurar directorios
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Helpers para leer/guardar JSON
const readJson = (file, defaultVal) => {
    try {
        if (!fs.existsSync(file)) return defaultVal;
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) { return defaultVal; }
};
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// Cargar datos iniciales
let users = readJson(USERS_FILE, [{ username: 'admin', password: '123', id: 1 }]);
let savedScreens = readJson(SCREENS_FILE, {}); 
let playlists = readJson(PLAYLISTS_FILE, { 'ALL': [] }); 

// --- MIDDLEWARE DE AUTENTICACIÓN ---
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
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        res.json({ success: true, token: 'admin-token-secret', username: user.username });
    } else {
        res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
    }
});

app.get('/api/users', requireAuth, (req, res) => {
    res.json(users.map(u => ({ id: u.id, username: u.username })));
});

app.post('/api/users', requireAuth, (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Datos incompletos' });
    if (users.find(u => u.username === username)) return res.status(400).json({ message: 'Usuario ya existe' });
    const newUser = { id: Date.now(), username, password };
    users.push(newUser);
    writeJson(USERS_FILE, users);
    res.json({ success: true, message: 'Usuario creado' });
});

app.put('/api/users/:id/password', requireAuth, (req, res) => {
    const { password } = req.body;
    const id = parseInt(req.params.id);
    const userIdx = users.findIndex(u => u.id === id);
    if (userIdx !== -1) {
        users[userIdx].password = password;
        writeJson(USERS_FILE, users);
        res.json({ success: true, message: 'Contraseña actualizada' });
    } else {
        res.status(404).json({ message: 'Usuario no encontrado' });
    }
});

app.delete('/api/users/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const user = users.find(u => u.id === id);
    if (user && user.username === 'admin') return res.status(403).json({ message: 'No puedes borrar al admin principal' });
    users = users.filter(u => u.id !== id);
    writeJson(USERS_FILE, users);
    res.json({ success: true, message: 'Usuario eliminado' });
});

// --- API PANTALLAS ---
app.get('/api/screens', requireAuth, (req, res) => {
    const result = [];
    for (const [id, data] of Object.entries(savedScreens)) {
        const isOnline = Object.values(connectedSockets).some(s => s.screenId === id);
        result.push({
            id: id,
            authorized: data.authorized,
            online: isOnline,
            name: data.name || id
        });
    }
    for (const [socketId, data] of Object.entries(connectedSockets)) {
        if (!savedScreens[data.screenId]) {
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

app.post('/api/screens/:id/authorize', requireAuth, (req, res) => {
    const { id } = req.params;
    const { authorized } = req.body;
    if (!savedScreens[id]) savedScreens[id] = { name: id };
    savedScreens[id].authorized = authorized;
    writeJson(SCREENS_FILE, savedScreens);
    const socketEntry = Object.entries(connectedSockets).find(([_, s]) => s.screenId === id);
    if (socketEntry) {
        io.to(socketEntry[0]).emit('authorization_change', { authorized });
        if (authorized) {
            io.to(socketEntry[0]).emit('update_playlist', getEffectivePlaylist(id));
        }
    }
    res.json({ success: true, message: `Pantalla ${authorized ? 'autorizada' : 'desactivada'}` });
});

// --- API PLAYLIST ---
const getEffectivePlaylist = (screenId) => {
    if (savedScreens[screenId] && !savedScreens[screenId].authorized) return [];
    if (playlists[screenId] && playlists[screenId].length > 0) return playlists[screenId];
    return playlists['ALL'];
};

// Obtener playlist de una pantalla
app.get('/api/playlist/:target', requireAuth, (req, res) => {
    const target = req.params.target;
    res.json(playlists[target] || []);
});

// Actualizar playlist completa (Reordenar/Editar)
app.post('/api/playlist/update', requireAuth, (req, res) => {
    const { targetScreen, newPlaylist } = req.body;
    
    if (!targetScreen || !Array.isArray(newPlaylist)) {
        return res.status(400).json({ message: 'Datos inválidos' });
    }

    playlists[targetScreen] = newPlaylist;
    writeJson(PLAYLISTS_FILE, playlists);

    // Notificar cambios
    if (targetScreen === 'ALL') {
        Object.entries(connectedSockets).forEach(([sid, data]) => {
            if (isAuthorized(data.screenId) && (!playlists[data.screenId] || playlists[data.screenId].length === 0)) {
                io.to(sid).emit('update_playlist', playlists['ALL']);
            }
        });
    } else {
        const socketEntry = Object.entries(connectedSockets).find(([_, s]) => s.screenId === targetScreen);
        if (socketEntry && isAuthorized(targetScreen)) {
            io.to(socketEntry[0]).emit('update_playlist', playlists[targetScreen]);
        }
    }

    res.json({ success: true, message: 'Playlist actualizada' });
});

// Subir Múltiples Archivos
app.post('/api/publish', requireAuth, upload.array('media'), (req, res) => {
    const { duration, targetScreen, transition } = req.body;
    
    if (!req.files || req.files.length === 0) return res.status(400).json({ message: 'Falta contenido multimedia' });

    if (!playlists[targetScreen]) playlists[targetScreen] = [];

    req.files.forEach(file => {
        const isVideo = file.mimetype.startsWith('video/');
        const newItem = {
            id: Date.now() + Math.random(), // ID único
            type: isVideo ? 'video' : 'image',
            url: `/uploads/${file.filename}`,
            duration: parseInt(duration) * 1000,
            transition: transition || 'fade',
            name: file.originalname
        };
        playlists[targetScreen].push(newItem);
    });

    writeJson(PLAYLISTS_FILE, playlists);

    // Notificar cambios (igual que antes)
    if (targetScreen === 'ALL') {
        Object.entries(connectedSockets).forEach(([sid, data]) => {
            if (isAuthorized(data.screenId) && (!playlists[data.screenId] || playlists[data.screenId].length === 0)) {
                io.to(sid).emit('update_playlist', playlists['ALL']);
            }
        });
    } else {
        const socketEntry = Object.entries(connectedSockets).find(([_, s]) => s.screenId === targetScreen);
        if (socketEntry && isAuthorized(targetScreen)) {
            io.to(socketEntry[0]).emit('update_playlist', playlists[targetScreen]);
        }
    }

    res.json({ success: true, message: `${req.files.length} elementos agregados` });
});

app.post('/api/clear', requireAuth, (req, res) => {
    const { targetScreen } = req.body;
    if (targetScreen === 'ALL') {
        playlists['ALL'] = [];
        writeJson(PLAYLISTS_FILE, playlists);
        Object.entries(connectedSockets).forEach(([sid, data]) => {
            if (isAuthorized(data.screenId) && (!playlists[data.screenId] || playlists[data.screenId].length === 0)) {
                io.to(sid).emit('update_playlist', []);
            }
        });
    } else {
        playlists[targetScreen] = [];
        writeJson(PLAYLISTS_FILE, playlists);
        const socketEntry = Object.entries(connectedSockets).find(([_, s]) => s.screenId === targetScreen);
        if (socketEntry && isAuthorized(targetScreen)) {
            io.to(socketEntry[0]).emit('update_playlist', playlists['ALL']);
        }
    }
    res.json({ success: true, message: 'Playlist limpiada' });
});

function isAuthorized(screenId) {
    return savedScreens[screenId] && savedScreens[screenId].authorized;
}

io.on('connection', (socket) => {
    socket.on('register_screen', (screenId) => {
        connectedSockets[socket.id] = { screenId };
        console.log(`Pantalla conectada: ${screenId}`);
        if (isAuthorized(screenId)) {
            socket.emit('authorization_change', { authorized: true });
            socket.emit('update_playlist', getEffectivePlaylist(screenId));
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
