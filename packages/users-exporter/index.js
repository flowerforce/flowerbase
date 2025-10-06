/* eslint-disable no-undef */
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import bodyParser from "body-parser";
import express from "express"
import { loadUsers } from "./utils.js";

const app = express();
const PORT = 4000;

const scrypt = promisify(crypto.scrypt)

export const hashPassword = async (plaintext) => {
    const salt = crypto.randomBytes(128).toString('hex')
    const buffer = (await scrypt(plaintext, salt, 64))
    return `${buffer.toString('hex')}.${salt}`
}


app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/submit', async (req, res) => {
    const { appId, groupId, cookie, traceId, password } = req.body;
    const users = await loadUsers({ appId, groupId, cookie, traceId, password })
    console.log("🚀 ~ app.post ~ users:", users.length)
    if (users) {
        const hashedPassword = await hashPassword(password)
        return res.send(JSON.stringify(users.map(({ identities, data, _id }) => ({
            _id,
            email: data.email,
            password: hashedPassword,
            status: "confirmed",
            identities,
        }))))
    }

    res.status(404)
    res.send()

})

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/guide', (req, res) => {
    res.render('guide');
});

app.listen(PORT, () => {
})
