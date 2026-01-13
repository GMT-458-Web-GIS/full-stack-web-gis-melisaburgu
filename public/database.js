const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite',
    logging: false
});

const User = sequelize.define('User', {
    username: { type: DataTypes.STRING, unique: true, allowNull: false },
    password: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.ENUM('admin', 'editor', 'viewer'), defaultValue: 'viewer' },
    color: { type: DataTypes.STRING, defaultValue: '#3498db' }
});

// "Point" tablosunu "Feature" (Coğrafi Nesne) olarak değiştirdik
const Feature = sequelize.define('Feature', {
    name: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.ENUM('point', 'line', 'polygon'), allowNull: false }, // Türü ne?
    coordinates: { type: DataTypes.TEXT, allowNull: false }, // Koordinatları JSON string olarak saklayacağız
    createdBy: { type: DataTypes.STRING },
    userColor: { type: DataTypes.STRING }
});

module.exports = { sequelize, User, Feature };