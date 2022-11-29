const config = require("config");           //����������� �������
const { address_config }
    = require('../config/address.config');  //��������� ���������
const fetch = require('node-fetch');
const {                                     //����������� ������� ��� �������������� � ����� ������
    UsersGroups, UsersMessages,
    Groups, GroupsMessages,
    sequelize, Sequelize,
    GroupsMessagesViews,
} = require('../sequelize/models');
const { checkToken, checkExists }
    = require("../checks/token.access");    //�������� ������

const groups_messages   = require("./groups_messages");
const users_messages    = require("./users_messages");

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

// ��������� ���� ��������� (����� � �� �����)
const allNewMessages = async (users_id, access_token) => {
    let allUsersMessages1 = await users_messages.allNewPrivateMessages(users_id, access_token, "receiver_users_id"),
        allUsersMessages2 = await users_messages.allNewPrivateMessages(users_id, access_token, "sender_users_id");
    if (allUsersMessages1.length != 0) {
        for (let i = 0; i < allUsersMessages1.length; i++) {
            allUsersMessages2.removeIf((item) => {
                return (item.rooms_id === allUsersMessages1[i].rooms_id);
            });
        }
    }
    let allGroupsMessages1 = await groups_messages.allNewGroupsMessages(users_id, access_token);

    let data = allUsersMessages1.concat(allUsersMessages2).concat(allGroupsMessages1);
    data.sort((a, b) => {
        const d1 = new Date(a.date_send), d2 = new Date(b.date_send);
        if (d1 > d2) return (-1);
        else if (d1 < d2) return 1;

        return 0;
    });

    return data;
}

// ��������� ���� ��������� �� ����������� �������
const allRoomsMessages = async (users_id, roomsId, type, access_token) => {
    const check_user_exists = await checkExists(users_id);

    if ((!check_user_exists) || (!type)) {
        return null;
    }

    const messages = [];
    if (!checkUserInRoom(users_id, roomsId, type)) {
        return null;
    }

    if (type === "private") {
        const data = await UsersMessages.findAll({ where: { rooms_id: roomsId } });
        if (!data) {
            return null;
        }

        for (let i = 0; i < data.length; i++) {
            // ��� ��������� ���� ��������� � ���� ��� ���������� ��������
            // ���� ������ ����� �������� ����������� ��������� � ��� �� ���� ���������
            if ((data[i].receiver_users_id === users_id) && (!data[i].view)) {
                await data[i].update({
                    view: true
                });
            }

            data[i].dataValues.is_sender = (data[i].sender_users_id === users_id) ? true : false;

            messages.push(data[i].dataValues);
        }
    } else if (type === "group") {
        const group = await Groups.findOne({ where: { rooms_id: roomsId } });
        if (!group) {
            return null;
        }

        const data = await GroupsMessages.findAll({ where: { groups_id: group.id } });
        let current_userd_id = "";
        let sender_info = [];
        const indexByUserId = (users_id) => {
            for (let i = 0; i < sender_info.length; i++) {
                if (sender_info[i].users_id === users_id) {
                    return i;
                }
            }

            return (-1);
        }

        for (let i = 0; i < data.length; i++) {
            const lsender_users_id = data[i].dataValues.sender_users_id;
            if (current_userd_id === lsender_users_id) {
                if (current_userd_id === users_id) {
                    data[i].dataValues.is_sender = true;
                } else {
                    const index = indexByUserId(current_userd_id);
                    data[i].dataValues.is_sender = false;
                    data[i].dataValues.nickname_sender = sender_info[index].nickname;
                }
            } else {
                current_userd_id = lsender_users_id;
                const index = indexByUserId(current_userd_id);
                if (index >= 0) {
                    data[i].dataValues.is_sender = (current_userd_id === users_id)? true : false;
                    data[i].dataValues.nickname_sender = sender_info[index].nickname;
                } else {
                    let netData = null;
                    await fetch(address_config.cs_player_info, {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ users_id: current_userd_id, access_token: access_token })
                    })
                        .then(res => res.json())
                        .then(json => {
                            netData = json;
                        });

                    sender_info.push(netData);
                    data[i].dataValues.is_sender = (current_userd_id === users_id) ? true : false;
                    data[i].dataValues.nickname_sender = netData.nickname;
                }
            }

            // ���������� ��������� ��������� ������� ���������� ��������� � ������
            const valView = await GroupsMessagesViews.findOne({
                where: {
                    message_id: data[i].id,
                    users_id: users_id,
                }
            });

            if (valView) {
                await valView.update({
                    view: true
                });
            }

            messages.push(data[i].dataValues);
        }
    }

    // ���������� ��������� �� ����
    messages.sort((a, b) => {
        const d1 = new Date(a.date_send), d2 = new Date(b.date_send);
        if (d1 > d2) return 1;
        else if (d1 < d2) return (-1);

        return 0;
    });

    // ����������� ���� ��������� �� ����������� �������
    return messages;
}

// �������� ������������ �� �������������� � ����������� �������
const checkUserInRoom = async (users_id, roomsId, type) => {
    if (type === "private") {
        const isRoom = await UsersMessages.findOne({
            where: {
                rooms_id: roomsId,
                [Sequelize.Op.or]: [
                    { receiver_users_id: users_id },
                    { sender_users_id: users_id }
                ]
            }
        });

        if (!isRoom) {
            return false;
        }
    } else if (type === "group") {
        const group = await Groups.findOne({ where: { rooms_id: roomsId } });
        if (!group) {
            return false;
        }

        const isRoom = await UsersGroups.findOne({ where: { groups_id: group.id, users_id: users_id } });
        if (!isRoom) {
            return false;
        }
    }

    return true;
}

// ����������� ���� ��������� �����, � ������� ��������� ������������
const allUserChats = async (users_id, access_token) => {
    let groups_data = [];

    // ���������� ���� �� ������, � ������� ��������� ������� ������������
    const id_group = await UsersGroups.findAll({ where: { users_id: users_id } });
    if ((id_group) && (id_group.length > 0)) {
        // ����������� ���� ���������, ������� ���� ���������� � ��������� ����
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

            // ���������� ���� ��������� � ������ ��������� ���� �� ��������
            // "���������� ������������� ���������"
            if (groups_messages.length > 0) {
                // ������������� ������
                let last_index = (groups_messages.length - 1);
                const current_id = groups_messages[last_index].dataValues.groups_id;

                // users_id �����������
                const current_users_id = groups_messages[last_index].dataValues.sender_users_id;

                // ��������� ������������ ���������
                let last_message = groups_messages[last_index].dataValues.message;

                // ���� ����������� ���������� ���������
                let current_date = groups_messages[last_index].dataValues.date_send;

                let count = 0;

                // ��������� ��������� ����������� �������
                const dataViews = await GroupsMessagesViews.findAll({
                    where: {
                        message_id: {
                            [Sequelize.Op.in]: groups_messages.map((item) => item.id)
                        },
                        users_id: users_id
                    }
                });

                // ����� � dataViews �� id ������������� ���������� ���������
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

                if (current_users_id != users_id) {
                    let index = (-1);
                    for (let i = (groups_messages.length - 1); i >= 0; i--) {
                        if (groups_messages[i].dataValues.view === false) {
                            index = i;
                            break;
                        }
                    }

                    if (index >= 0) {
                        // ������� �� ����������� ���������, ������� ��������,
                        // ��� ��������� ��������� ����� � ����� ��� ���� ������������� ���������
                        // � �� ���������� ���������� ������ (���, ��� �������, ������������������)
                        for (let i = index; i >= 0; i--) {
                            if ((groups_messages[i].dataValues.view === false)
                                && (groups_messages[i].dataValues.sender_users_id === current_users_id)) {
                                count++;
                            }
                        }
                    }

                    // ��� ��������� ���� ��������� � �����
                    // �� �������� ������ � ��������� ����������� ���������
                }

                // ����� ������ � ������
                const groupData = await Groups.findOne({ where: { id: id_group[i].dataValues.groups_id } });

                // ��������� ���������� � ������������, ������� �������� ��������� ���������
                let sender_info = null;
                await fetch(address_config.cs_player_info, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ users_id: current_users_id, access_token: users_id })
                })
                    .then(res => res.json())
                    .then(json => {
                        sender_info = json;
                    });

                groups_data.push({
                    groups_id: current_id,
                    users_id: null,
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

    // ��� ���������, ������� ������������ �����-���� �������� ��� ������
    const users_messages = await UsersMessages.findAll({
        where: {
            [Sequelize.Op.or]: [
                { receiver_users_id: users_id },
                { sender_users_id: users_id }
            ]
        }
    });

    users_messages.removeIf((item) => {
        return ((item.sender_users_id != users_id) && (item.receiver_users_id != users_id));
    });

    let users_data = [];
    while (users_messages.length > 0) {
        let current_messages = [];
        let other_users_id = (users_messages[0].dataValues.sender_users_id === users_id) ?
            users_messages[0].dataValues.receiver_users_id : users_messages[0].dataValues.sender_users_id;

        users_messages.removeIf((item) => {
            if (((item.sender_users_id === other_users_id) && (item.receiver_users_id === users_id))
                || ((item.sender_users_id === users_id) && (item.receiver_users_id === other_users_id))) {
                current_messages.push(item);
                return true;
            }

            return false;
        });

        // ���������� ���� ���������
        current_messages.sort((a, b) => {
            const d1 = new Date(a.date_send), d2 = new Date(b.date_send);

            if (d1 > d2) return 1;
            else if (d1 < d2) return (-1);
            return 0;
        });

        //����������� ���� ���������, ������� ���� �������� �������������
        const last_index = (current_messages.length - 1);

        let lcurrent_users_id = current_messages[last_index].dataValues.sender_users_id;
        let current_date = current_messages[last_index].dataValues.date_send;
        let rooms_id = current_messages[last_index].dataValues.rooms_id;
        let count = 0;

        // ����� email ����������� �� ��������� � email �������� ������������,
        // ��� ��������, ��� ��������� ��������� �������� ������ ������������
        // � ���� ������������� ���������� ����� ���������� ���������, 
        // ������� ����������� �� ���� ���������
        if (lcurrent_users_id != users_id) {
            let index = (-1);
            for (let i = (current_messages.length - 1); i >= 0; i--) {
                if (current_messages[i].dataValues.view === false) {
                    index = i;
                    break;
                }
            }

            if (index >= 0) {
                // ������� �� ����������� ���������, ������� ��������,
                // ��� ��������� ��������� ����� � ����� ��� ���� ������������� ���������
                // � �� ���������� ���������� ������ (���, ��� �������, ������������������)
                for (let i = index; i >= 0; i--) {
                    if ((current_messages[i].dataValues.view === false)
                        && (current_messages[i].dataValues.sender_users_id === lcurrent_users_id)) {
                        count++;
                    }
                }
            }

            // ��� ��������� ���� ��������� � �����
            // �� �������� ������ � ��������� ����������� ���������
        }

        // ��������� ���������� � ������������, � ������� ������ ���������
        let other_info = null;
        await fetch(address_config.cs_player_info, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ users_id: other_users_id, access_token: access_token })
        })
            .then(res => res.json())
            .then(json => {
                other_info = json;
            });

        // ����������� �������� ���� ������������, ������� �������� ��������� ��������� � ���
        if (current_messages[last_index].dataValues.sender_users_id === other_users_id) {
            other_info.nickname_sender = other_info.nickname;
        } else {
            await fetch(address_config.cs_player_info, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ users_id: users_id, access_token: access_token })
            })
                .then(res => res.json())
                .then(json => {
                    other_info.nickname_sender = json.nickname;
                });
        }

        if (other_info) {
            users_data.push({
                groups_id: null,
                users_id: other_info.users_id,
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

    // ������� groups_data � users_data ����� ���� � ��� �� ������, �� �������� ����� ���������� ���������� ���������
    // ��������� ��� ���. �������, ��� ����� ��������� � ���� ������� ������ � �������� � ������� ����� ����������� �� ����
    const allChats = groups_data.concat(users_data);
    allChats.sort((a, b) => {
        const d1 = new Date(a.date_send), d2 = new Date(b.date_send);

        if (d1 > d2) return (-1);
        else if (d1 < d2) return 1;
        return 0;
    });

    return allChats;
}

module.exports.allNewMessages = allNewMessages;
module.exports.allRoomsMessages = allRoomsMessages;
module.exports.checkUserInRoom = checkUserInRoom;
module.exports.allUserChats = allUserChats;