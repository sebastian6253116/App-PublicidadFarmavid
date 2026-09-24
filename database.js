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
    authorized: { type: DataTypes.BOOLEAN, defaultValue: false },
    lastSeen: { type: DataTypes.DATE, allowNull: true }
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

// Playlist Guardada (Plantilla)
const Playlist = sequelize.define('Playlist', {
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    description: { type: DataTypes.STRING }
});

// Elementos de Playlist Guardada
const SavedPlaylistItem = sequelize.define('SavedPlaylistItem', {
    order: { type: DataTypes.INTEGER, defaultValue: 0 },
    duration: { type: DataTypes.INTEGER }, // Override de duración
    transition: { type: DataTypes.STRING } // Override de transición
});

// Relación: Pantalla -> Playlist (Items Activos)
// Usamos una tabla intermedia para manejar el orden y pertenencia
const PlaylistItem = sequelize.define('PlaylistItem', {
    order: { type: DataTypes.INTEGER, defaultValue: 0 },
    targetScreen: { type: DataTypes.STRING, allowNull: false }, // 'ALL' o screenId
    duration: { type: DataTypes.INTEGER }, // Override de duración específico
    transition: { type: DataTypes.STRING } // Override de transición específico
});

// Relaciones
MediaItem.hasMany(PlaylistItem, { onDelete: 'CASCADE' });
PlaylistItem.belongsTo(MediaItem);

Playlist.hasMany(SavedPlaylistItem, { onDelete: 'CASCADE' });
SavedPlaylistItem.belongsTo(Playlist);
SavedPlaylistItem.belongsTo(MediaItem);

// Función de inicialización
const initDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Conexión a MySQL exitosa.');
        
        // Sincronizar modelos: crea tablas si no existen, pero NUNCA altera las existentes.
        // OJO: la opción alter de sync() está PROHIBIDA en producción porque puede ELIMINAR
        // columnas que existen en la base de datos pero no en el modelo, destruyendo datos de
        // forma irreversible. Por eso usamos sync() simple y migramos a mano de forma idempotente.
        await sequelize.sync();
        console.log('✅ Base de datos sincronizada.');

        // Migración idempotente: agregar 'lastSeen' a Screens si falta.
        // La limpieza de pantallas no autorizadas depende de esta columna.
        // Si algo falla acá, avisamos FUERTE pero NO tumbamos el arranque: la app debe seguir viva.
        try {
            const qi = sequelize.getQueryInterface();
            const cols = await qi.describeTable('Screens');
            if (!cols.lastSeen) {
                await qi.addColumn('Screens', 'lastSeen', { type: DataTypes.DATE, allowNull: true });
                console.log('✅ Columna lastSeen agregada a la tabla Screens.');
            }
        } catch (migrationError) {
            console.error('❌ ERROR CRÍTICO en migración de lastSeen:', migrationError.message);
        }
        
        // Crear admin por defecto si no existe
        const [admin, created] = await User.findOrCreate({
            where: { username: 'admin' },
            defaults: { password: '123' }
        });
        
        if (created) {
            console.log('👤 Usuario admin creado por defecto.');
        } else {
            console.log('👤 Usuario admin ya existe.');
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
    Playlist,
    SavedPlaylistItem,
    PlaylistItem,
    initDB
};
