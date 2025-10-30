const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Pelicula = sequelize.define('Pelicula', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    modelo: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true
    },
    compatibilidade: {
        type: DataTypes.TEXT,
        allowNull: true,
        get() {
            const value = this.getDataValue('compatibilidade');
            return value ? JSON.parse(value) : [];
        },
        set(value) {
            this.setDataValue('compatibilidade', JSON.stringify(value));
        }
    },
    html_content: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Conteúdo HTML personalizado para o celular'
    },
    vip: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    compativel: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    // Campos adicionais para controle
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'peliculas',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            fields: ['modelo']
        },
        {
            fields: ['vip']
        }
    ]
});

module.exports = Pelicula;
