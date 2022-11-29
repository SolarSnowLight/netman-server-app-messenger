module.exports = function (sequelize, DataTypes) {
    return sequelize.define('groups_messages_views', {
        id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true
        },
        users_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        view: {
            type: DataTypes.BOOLEAN,
            allowNull: false
        }
    });
};