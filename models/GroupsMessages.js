module.exports = function (sequelize, DataTypes) {
    return sequelize.define('groups_messages', {
        id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true
        },
        sender_users_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        message: {
            type: DataTypes.STRING(1024),
            allowNull: false,
        },
        link_media: {
            type: DataTypes.STRING(1024),
            allowNull: true,
        },
        type: {
            type: DataTypes.STRING(30),
            allowNull: true,
        },
        date_send: {
            type: DataTypes.DATE,
            allowNull: false
        }
    });
};