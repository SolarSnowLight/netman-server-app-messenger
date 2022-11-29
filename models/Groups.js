module.exports = function (sequelize, DataTypes) {
    return sequelize.define('groups', {
        id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        creator_users_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        ref_image: {
            type: DataTypes.STRING(1024),
            allowNull: true
        },
        date_create: {
            type: DataTypes.DATE,
            allowNull: false
        }
    });
};