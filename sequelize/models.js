//****************************************************************
//Определение взаимосвязей между сущностями базы данных
//и синхронизация с основной базой данных
//****************************************************************
const config = require("config");           //подключение конфига
const Sequelize = require("sequelize");
const sequelize = new Sequelize(            //установка подключения с базой данных
    config.get("database").database,
    config.get("database").user,
    config.get("database").password,
    {
        dialect: "postgres",
        host: config.get("database").host,
        port: config.get("database").port,
        define: {
            timestamps: false
        }
    }
);

//-----------------------------------------------------------------------------------------
//взаимодействие с моделями базы данных
const UsersMessages     = require('../models/UsersMessages')(sequelize, Sequelize);
const Groups            = require('../models/Groups')(sequelize, Sequelize);
const UsersGroups       = require('../models/UsersGroups')(sequelize, Sequelize);
const GroupsMessages    = require('../models/GroupsMessages')(sequelize, Sequelize);
const GroupsMessagesViews
                        = require('../models/GroupsMessagesViews')(sequelize, Sequelize);
const Rooms             = require('../models/Rooms')(sequelize, Sequelize);

// Установка взаимосвязей между таблицами
Groups.hasMany(UsersGroups, {
    foreignKey: {
        name: 'groups_id',
        allowNull: false,
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
    }
});

Groups.hasMany(GroupsMessages, {
    foreignKey: {
        name: 'groups_id',
        allowNull: false,
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
    }
});

GroupsMessages.hasMany(GroupsMessagesViews, {
    foreignKey: {
        name: 'message_id',
        allowNull: false,
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
    }
});

Rooms.hasMany(UsersMessages, {
    foreignKey: {
        name: 'rooms_id',
        allowNull: false,
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
    }
});

Rooms.hasMany(Groups, {
    foreignKey: {
        name: 'rooms_id',
        allowNull: false,
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
    }
});

//синхронизация моделей с базой данных
sequelize.sync().then(result => {
    console.log(result);
}).catch(err => console.log(err));

module.exports.UsersMessages    = UsersMessages;
module.exports.Groups           = Groups;
module.exports.UsersGroups      = UsersGroups;
module.exports.GroupsMessages   = GroupsMessages;
module.exports.GroupsMessagesViews
                                = GroupsMessagesViews;
module.exports.Rooms            = Rooms;
module.exports.sequelize        = sequelize;
module.exports.Sequelize        = Sequelize;
