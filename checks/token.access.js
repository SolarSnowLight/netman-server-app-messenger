//-------------------------
//Общая проверка токенов
//-------------------------

const fetch = require('node-fetch');
const config = require("config");           //подключение конфига
const { address_config }
    = require('../config/address.config');  //константы маршрутов

//проверка токена на работоспособность
const checkToken = async (token) => {
    try {
        let check = false;
        await fetch(address_config.cs_sequrity_token, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ access_token: token })
        }).then(res => res.json())
            .then(json => {
                check = json.check;
            });

        if (!check) {
            return false;
        }

        return true;
    } catch (e) {
        return false;
    }
}

const checkExists = async (users_id) => {
    try {
        let check = false;
        await fetch(address_config.cs_sequrity_exists, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ users_id: users_id })
        }).then(res => res.json())
            .then(json => {
                check = json.check;
            });

        if (!check) {
            return false;
        }

        return true;
    } catch (e) {
        return false;
    }
}

module.exports.checkToken = checkToken;
module.exports.checkExists = checkExists;