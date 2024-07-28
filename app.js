const makeWASocket = require("@whiskeysockets/baileys").default
const { delay, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore, MessageRetryMap, useMultiFileAuthState } = require("@whiskeysockets/baileys")
const qrcode = require("qrcode")
const express = require("express")
const DataStore = require('nedb-promises')
const jwt = require('jsonwebtoken')
require('dotenv').config();
const cors = require('cors')
const morganLogger = require('morgan')
const { default: pino } = require("pino")
const port = 3000
const app = express()
const cookieparser = require('cookie-parser')
const authenticated = require('./middleware/authenticated');


var socks = []

let qrRetry = 0

const userRefreshTokens = DataStore.create('UserRefreshTokens')

app.use(cors({ origin: true, credentials: true}))
app.use(express.json())
app.use(express.urlencoded({ extended: true}))
app.use(cookieparser())
app.use(morganLogger('dev'))


app.get('/', (req, res) => {
    res.send({message: "Server is running"})
})

app.use("/auth", require('./routes/auth.js'))

app.use(authenticated)
app.use('/user', require('./routes/user.js'))

app.get('/api/user/status', authenticated, async (req, res) => {
    return res.status(201).json({message: socks[req.user.phoneNumber]?.status || 0, qr: socks[req.user.phoneNumber]?.qr })
})
app.post('/api/user/start', authenticated, async (req, res) => {
    try {
        await startSock(req.user.phoneNumber)
        return res.status(201).json({message:"Started"})
    } catch (error) {
        return res.status(500).json({ message: error.message})

    }
})

app.post("/api/user/send",authenticated, (req, res) => {
    if (socks[req.user.phoneNumber]?.status === 2) {
        socks[req.user.phoneNumber].sock.sendMessage("919539391118@s.whatsapp.net", { text: 'oh hello there' })
        return res.status(200).json({ message: "success"})
    }
    return res.status(401).json({ message: "failed"})
})
    


async function startSock(url, callback) {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info/' + url)
    const { version } = await fetchLatestBaileysVersion()
    if(!socks[url] || socks[url].status != 2) {
        const sock = makeWASocket({
                        version,
                        printQRInTerminal: false,
                        auth: state,
                        logger: pino({level: 'fatal'}),
                    })
        socks[url] = {sock: sock, status: 0, qr: null}
    }
    socks[url].sock.ev.process(
        async (events) => {
            if (events['connection.update']) {
                const update = events['connection.update']
                const { qr, connection, lastDisconnect } = update
                if (connection === 'close') {
                    if ((lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
                        startSock(url, callback)
                        console.log("last disconnect", lastDisconnect?.error?.output?.statusCode)

                    } else {
                        socks[url].status = 0
                        socks[url].qr = null

                        console.log('Connection closed. You are logged out.')
                    }
                }
                if (qr != undefined) {
                    if (qrRetry >= 4) {
                        socks[url].sock.logout()

                        console.log("log", qrRetry)
                        io.emit("logout")
                    } else {
                        qrcode.toDataURL(qr, (err, uri) => {
                            socks[url].status = 1
                            socks[url].qr = qr

                            console.log('retry', qrRetry)
                            qrRetry = qrRetry + 1
                        })
                    }
                }
                console.log('connection_update :', connection)
                if (connection === "open") {
                    socks[url].status = 2

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
