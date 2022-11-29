//------------------------
//Константы для маршрутов
//------------------------
const config = require("config");

const address_config = {
    messeger_user_sending: '/messenger/user/sending',    //полный адрес
    m_user_sending: '/user/sending',                    //укороченный адрес

    messeger_group_sending: '/messenger/group/sending',
    m_group_sending: '/group/sending',

    messenger_user_chats: '/messenger/user/chats',
    m_user_chats: '/user/chats',

    messenger_user_chat: '/messenger/user/chat',
    m_user_chat: '/user/chat',

    messenger_group_chat: '/messenger/group/chat',
    m_group_chat: '/group/chat',

    cs_sequrity_token: 'http://' + config.get("centralServerIP") + "/sequrity/token",
    cs_sequrity_exists: 'http://' + config.get("centralServerIP") + "/sequrity/exists",

    cs_player_info: 'http://' + config.get("centralServerIP") + "/function/player/info",
};

module.exports.address_config = address_config;