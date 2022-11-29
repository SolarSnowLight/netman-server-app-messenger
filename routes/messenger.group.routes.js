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

//prefix: /messenger/group/sending
router.post(                                //отправка личного сообщения
    address_config.m_group_sending,
    [
        check('email_sender', "Не корректный email адрес отправителя").isEmail(),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            const {
                groups_id, email_sender,
                message, link_media, type
            } = req.body;

            if (!errors.isEmpty()) {
                logger.error({
                    method: 'POST',
                    address: address_config.messeger_group_sending,
                    message: 'Ошибка при валидации входных данных',
                    date: {
                        groups_id, email_sender,
                        message, link_media, type
                    }
                });
                return res.status(201).json({
                    errors: errors.array(),
                    message: "Некорректные данные при отправке сообщения"
                });
            }

            const check_token = true;   //await checkToken(token);
            const check_sender_exists = await checkExists(email_sender);

            if ((!check_token)
                || (!check_sender_exists)) {
                logger.error({
                    method: 'POST',
                    address: address_config.messeger_group_sending,
                    message: "Некорректные данные при отправке сообщения",
                    date: {
                        groups_id, email_sender,
                        message, link_media, type
                    }
                });
                return res.status(201).json({ "errors": null, "message": "Некорректные данные при отправке сообщения" });
            }

            const groups = await Groups.findOne({ where: { id: groups_id } });
            if (!groups) {
                logger.error({
                    method: 'POST',
                    address: address_config.messeger_group_sending,
                    message: "Данной группы не существует",
                    date: {
                        groups_id, email_sender,
                        message, link_media, type
                    }
                });
                return res.status(201).json({ "errors": null, "message": "Данной группы не существует" });
            }

            const user = await UsersGroups.findOne({
                where: {
                    groups_id: groups_id,
                    email: email_sender
                }
            });

            if (!user) {
                logger.error({
                    method: 'POST',
                    address: address_config.messeger_group_sending,
                    message: "Пользователь не состоит в данной группе",
                    date: {
                        groups_id, email_sender,
                        message, link_media, type
                    }
                });
                return res.status(201).json({ "errors": null, "message": "Пользователь не состоит в данной группе" });
            }

            if (link_media) {
                // TODO: Обработка отправка медиафайла как командного сообщения
            }

            //добавление нового сообщения в БД
            const msg = await GroupsMessages.create({
                groups_id: groups_id,
                email_sender: email_sender,
                message: message,
                link_media: (link_media) ? link_media : null,
                type: (type) ? type : null,
                view: false, date_send: new Date()
            });

            const users_groups = await UsersGroups.findAll({
                where: {
                    groups_id: groups_id
                }
            });

            for (let i = 0; i < users_groups.length; i++) {
                await GroupsMessagesViews.create({
                    email: users_groups[i].dataValues.email,
                    view: false,
                    message_id: msg.dataValues.id
                });
            }

            logger.info({
                method: 'POST',
                address: address_config.messeger_group_sending,
                message: 'Отправка сообщения пользователем',
                date: {
                    groups_id, email_sender,
                    message, link_media, type
                }
            });
            res.status(201).json({ "errors": null, "message": null, sending: true });

        } catch (e) {
            logger.error({
                method: 'POST',
                address: address_config.messeger_group_sending,
                message: e.message,
            });
            res.status(201).json({ "errors": null, "message": "Ошибка при передачи данных, повторите попытку" });
        }
    });

//prefix: /messenger/group/chat
router.post(                                //информации о чате с конкретной группой
    address_config.m_group_chat,
    async (req, res) => {
        try {
            const { email_receiver, groups_id, token } = req.body;

            const check_token = true;   //await checkToken(token);
            const check_receiver_exists = await checkExists(email_receiver);
            const check_group = await Groups.findOne({ where: { id: groups_id } });
            if ((!check_token)
                || (!check_receiver_exists)
                || (!check_group)) {
                logger.error({
                    method: 'POST',
                    address: address_config.messenger_group_chat,
                    message: "Некорректные данные при отправке сообщения",
                    date: {
                        email_receiver, groups_id
                    }
                });
                return res.status(201).json({ "errors": null, "message": "Некорректные данные при отправке сообщения" });
            }

            //поиск всех сообщений по группе
            const groups_messages = await GroupsMessages.findAll({ where: { groups_id: groups_id } });

            logger.info({
                method: 'POST',
                address: address_config.messenger_group_chat,
                message: 'Получение данных о групповом чате, в которых участвует пользователь',
                date: {
                    email_receiver, groups_id
                }
            });
            res.status(201).json({
                "errors": null, "message": null,
                groups_messages: groups_messages
            });

        } catch (e) {
            logger.error({
                method: 'POST',
                address: address_config.messenger_group_chat,
                message: e.message,
            });
            res.status(201).json({ "errors": null, "message": "Ошибка при передачи данных, повторите попытку" });
        }
    });

module.exports = router;