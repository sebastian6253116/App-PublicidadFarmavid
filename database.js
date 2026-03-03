const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

// Configuración de la conexión
// En producción, usar variables de entorno. Para dev local, valores por defecto.
const sequelize = new Sequelize(
    process.env.DB_NAME || 'publicidad_db',
    process.env.DB_USER || 'root',
    process.env.DB_PASS || 'password',
    {
        host: process.env.DB_HOST || 'localhost',
        dialect: 'mysql',
        logging: false, // Desactivar logs SQL en consola
    }
);

// --- MODELOS ---

// Usuario
const User = sequelize.define('User', {
    username: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false }
});

// Pantalla (TV)
const Screen = sequelize.define('Screen', {
    screenId: { type: DataTypes.STRING, allowNull: false, unique: true },
    name: { type: DataTypes.STRING, allowNull: false },
    authorized: { type: DataTypes.BOOLEAN, defaultValue: false }
});

// Elemento Multimedia (Imagen/Video)
const MediaItem = sequelize.define('MediaItem', {
    type: { type: DataTypes.ENUM('image', 'video'), allowNull: false },
    url: { type: DataTypes.STRING, allowNull: false },
    filename: { type: DataTypes.STRING, allowNull: false }, // Nombre archivo físico
    originalName: { type: DataTypes.STRING }, // Nombre original subido
    duration: { type: DataTypes.INTEGER, defaultValue: 10000 }, // En ms
    transition: { type: DataTypes.STRING, defaultValue: 'fade' }
});

// Relación: Pantalla -> Playlist (Items)
// Usamos una tabla intermedia para manejar el orden y pertenencia
const PlaylistItem = sequelize.define('PlaylistItem', {
    order: { type: DataTypes.INTEGER, defaultValue: 0 },
    targetScreen: { type: DataTypes.STRING, allowNull: false } // 'ALL' o screenId
});

// Relaciones
MediaItem.hasMany(PlaylistItem, { onDelete: 'CASCADE' });
PlaylistItem.belongsTo(MediaItem);

// Función de inicialización
const initDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Conexión a MySQL exitosa.');
        
        // Sincronizar modelos (crear tablas si no existen)
        // En producción usar migraciones, aquí sync para prototipo rápido
        await sequelize.sync({ alter: true });
        
        // Crear admin por defecto si no existe
        const admin = await User.findOne({ where: { username: 'admin' } });
        if (!admin) {
            await User.create({ username: 'admin', password: '123' });
            console.log('👤 Usuario admin creado por defecto.');
        }
        
    } catch (error) {
        console.error('❌ Error conectando a la base de datos:', error.message);
        console.log('⚠️ Asegúrate de tener MySQL corriendo y la base de datos creada.');
    }
};

module.exports = {
    sequelize,
    User,
    Screen,
    MediaItem,
    PlaylistItem,
    initDB
};
