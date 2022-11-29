module.exports = function (sequelize, DataTypes) {
    return sequelize.define('rooms', {
        id: {
            type: DataTypes.STRING(256),
            allowNull: false,
            primaryKey: true,
            autoIncrement: false
        }
    });
};