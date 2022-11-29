//-----------------------------------------------------------------------------------------
//Маршрутизация обработки пользовательских сообщений
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

//prefix: /messenger/user/sending
router.post(                                //отправка личного сообщения
    address_config.m_user_sending,
    [
        check('email_sender', "Не корректный email адрес отправителя").isEmail(),
        check('email_receiver', "Не корректный email адрес получателя").isEmail(),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            const { email_sender, email_receiver,
                message, link_media,
                type, token
            } = req.body;

            if (!errors.isEmpty()) {
                logger.error({
                    method: 'POST',
                    address: address_config.messeger_user_sending,
                    message: 'Ошибка при валидации входных данных',
                    date: {
                        email_sender, email_receiver, message, link_media, type
                    }
                });
                return res.status(201).json({
                    errors: errors.array(),
                    message: "Некорректные данные при отправке сообщения"
                });
            }

            const check_token = true;   //await checkToken(token);
            const check_sender_exists = await checkExists(email_sender);
            const check_receiver_exists = await checkExists(email_receiver);

            if ((!check_token)
                || (!check_sender_exists)
                || (!check_receiver_exists)) {
                logger.error({
                    method: 'POST',
                    address: address_config.messeger_user_sending,
                    message: "Некорректные данные при отправке сообщения",
                    date: {
                        email_sender, email_receiver, message, link_media, type
                    }
                });
                return res.status(201).json({ "errors": null, "message": "Некорректные данные при отправке сообщения" });
            }

            if (link_media) {
                // TODO: Обработка отправка медиафайла как личного сообщения
            }

            //добавление нового сообщения в БД
            await UsersMessages.create({
                email_sender: email_sender,
                email_receiver: email_receiver,
                message: message,
                link_media: (link_media) ? link_media : null,
                type: (type) ? type : null,
                view: false, date_send: new Date()
            });

            logger.info({
                method: 'POST',
                address: address_config.messeger_user_sending,
                message: 'Отправка сообщения пользователем',
                date: {
                    email_sender, email_receiver, message, link_media, type
                }
            });
            res.status(201).json({ "errors": null, "message": null, sending: true});

        } catch (e) {
            logger.error({
                method: 'POST',
                address: address_config.messeger_user_sending,
                message: e.message,
            });
            res.status(201).json({ "errors": null, "message": "Ошибка при передачи данных, повторите попытку" });
        }
    });

//prefix: /messenger/user/chats
router.post(                                //получение всех возможных чатов, в которых участвует пользователь
    address_config.m_user_chats,
    async (req, res) => {
        try {
            const { email, token } = req.body;

            const check_token = true;   //await checkToken(token);
            const check_exists = await checkExists(email);

            /*if ((!check_token)
                || (!check_exists)) {
                logger.error({
                    method: 'POST',
                    address: address_config.messenger_user_chats,
                    message: "Некорректные данные при получении сообщений",
                    date: {
                        email
                    }
                });
                return res.status(201).json({ "errors": null, "message": "Некорректные данные при получении сообщений" });
            }*/

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

            let groups_data = [];

            // Интересуют лишь те группы, в которых участвует текущий пользователь
            const id_group = await UsersGroups.findAll({ where: { email: email } });
            if ((id_group) && (id_group.length > 0)) {
                // Определение всех сообщений, которые были отправлены в групповом чате
                for (let i = 0; i < id_group.length; i++) {
                    const groups_messages = await GroupsMessages.findAll({
                        where: {
                            groups_id: id_group[i].dataValues.groups_id
                        }
                    });

                    groups_messages.sort((a, b) => {
                        const d1 = new Date(a.date_send), d2 = new Date(b.date_send);

                        if (d1 > d2) return 1;
                        else if (d1 < d2) return (-1);
                        return 0;
                    });

                    // Фильтрация всех сообщений в данном групповом чате по принципу
                    // "последнего отправленного сообщения"
                    if (groups_messages.length > 0) {
                        // Идентификатор группы
                        let last_index = (groups_messages.length - 1);
                        const current_id = groups_messages[last_index].dataValues.groups_id;

                        // email отправителя
                        const current_email = groups_messages[last_index].dataValues.email_sender;

                        // Последнее отправленное сообщение
                        let last_message = groups_messages[last_index].dataValues.message;

                        // Дата отправления последнего сообщения
                        let current_date = groups_messages[last_index].dataValues.date_send;

                        let count = 0;

                        // Видимость сообщений определённым игроком
                        const dataViews = await GroupsMessagesViews.findAll({
                            where: {
                                message_id: {
                                    [Sequelize.Op.in]: groups_messages.map((item) => item.id)
                                },
                                email: email
                            }
                        });

                        // Поиск в dataViews по id отправленного командного сообщения
                        const findIndex = (id) => {
                            for (let j = 0; j < dataViews.length; j++) {
                                if (dataViews[j].dataValues.message_id === id) {
                                    return j;
                                }
                            }

                            return (-1);
                        }

                        for (let i = 0; i < groups_messages.length; i++) {
                            const idx = findIndex(groups_messages[i].dataValues.id);
                            if (idx >= 0) {
                                groups_messages[i].dataValues.view = dataViews[idx].dataValues.view;
                            } else {
                                groups_messages[i].dataValues.view = true;
                            }
                        }

                        if (current_email != email) {
                            let index = (-1);
                            for (let i = (groups_messages.length - 1); i >= 0; i--) {
                                if (groups_messages[i].dataValues.view === false) {
                                    index = i;
                                    break;
                                }
                            }

                            if (index >= 0) {
                                // Имеются не прочитанные сообщения, которые означают,
                                // что последнее сообщение новое и перед ним были непрочитанные сообщения
                                // и их количество необходимо узнать (это, как правило, последовательность)
                                for (let i = index; i >= 0; i--) {
                                    if ((groups_messages[i].dataValues.view === false)
                                        && (groups_messages[i].dataValues.email_sender === current_email)) {
                                        count++;
                                    }
                                }
                            }

                            // Все сообщения были прочитаны и можно
                            // не изменять данные о последнем прочитанном сообщении
                        }

                        // Общие данные о группе
                        const groupData = await Groups.findOne({ where: { id: id_group[i].dataValues.groups_id } });

                        // Получение информации о пользователе, который отправил последнее сообщение
                        let sender_info = null;
                        await fetch(address_config.cs_player_info, {
                            method: 'POST',
                            headers: {
                                'Accept': 'application/json',
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ email: current_email, token: token })
                        })
                            .then(res => res.json())
                            .then(json => {
                                sender_info = json;
                            });

                        groups_data.push({
                            groups_id: current_id,
                            email: null,
                            name_chat: groupData.dataValues.name,
                            nickname_sender: sender_info.nickname,
                            count_messages: count,
                            last_message: last_message,
                            ref_image: groupData.dataValues.ref_image,
                            date_send: current_date,
                            rooms_id: groupData.dataValues.rooms_id
                        });
                    }
                }
            }

            // Все сообщения, которые пользователь когда-либо отправил или принял
            const users_messages = await UsersMessages.findAll({
                where: {
                    [Sequelize.Op.or]: [
                        { email_receiver: email },
                        { email_sender: email }
                    ]
                }
            });

            users_messages.removeIf((item) => {
                return ((item.email_sender != email) && (item.email_receiver != email));
            });

            let users_data = [];
            while (users_messages.length > 0) {
                let current_messages = [];
                let other_email = (users_messages[0].dataValues.email_sender === email) ?
                    users_messages[0].dataValues.email_receiver : users_messages[0].dataValues.email_sender;

                users_messages.removeIf((item) => {
                    if (((item.email_sender === other_email) && (item.email_receiver === email))
                        || ((item.email_sender === email) && (item.email_receiver === other_email))) {
                        current_messages.push(item);
                        return true;
                    }

                    return false;
                });

                // Сортировка всех сообщений
                current_messages.sort((a, b) => {
                    const d1 = new Date(a.date_send), d2 = new Date(b.date_send);

                    if (d1 > d2) return 1;
                    else if (d1 < d2) return (-1);
                    return 0;
                });

                //определение всех сообщений, которые были получены пользователем
                const last_index = (current_messages.length - 1);

                let current_email   = current_messages[last_index].dataValues.email_sender;
                let current_date    = current_messages[last_index].dataValues.date_send;
                let rooms_id        = current_messages[last_index].dataValues.rooms_id;
                let count = 0;

                // Когда email отправителя не совпадает с email текущего пользователя,
                // это означает, что последнее сообщение отправил другой пользователь
                // и есть необходимость подсчитать общее количество сообщений, 
                // которое получателем не было прочитано
                if (current_email != email) {
                    let index = (-1);
                    for (let i = (current_messages.length - 1); i >= 0; i--) {
                        if (current_messages[i].dataValues.view === false) {
                            index = i;
                            break;
                        }
                    }

                    if (index >= 0) {
                        // Имеются не прочитанные сообщения, которые означают,
                        // что последнее сообщение новое и перед ним были непрочитанные сообщения
                        // и их количество необходимо узнать (это, как правило, последовательность)
                        for (let i = index; i >= 0; i--) {
                            if ((current_messages[i].dataValues.view === false)
                                && (current_messages[i].dataValues.email_sender === current_email)) {
                                count++;
                            }
                        }
                    }

                    // Все сообщения были прочитаны и можно
                    // не изменять данные о последнем прочитанном сообщении
                }

                // Получение информации о пользователе, с которым ведётся переписка
                let other_info = null;
                await fetch(address_config.cs_player_info, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email: other_email, token: token })
                })
                    .then(res => res.json())
                    .then(json => {
                        other_info = json;
                    });

                // Определение никнейма того пользователя, который отправил последнее сообщение в чат
                if (current_messages[last_index].dataValues.email_sender === other_email) {
                    other_info.nickname_sender = other_info.nickname;
                } else {
                    await fetch(address_config.cs_player_info, {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ email: email, token: token })
                    })
                        .then(res => res.json())
                        .then(json => {
                            other_info.nickname_sender = json.nickname;
                        });
                }

                if (other_info) {
                    users_data.push({
                        groups_id: null,
                        email: other_info.users_email,
                        count_messages: count,
                        last_message: current_messages[last_index].dataValues.message,
                        name_chat: other_info.nickname,
                        nickname_sender: other_info.nickname_sender,
                        ref_image: other_info.ref_image,
                        date_send: current_date,
                        rooms_id: rooms_id
                    });
                }
            }

            // Массивы groups_data и users_data имеют один и тот же шаблон, по которому можно однозначно определить приватное
            // сообщение или нет. Поэтому, они будут соединены в один большой массив и элементы в массиве будут сортированы по дате
            const allChats = groups_data.concat(users_data);
            allChats.sort((a, b) => {
                const d1 = new Date(a.date_send), d2 = new Date(b.date_send);

                if (d1 > d2) return 1;
                else if (d1 < d2) return (-1);
                return 0;
            });

            logger.info({
                method: 'POST',
                address: address_config.messeger_user_sending,
                message: 'Получение данных о чатах, в которых участвует пользователь',
                date: {
                    email
                }
            });
            res.status(201).json({
                "errors": null, "message": null,
                chats: allChats
            });

        } catch (e) {
            logger.error({
                method: 'POST',
                address: address_config.messenger_user_chats,
                message: e.message,
            });
            res.status(201).json({ "errors": null, "message": "Ошибка при передачи данных, повторите попытку" });
        }
    });

//prefix: /messenger/user/chat
router.post(                                //информации о чате с конкретной группой
    address_config.m_user_chat,
    async (req, res) => {
        try {
            const { email_receiver, email_sender, token } = req.body;

            const check_token = true;   //await checkToken(token);
            const check_receiver_exists = await checkExists(email_receiver);
            const check_sender_exists = await checkExists(email_sender);

            if ((!check_token)
                || (!check_receiver_exists)
                || (!check_sender_exists)) {
                logger.error({
                    method: 'POST',
                    address: address_config.messenger_user_chat,
                    message: "Некорректные данные при отправке сообщения",
                    date: {
                        email_sender: email_sender,
                        email_receiver: email_receiver
                    }
                });
                return res.status(201).json({ "errors": null, "message": "Некорректные данные при отправке сообщения" });
            }

            //поиск всех сообщений по определённому пользователю
            const users_messages = await UsersMessages.findAll({
                where: {
                    email_sender: email_sender,
                    email_receiver: email_receiver
                }
            });

            logger.info({
                method: 'POST',
                address: address_config.messenger_user_chat,
                message: 'Получение данных о групповом чате, в которых участвует пользователь',
                date: {
                    email_sender: email_sender,
                    email_receiver: email_receiver
                }
            });
            res.status(201).json({
                "errors": null, "message": null,
                users_messages: users_messages
            });

        } catch (e) {
            logger.error({
                method: 'POST',
                address: address_config.messenger_user_chat,
                message: e.message,
            });
            res.status(201).json({ "errors": null, "message": "Ошибка при передачи данных, повторите попытку" });
        }
    });

module.exports = router;