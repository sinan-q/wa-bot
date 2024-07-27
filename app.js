const makeWASocket = require("@whiskeysockets/baileys").default
const { delay, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore, MessageRetryMap, useMultiFileAuthState } = require("@whiskeysockets/baileys")
const fs = require("fs")
const qrcode = require("qrcode")
const express = require("express")
const DataStore = require('nedb-promises')
const bcrypt = require("bcryptjs")
const jwt = require('jsonwebtoken')
const config = require('./config.js')
const { default: pino } = require("pino")
const port = 3000
const app = express()

var socks = []

let qrRetry = 0

const users = DataStore.create('Users.db')
const userRefreshTokens = DataStore.create('UserRefreshTokens')

app.use(express.json())

app.get('/', (req, res) => {
    res.send({message: "Server is running"})
})

app.post("/api/auth/register", async (req, res) => {
    try {
        const { name, phoneNumber, password} = req.body

        if (!name || !phoneNumber || !password) return res.status(422).json({ message: "Please fill in all fields"})
        if (phoneNumber.length != 10) return res.status(422).json({ message: "Enter Valid Number"})
        if (await users.findOne({ phoneNumber})) return res.status(409).json({message: "Number already exists"})
        const hashedPassword = await bcrypt.hash(password, 4578)

        const newUser = await users.insert({
            name,
            phoneNumber,
            password: hashedPassword,
            status: 0
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
        const refreshToken = jwt.sign({ userId: user._id , phoneNumber: user.phoneNumber}, config.refreshTokenSecret, { subject:"refreshToken", expiresIn:"1w"})

        await userRefreshTokens.insert({
            refreshToken,
            userId: user._id
        })

        return res.status(200).json({
            id: user._id,
            phoneNumber: user.phoneNumber,
            accessToken,
            refreshToken
        })
    } catch(error) {
        return res.status(500).json({ message: error.message})
    }
})

app.get("api/auth/logout", authenticated, async (req, res) => {
    try {
        await userRefreshTokens.removeMany({ userId: req.user.id})
        await userRefreshTokens.compactDataFile()

        return res.status(204).send({ message: "Logged Out"})

    } catch (error) {
        return res.status(500).json({message: error.message})
    }
})

app.post("/api/auth/refresh-token", async (req,res) => {
    try {
        const { refreshToken } = req.body

        if (!refreshToken) {
            return res.status(401).json({ message: "Refresh Token is not found"})
        }

        const decodedRefreshToken = jwt.verify(refreshToken, config.refreshTokenSecret)

        const userRefreshToken = await userRefreshTokens.findOne({ refreshToken, userId: decodedRefreshToken.userId})
        if(!userRefreshToken) return res.status(401).json({ message: 'Refresh Token invalid or expired'})

        await userRefreshTokens.remove({ _id: userRefreshToken._id})
        await userRefreshTokens.compactDataFile()

        const accessToken = jwt.sign({ userId:  decodedRefreshToken.userId , phoneNumber:  decodedRefreshToken.phoneNumber}, config.accessTokenSecret, { subject:"accessApi", expiresIn:"1d"})
        const newRefreshToken = jwt.sign({ userId:  decodedRefreshToken.userId , phoneNumber:  decodedRefreshToken.phoneNumber}, config.refreshTokenSecret, { subject:"refreshToken", expiresIn:"1w"})

        await userRefreshTokens.insert({
            refreshToken: newRefreshToken,
            userId: decodedRefreshToken.userId
        })

        return res.status(200).json({
            accessToken,
            refreshToken: newRefreshToken
        })

    } catch (error) {
        if (error instanceof jwt.TokenExpiredError || error instanceof jwt.JsonWebTokenError) return res.status(401).json({message: "Refresh Token invalid or expired"})

        res.status(500).json({message: error.message})
    }
})
app.get('/api/user/me', authenticated, async (req, res) => {
    try {
        const user = await users.findOne({ _id: req.user.id})

        return res.status(200).json({
            id: user._id,
            name: user.name,
            phoneNumber: user.phoneNumber,
            status: user.status

        })
    } catch (error) {
        return res.status(500).json({ message: error.message})
    }
})
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

async function authenticated(req, res, next) {
    const accessToken = req.headers.authorization

    if(!accessToken) return res.status(401).json({message: "Access token not found"})
    try {
        const decodedAccessToken = jwt.verify(accessToken, config.accessTokenSecret)

        req.accessToken = { value: accessToken, exp: decodedAccessToken.exp}
        req.user = { id: decodedAccessToken.userId, phoneNumber: decodedAccessToken.phoneNumber }

        next()
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ message: "Access Token expired", code: "AccessTokenExpired"})
        } else if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ message: "Access Token invalid", code: "AccessTokenInvalid"})
        } else {
            return res.status(500).json({ message: error.message})
        }
    }
}

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
