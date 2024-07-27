const makeWASocket = require("@whiskeysockets/baileys").default
const { delay, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore, MessageRetryMap, useMultiFileAuthState } = require("@whiskeysockets/baileys")
const fs = require("fs")
const http = require("http")
const qrcode = require("qrcode")
const express = require("express")
const DataStore = require('nedb-promises')
const bcrypt = require("bcryptjs")
const jwt = require('jsonwebtoken')
const config = require('./config.js')
const { Server } = require("socket.io")
const { default: pino } = require("pino")
const port = 3000
const app = express()
var sock = undefined
let qrRetry = 0

const users = DataStore.create('Users.db')
app.use(express.json())

app.get('/', (req, res) => {
    res.send({message: "Server is running"})
})
// app.get('/get/*', (req, res) => {

//     res.sendFile('qr.html', {
//         root: __dirname
//     });
//     qrRetry = 0
    
//     setTimeout(function() {
//         startSock(req.url)
// }, 10000);

app.post("/api/auth/register", async (req, res) => {
    try {
        const { name, phoneNumber, password} = req.body

        if (!name || !phoneNumber || !password) return res.status(422).json({ message: "Please fill in all fields"})
        if (phoneNumber.length != 10) return res.status(422).json({ message: "Enter Valid Number"})
        if (await users.findOne({ phoneNumber})) return res.status(409).json({message: "Number already exists"})
        const hashedPassword = await bcrypt.hash(password, 10)

        const newUser = await users.insert({
            name,
            phoneNumber,
            password: hashedPassword
        })

        return res.status(201).json({ message: "User registerd"})
    } catch (error) {
        return res.status(500).json({ message: error.message})
    }
})
    
app.post('/api/auth/login', async (req, res) => {
    try {
        const { phoneNumber, password} = req.body
        if ( !phoneNumber || !password) return res.status(422).json({ message: "Please fill in all fields"})

        const user = await users.findOne({ phoneNumber})
        if (!user) return res.status(401).json({ message: 'Email or password is incorrect'})
        console.log(password, user.password, user)
        const passwordMatch = await bcrypt.compare(password, user.password)
        if (!passwordMatch) return res.status(401).json({ message: 'Email or password is incorrect'})

        const accessToken = jwt.sign({ userId: user._id , phoneNumber: user.phoneNumber}, config.accessTokenSecret, { subject:"accessApi", expiresIn:"1d"})

        return res.status(200).json({
            id: user._id,
            phoneNumber: user.phoneNumber,
            accessToken
        })
    } catch(error) {
        return res.status(500).json({ message: error.message})
    }
})

app.get('/api/user/me', authenticated, async (req, res) => {
    try {
        const user = await users.findOne({ _id: req.user.id})

        return res.status(200).json({
            id: user._id,
            name: user.name,
            phoneNumber: user.phoneNumber,


        })
    } catch (error) {
        return res.status(500).json({ message: error.message})
    }
})

async function authenticated(req, res, next) {
    const accessToken = req.headers.authorization

    if(!accessToken) return res.status(401).json({message: "Access token not found"})
    try {
        const decodedAccessToken = jwt.verify(accessToken, config.accessTokenSecret)
        req.user = { id: decodedAccessToken.userId }
        console.log(req.user)

        next()
    } catch (error) {
        return res.status(401).json({ message: "Access Token is invalid"})
    }
}

app.get("/send", (req, res) => {
    if (sock != undefined) {
        sock.sendMessage("919539391118@s.whatsapp.net", { text: 'oh hello there' })
    }
    return res.send({ message: "gi"})
})
    


async function startSock(url) {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info' + url)
    const { version } = await fetchLatestBaileysVersion()
    sock = makeWASocket({
        version,
        printQRInTerminal: false,
        auth: state,
        logger: pino({level: 'fatal'}),
    })
    
    sock.ev.process(
        async (events) => {
            if (events['connection.update']) {
                const update = events['connection.update']
                const { qr, connection, lastDisconnect } = update
                if (connection === 'close') {
                    if ((lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
                        startSock(url)
                        console.log("last disconnect", lastDisconnect?.error?.output?.statusCode)

                    } else {
                        console.log('Connection closed. You are logged out.')
                    }
                }
                if (qr != undefined) {
                    if (qrRetry >= 4) {
                        sock.logout()
                        console.log("log", qrRetry)
                        io.emit("logout")
                    } else {
                        qrcode.toDataURL(qr, (err, url) => {
                            io.emit("qr", url)
                            io.emit("log", "QR Code received, please scan")
                            console.log('retry', qrRetry)
                            qrRetry = qrRetry + 1
                        })
                    }
                }
                console.log('connection update', connection)
                if (connection === "open") {
                    //TODO
                }

            }
            if (events['creds.update']) {
                await saveCreds()
            }
        }
    )
    
}

app.listen(port, () => {
    console.log(`http://localhost:${port}`)
})
