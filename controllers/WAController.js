const makeWASocket = require("@whiskeysockets/baileys").default
const { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } = require("@whiskeysockets/baileys")
const qrcode = require("qrcode")
const { default: pino } = require("pino")
const fs = require("fs");

let qrRetry = 0
var socks = []


const status = async ( req, res) => {
    
    try {
        const sock = socks[req.user.phoneNumber]
        let preStatus = -1
        res.setHeader("Content-Type", "text/event-stream")

        intervalId = setInterval(() => {
            if (preStatus !== sock?.status) {
                res.write(`{ "data":${sock?.status || 0}, "qr":${sock?.qr || "null"} }`) //({message: , qr: socks[req.user.phoneNumber]?.qr })
                preStatus = sock?.status
            }
        }, 2000)

        req.on('close' , ()=> clearInterval(intervalId))
    } catch (error) {
        return res.status(500).json({ message: error.message})
    }
}

const start = async ( req, res) =>  {
    try {
        await startSock(req.user.phoneNumber)
        return res.status(201).json({message:"Started"})
    } catch (error) {
        return res.status(500).json({ message: error.message})

    }
}

const send = async (req, res) => {
    const { message, phoneNumber } = req.body
    if ( !message ) return res.status(422).json({ message: "Please fill in all fields"})

    if (socks[req.user.phoneNumber]?.status === 2) {
        socks[req.user.phoneNumber].sock.sendMessage(phoneNumber+"@s.whatsapp.net", { text: message })
        return res.status(200).json({ message: "success"})
    }
    return res.status(401).json({ message: "failed"})
}

const logout = async (req, res) => {
    try {
        await socks[req.user.phoneNumber].sock.logout()
        return res.status(200).json({ message: "success"})
    } catch (error) {
        console.log(JSON.stringify(error))
        return res.status(500).json({ message: error.message})
    }
        
}

const stop = async (req, res) => {
    try {
        socks[req.user.phoneNumber].sock = null
        socks[req.user.phoneNumber].status = 0
        socks[req.user.phoneNumberz].qr = null
        return res.status(200).json({ message: "success"})
    } catch (error) {
        console.log(JSON.stringify(error))
        return res.status(500).json({ message: error.message})
    }
        
}
module.exports = { status, start, send, stop, logout }

async function startSock(url) {
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
                    socks[url].sock = null
                    socks[url].status = 0
                    socks[url].qr = null
                    let lastDisconnectReason = (lastDisconnect?.error)?.output?.statusCode
                    if ( lastDisconnectReason !== DisconnectReason.loggedOut) {
                        console.log('Connection closed', JSON.stringify(lastDisconnect))
                        if ( lastDisconnectReason === DisconnectReason.timedOut) {
                            socks[url].status = 408
                        } else if (lastDisconnectReason) {
                            startSock(url)
                        }
                    } else  {
                        fs.rmSync("./auth_info/" + url, { recursive: true, force: true });
                        
                        console.log('Connection closed. You are logged out.', lastDisconnectReason)
                    }
                }
                if (qr != undefined) {
                    if (qrRetry >= 4) {
                        socks[url].sock.logout()
                        console.log("log", qrRetry)
                    } else {
                        qrcode.toDataURL(qr, (err, uri) => {
                            socks[url].status = 1
                            socks[url].qr = qr

                            console.log('retry', qrRetry)
                            qrRetry = qrRetry + 1
                        })
                    }
                }
                console.log('connection_update :', connection || update)
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