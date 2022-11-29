//-----------------------------------------------------------------------------------------
//Маршрутизация обработки групповых сообщений
//-----------------------------------------------------------------------------------------
const { Router } = require('express');
const { check, validationResult }
    = require('express-validator');         //для валидации поступивших данных
const router = Router();                    //маршрутизация
const logger = require('../logger/logger'); //логгер
const fetch = require('node-fetch');
const config = require("config");           //подключение конфига
const { address_config }
    = require('../config/address.config');  //константы маршрутов
const {                                     //подключение моделей для взаимодействия с базой данных
    UsersGroups, UsersMessages,
    Groups, GroupsMessages,
    sequelize, Sequelize,
    GroupsMessagesViews
} = require('../sequelize/models');
const { checkToken, checkExists }
    = require("../checks/token.access");    //проверка токена

Array.prototype.removeIf = function (callback) {
    var i = this.length;
    while (i--) {
        if (callback(this[i], i)) {
            this.splice(i, 1);
        }
    }
};

Array.prototype.removeIfAsync = async function (callback) {
    var i = this.length;
    while (i--) {
        if (await callback(this[i], i)) {
            this.splice(i, 1);
        }
    }
};

const allNewGroupsMessages = async (users_id, access_token) => {
    const check_user_exists = await checkExists(users_id);
    if (!check_user_exists) {
        return null;
    }

    let groups_data = [];
    const id_group = await UsersGroups.findAll({ where: { users_id: users_id } });
    if (id_group && (id_group.length > 0)) {
        //определение всех сообщений, которые были отправленны в групповом чате (общие сообщения чата)
        for (let i = 0; i < id_group.length; i++) {
            const groups_messages = await GroupsMessages.findAll({
                where: {
                    groups_id: id_group[i].dataValues.groups_id
                }
            });

            while (groups_messages.length > 0) {
                let count = 0;
                const current_id = groups_messages[0].dataValues.groups_id;
                const groupData = await Groups.findOne({ where: { id: id_group[i].dataValues.groups_id } });
                let last_message = groups_messages[0].dataValues.message;
                let current_date = groups_messages[0].dataValues.date_send;
                const ref = groupData.dataValues.ref_image;
                const current_room = groupData.dataValues.rooms_id;

                await groups_messages.removeIfAsync(async function (item, idx) {
                    if (item.dataValues.groups_id === current_id) {
                        //поиск информации об одном сообщении по отношению к текущему
                        //участнику группы
                        const user = await GroupsMessagesViews.findOne(
                            {
                                where: {
                                    users_id: users_id,
                                    message_id: item.dataValues.id,
                                    view: false,
                                }
                            }
                        );

                        if (user) {
                            count++;
                        }

                        if ((new Date(item.dataValues.date_send))
                            > (new Date(current_date))) {
                            current_date = item.dataValues.date_send;
                            last_message = item.dataValues.message;
                        }
                        return true;
                    }
                    return false;
                });

                groups_data.push({
                    users_id: null,
                    groups_id: current_id,
                    name: groupData.dataValues.name,
                    count_messages: count,
                    last_message: last_message,
                    ref_image: ref,
                    date_send: current_date,
                    rooms_id: current_room
                });
            }
        }
    }

    return groups_data;
}

module.exports.allNewGroupsMessages = allNewGroupsMessages;