//***********************************************************
// Точка входа в серверное приложение для обмена сообщениями
//***********************************************************

const express = require('express');
const config = require("config");
const fetch = require("node-fetch");
const logger = require('./logger/logger');
const users_messages = require('./database/users_messages');
const messages = require("./database/messages");
const token_access = require('./checks/token.access');
const uidGenerator = require('node-unique-id-generator');
const { address_config } = require('./config/address.config');
const {                                                 //подключение моделей для взаимодействия с базой данных
    UsersGroups, UsersMessages,
    Groups, GroupsMessages,
    sequelize, Sequelize,
    GroupsMessagesViews, Rooms,
} = require('./sequelize/models');
const cors = require('cors');
const app = express();

app.use(express.json({ extended: true }));              // Используется для корректного приёма данных в JSON формате
app.use(cors());

const PORT = config.get('port') || 5000;                //определение порта сервера

async function start() {                                //функция для запуска серверной части приложения
    try {
        app.listen(PORT, () => console.log(`Сервер запущен с портом ${PORT}`)); //прослушивание запросов по определённому порту
        logger.info({
            port: (config.get('port') || 5000),
            message: "Запуск сервера"
        });
        return data;
    } catch (e) {
        logger.error({
            message: e.message
        });
        process.exit(1); //выход из процесса
    }
    return null;
}

const dataUsers = [];

const duExistsUser = (data, element) => {
    if ((!element.users_id)
        || (!element.access_token)
        || (!element.socket_id)
        || (!Array.isArray(data))
    ) {
        return false;
    }

    for (let i = 0; i < data.length; i++) {
        if ((data[i].users_id === element.users_id)
            && (data[i].socket_id === element.socket_id)
            && (data[i].access_token === element.access_token)) {
            return true;
        }
    }

    return false;
}

const duExistsValueIndex = (data, socket_id) => {
    if (!Array.isArray(data)) {
        return (-1);
    }

    for (let i = 0; i < data.length; i++) {
        if (data[i].socket_id === socket_id) {
            return i;
        }
    }

    return (-1);
}

const duGetIndexByUsersId = (data, users_id) => {
    if (!Array.isArray(data)) {
        return (-1);
    }

    for (let i = 0; i < data.length; i++) {
        if (data[i].users_id === users_id) {
            return i;
        }
    }

    return (-1);
}

const duCountByRoomsId = (data, rooms_id) => {
    if (!Array.isArray(data)) {
        return 0;
    }

    let count = 0;
    for (let i = 0; i < data.length; i++) {
        if (data[i].rooms_id === rooms_id) {
            count++;
        }
    }

    return count;
}

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

const server = app.listen(PORT, () => console.log(`Сервер запущен с портом ${PORT}`));
const io = require("socket.io")(server);/*, {
    cors: {
        origin: config.get("managementWebSite"),
        methods: ["GET", "POST"],
        credentials: true,
        allowEIO3: true
    }
});*/

// socket(server) - "глобальный" обработчик событий, главный коннектор
// socket - уникальный объект, созданный для каждого подключения (device - server)
io.on("connection", (socket) => {
    // Закрепление данного сокета за прослушиванием события "login"
    // иначе "сокеты принимают все сообщения события login"
    // Подписка текущего сокета на приём события "login"

    socket.on("authentication", async (data) => {
        const user_data = JSON.parse(data);
        let checks = {
            token: false,
            exists: false
        };

        // Проверка существования пользователя
        checks.exists = true; //await token_access.checkExists(user_data.users_email);
        checks.token = true;  //await token_access.checkToken(user_data.token);

        if ((!checks.token) || (!checks.exists)) {
            // Обработка ситуации, когда пользователь не авторизовался
            socket.emit("authentication_failed");
            return;
        }

        dataUsers.push({
            socket_id: socket.id,
            users_id: user_data.users_id,
            rooms_id: ''
        });

        // Отправка информации о том, что пользователь успешно авторизовался
        socket.emit("authentication_success");

        // Работало для веб-сайта
        /*
        socket.on("get_user_messages", async (data) => {
            const { email_current, email_other } = JSON.parse(data);
            if ((!email_current) || (!email_other)) {
                return;
            }

            const index = duGetIndexByEmail(dataUsers, email_current);
            if (index < 0) {
                return;
            }

            const messages = await users_messages.allUserPrivateMessages(email_current, email_other);

            if (dataUsers[index].rooms_id.length !== 0) {
                socket.leave(dataUsers[index].rooms_id);
                dataUsers[index].rooms_id = '';
            }

            // Гарантируется, что если пользователь входит в одну комнату, то он также из неё выходит
            // в обязательном порядке
            if ((messages.length > 0) || (dataUsers[index].rooms_id.length === 0)) {
                // Сообщения между пользователями уже есть, следовательно - можно подключить пользователя
                // к определённой комнате
                console.log(messages[0].rooms_id);
                const rooms_id = messages[0].rooms_id; // Можно использовать любой идентификатор комнаты в массиве
                // т.к. гарантируется, что идентификатор комнаты между двумя разными пользователями
                // будет уникален и останется неизменяем до удаления всех сообщений в чате

                if (!(socket.rooms.has(rooms_id))) {
                    // Подключение на прослушивание сообщений определённого чата
                    // т.е., пользователь может видеть изменения в чате в режиме
                    // реального времени и все сообщения, которые к нему приходят
                    // автоматически считаются просмотренными
                    socket.join(rooms_id);
                    dataUsers[index].rooms_id = rooms_id;
                }
            }

            // Делаем все сообщения, которые пользователь получает, видимыми
            for (let i = 0; i < messages.length; i++) {
                const mData = await UsersMessages.findOne({
                    where: {
                        id: messages[i].id,
                        email_receiver: email_current
                    }
                });

                if (mData) {
                    await mData.update({
                        view: true
                    });
                }
            }

            console.log(dataUsers);

            // Отправка всех сообщений определённого чата пользователю
            socket.emit("set_user_messages", JSON.stringify(messages));
        });*/

        /*
        socket.on("leave_room", async () => {
            // Выход из комнаты осуществляется только тогда, когда пользователь
            // выходит из чата в общее обозревание чата 
            const index = duExistsValueIndex(dataUsers, socket.id);
            if (index < 0) {
                return;
            }

            if (dataUsers[index].rooms_id.length !== 0) {
                socket.leave(dataUsers[index].rooms_id);
                dataUsers[index].rooms_id = '';
            }
        });*/

        /*socket.on("send_private_message", async (data) => {
            const { email_current, email_other, message } = JSON.parse(data);
            if ((!email_current) || (!email_other) || (!message) || (message.length === 0)) {
                return;
            }

            const index = duGetIndexByEmail(dataUsers, email_current);
            if (index < 0) {
                return;
            }

            if (dataUsers[index].rooms_id.length === 0) {
                // Если комната, в которой текущий пользователь находится, не определена,
                // то её необходимо определить перед отправкой сообщения
                const usersMessages1 = await UsersMessages.findOne({
                    where: {
                        email_sender: email_current,
                        email_receiver: email_other
                    }
                });

                // После отправки сообщений гарантируется, что пользователь будет
                // находиться в определённой комнате
                if (!usersMessages1) {
                    const usersMessages2 = await UsersMessages.findOne({
                        where: {
                            email_sender: email_other,
                            email_receiver: email_current
                        }
                    });

                    if (!usersMessages2) {
                        // Комната не найдена, сообщение было отправлено впервые, необходимо создать
                        // комнату, и подключить к ней текущего игрока
                        const rooms = await Rooms.create({
                            id: uidGenerator.generateGUID()
                        });

                        socket.join(rooms.id);
                        dataUsers[index].rooms_id = rooms.id;
                    } else {
                        socket.join(usersMessages2.rooms_id);
                        dataUsers[index].rooms_id = usersMessages2.rooms_id;
                    }
                } else {
                    socket.join(usersMessages1.rooms_id);
                    dataUsers[index].rooms_id = usersMessages1.rooms_id;
                }
            }

            const count = duCountByRoomsId(dataUsers, dataUsers[index].rooms_id);

            const messageData = await UsersMessages.create({
                email_sender: email_current,
                email_receiver: email_other,
                message: message,
                link_media: '',
                type: '',
                view: (count > 1)? true : false,
                date_send: new Date(),
                rooms_id: dataUsers[index].rooms_id
            });

            console.log(dataUsers);

            // Отправка всем, кто находится в определённой комнате нового сообщения
            io.to(dataUsers[index].rooms_id).emit("get_private_message", JSON.stringify({
                email_sender: email_current,
                message: message,
                date_send: messageData.date_send
            }));
        });*/

        socket.on("get_new_messages", async () => {
            let chats = await messages.allUserChats(user_data.users_id, user_data.access_token);
            socket.emit("set_new_messages", JSON.stringify({
                chats: chats
            }));
        });

        socket.on("get_status_user", async (data) => {
            const value = JSON.parse(data);
            const index = duGetIndexByUsersId(dataUsers, value.users_id);

            socket.emit("set_status_user", JSON.stringify({
                status: (index >= 0) ? true : false
            }));
        });

        socket.on("find_chat_room", async (data) => {
            let value = JSON.parse(data);
            let chats = await messages.allUserChats(user_data.users_id, user_data.access_token);

            let index = (-1);
            for (let i = 0; i < chats.length; i++) {
                if (chats[i].users_id === value.users_id) {
                    index = i;
                    break;
                }
            }

            if (index >= 0) {
                socket.emit("find_chat_room_success", JSON.stringify(
                    chats[index]
                ));
            } else {
                socket.emit("find_chat_room_failed");
            }
        });

        // Выход из определённой комнаты
        socket.on("room_disconnection", () => {
            // Выход из комнаты осуществляется только тогда, когда пользователь
            // выходит из чата в общее обозревание чата 
            const index = duExistsValueIndex(dataUsers, socket.id);
            if (index < 0) {
                return;
            }

            const duser = dataUsers[index];
            if ((duser.rooms_id) && (duser.rooms_id.length !== 0)) {
                // Отправка сообщения о покидании комнаты всем пользователям, находящимся в данной комнате
                socket.to(duser.rooms_id).emit("room_disconnection_success");
                socket.leave(duser.rooms_id);
                dataUsers[index].rooms_id = '';
            }
        })

        // Подключение к определённой комнате с получением всех сообщений в данной комнате
        socket.on("room_connection", async (data) => {
            const value = JSON.parse(data);
            if (!value.rooms_id) {
                return;
            }

            const index = duExistsValueIndex(dataUsers, socket.id);

            if (index < 0) {
                socket.emit("room_connection_failed");
                return;
            }

            dataUsers[index].rooms_id = value.rooms_id;
            socket.join(value.rooms_id);
            socket.to(value.rooms_id).emit("room_connection_success");
            socket.emit("set_room_messages", JSON.stringify({
                messages: await messages.allRoomsMessages(dataUsers[index].users_id, value.rooms_id,
                    (!value.groups_id) ? "private" : "group", user_data.access_token
                )
            }));
        });

        socket.on("send_private_message", async (data) => {
            const value = JSON.parse(data);
            const indexCurrent = duExistsValueIndex(dataUsers, socket.id);
            const indexOther = duGetIndexByUsersId(dataUsers, value.receiver_users_id);
            const currentUser = dataUsers[indexCurrent];

            if ((indexCurrent >= 0) && (!currentUser.rooms_id)) {
                const newRoom = await Rooms.create({
                    id: uidGenerator.generateUniqueId()
                });

                // Создание нового чата
                await UsersMessages.create({
                    sender_users_id: currentUser.users_id,
                    receiver_users_id: value.receiver_users_id,
                    message: value.message,
                    link_media: null,
                    type: null,
                    view: false,
                    date_send: new Date(),
                    rooms_id: newRoom.id
                });

                socket.emit("create_new_chat");

                return;
            }

            if ((indexCurrent < 0) || (currentUser.rooms_id.length == 0)) {
                socket.emit("send_private_message_failed");
                return;
            }

            // Все участники приватного чата находятся в сети
            const dataMessage = await UsersMessages.create({
                sender_users_id: currentUser.users_id,
                receiver_users_id: value.receiver_users_id,
                message: value.message,
                link_media: null,
                type: null,
                view: ((indexOther >= 0) && (dataUsers[indexOther].rooms_id === currentUser.rooms_id)) ? true : false,
                date_send: new Date(),
                rooms_id: currentUser.rooms_id
            });

            let personalData = null;
            await fetch(address_config.cs_player_info, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ users_id: currentUser.users_id, access_token: user_data.access_token })
            })
                .then(res => res.json())
                .then(json => {
                    personalData = json;
                });

            dataMessage.dataValues.nickname_sender = personalData.nickname;
            io.to(currentUser.rooms_id).emit("new_private_message", JSON.stringify(
                { ...dataMessage.dataValues }
            ));

            if ((indexOther >= 0) && (dataUsers[indexOther].rooms_id != currentUser.rooms_id)) {
                io.to(dataUsers[indexOther].socket_id).emit("new_private_message_chat", JSON.stringify(
                    { ...dataMessage.dataValues }
                ));
            }
        });

        socket.on("send_group_message", async (data) => {
            const value = JSON.parse(data);
            const indexCurrent = duExistsValueIndex(dataUsers, socket.id);
            const currentUser = dataUsers[indexCurrent];

            if (currentUser.rooms_id.length == 0) {
                socket.emit("send_group_message_failed");
                return;
            }

            const group = await Groups.findOne({
                where: {
                    rooms_id: currentUser.rooms_id
                }
            });

            if (!group) {
                socket.emit("send_group_message_failed");
                return;
            }

            const groupUsers = await UsersGroups.findAll({
                where: {
                    groups_id: group.id
                }
            });

            const dataMessage = await GroupsMessages.create({
                sender_users_id: currentUser.users_id,
                message: value.message,
                link_media: null,
                type: null,
                date_send: new Date(),
                groups_id: group.id
            });

            let personalData = null;
            await fetch(address_config.cs_player_info, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ users_id: currentUser.users_id, access_token: user_data.access_token })
            })
                .then(res => res.json())
                .then(json => {
                    personalData = json;
                });

            dataMessage.dataValues.rooms_id = currentUser.rooms_id;
            dataMessage.dataValues.nickname_sender = personalData.nickname;

            for (let i = 0; i < groupUsers.length; i++) {
                const index = duGetIndexByUsersId(dataUsers, groupUsers[i].dataValues.users_id);
                await GroupsMessagesViews.create({
                    users_id: groupUsers[i].dataValues.users_id,
                    view: ((index >= 0) && (dataUsers[index].rooms_id == currentUser.rooms_id)) ? true : false,
                    message_id: dataMessage.dataValues.id
                });

                if (((index >= 0) && (dataUsers[index].rooms_id != currentUser.rooms_id))) {
                    io.to(dataUsers[index].socket_id).emit("new_group_message_chat", JSON.stringify(
                        { ...dataMessage.dataValues }
                    ));
                }
            }

            io.to(currentUser.rooms_id).emit("new_group_message", JSON.stringify(
                { ...dataMessage.dataValues }
            ));
        });

        /*socket.on("get_groups_info", async () => {
            const index = duExistsValueIndex(dataUsers, socket.id);
            const currentUser = dataUsers[index];

            const groupData = await Groups.findOne({
                where: {
                    rooms_id: currentUser.rooms_id
                }
            });


        });*/

        /*
        // Получение всех чатов (и новых сообщений)
        let allNewMessages = await messages.allNewMessages(user_data.users_email, null);

        // Отправка события о корректном подключении
        socket.emit("login_accepted", JSON.stringify(allNewMessages));

        // Создание приватного чата (после отправки нового сообщения определённому пользователю)
        socket.on("create_private_chat", async (data) => {
            const chat = JSON.parse(data);

            // Создание новой комнаты
            const rooms_id = uidGenerator.generateGUID();   // Генерация нового уникального ключа
            const createdRoom = await Rooms.create({
                id: rooms_id                                // Добавление нового ключа в БД
            });

            await UsersMessages.create({
                email_sender: chat.email_sender,
                email_receiver: chat.email_receiver,
                message: chat.message,
                link_media: chat.link_media,
                type: chat.type,
                view: false,
                rooms_id: rooms_id
            });

            socket.join(rooms_id);
        });

        // Добавление события о приёме сообщений "chat_enter"
        socket.on("chat_enter", async (data) => {
            const enter_data = JSON.parse(data);
            let allChatMessages = await messages.allRoomsMessages(enter_data.users_email,
                enter_data.rooms_id,
                enter_data.type_chat
            );

            if (allChatMessages === null) {
                socket.emit("chat_enter_failed");
                return;
            }

            socket.join(enter_data.rooms_id);   // Подключение пользователя к комнате
            socket.on("send_message", async (data) => {
                const data_message = JSON.parse(data);
                socket.to(enter_data.rooms_id).emit("")
            });

            if (!messages.checkUserInRoom(data.email, data.rooms_id, data.type_chat)) {
                socket.emit("enter_in_room_failed");
                return;
            }
        });*/

        // socket.removeAllListeners("login"); - Отписка от прослушивания события "login"
    });

    socket.on('disconnect', function () {
        const index = duExistsValueIndex(dataUsers, socket.id);
        if (index >= 0) {
            if (dataUsers[index].rooms_id.length != 0) {
                socket.to(dataUsers[index].rooms_id).emit("room_connection_success");
                socket.leave(dataUsers[index].rooms_id);
            }

            dataUsers.splice(index, 1);
        }
    });
});

