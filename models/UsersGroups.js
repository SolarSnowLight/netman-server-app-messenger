module.exports = function (sequelize, DataTypes) {
    return sequelize.define('users_groups', {
        id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true
        },
        users_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
    });
};