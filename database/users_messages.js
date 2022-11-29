//****************************************************
//ћаршрутизаци€ обработки пользовательских сообщений
//****************************************************

const { Router } = require('express');
const { check, validationResult }
    = require('express-validator');         //дл€ валидации поступивших данных
const router = Router();                    //маршрутизаци€
const logger = require('../logger/logger'); //логгер
const fetch = require('node-fetch');
const config = require("config");           //подключение конфига
const { address_config }
    = require('../config/address.config');  //константы маршрутов
const {                                     //подключение моделей дл€ взаимодействи€ с базой данных
    UsersMessages,
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

// —ортировка по дате
const dateSort = (data, type) => {
    const compare1 = (a, b) => {
        const date1 = new Date(a.date_send), date2 = new Date(b.date_send);
        if (date1 > date2) return 1;
        if (date1 == date2) return 0;
        if (date1 < date2) return -1;
    }

    const compare2 = (a, b) => {
        const date1 = new Date(a.date_send), date2 = new Date(b.date_send);
        if (date1 < date2) return 1;
        if (date1 == date2) return 0;
        if (date1 > date2) return -1;
    }
    data.sort((type) ? compare2 : compare1);

    return data;
};

// ѕолучить все приватные сообщени€ с конкретным пользователем
const allUserPrivateMessages = async (users_id, other_users_id) => {
    const check_user_exists = await checkExists(users_id);
    const check_other_exists = await checkExists(other_users_id);
    if ((!check_user_exists) || (!check_other_exists)) {
        return null;
    }

    const usersMessages1 = await UsersMessages.findAll({
        where: {
            sender_users_id: users_id,
            receiver_users_id: other_users_id
        }
    }),
        usersMessages2 = await UsersMessages.findAll({
            where: {
                sender_users_id: other_users_id,
                receiver_users_id: users_id
            }
        });

    // ѕолучение всех сообщений дл€ текущего чата пользовател€
    // с почтой email_current с пользователем email_other
    let usersMessages = usersMessages1.concat(usersMessages2);
    usersMessages = dateSort(usersMessages, false);

    return usersMessages;
}

module.exports.allUserPrivateMessages = allUserPrivateMessages;