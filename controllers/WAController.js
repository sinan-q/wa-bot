const makeWASocket = require("@whiskeysockets/baileys").default
const { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } = require("@whiskeysockets/baileys")
const qrcode = require("qrcode")
const { default: pino } = require("pino")

let qrRetry = 0
var socks = []


const status = async ( req, res) => {
    try {
        return res.status(201).json({message: socks[req.user.phoneNumber]?.status || 0, qr: socks[req.user.phoneNumber]?.qr })
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
    const { message } = req.body
    if ( !message ) return res.status(422).json({ message: "Please fill in all fields"})

    if (socks[req.user.phoneNumber]?.status === 2) {
        socks[req.user.phoneNumber].sock.sendMessage("919539391118@s.whatsapp.net", { text: message })
        return res.status(200).json({ message: "success"})
    }
    return res.status(401).json({ message: "failed"})
}

const logout = async (req, res) => {
    try {
        await socks[req.user.phoneNumber].sock.logout()
        return res.status(200).json({ message: "success"})
    } catch (error) {
        return res.status(500).json({ message: error.message})
    }
        
}
module.exports = { status, start, send, logout }

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
                    if ((lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
                        startSock(url)
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