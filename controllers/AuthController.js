const DataStore = require('nedb-promises')
const bcrypt = require("bcryptjs")
const users = DataStore.create('Users.db')
const userRefreshTokens = DataStore.create('UserRefreshTokens')
const jwt = require('jsonwebtoken')
const config = require('../config.js')



const registerUser = async ( req, res) => {
    try {
        const { name, phoneNumber, password} = req.body
    
        if (!name || !phoneNumber || !password) return res.status(422).json({ message: "Please fill in all fields"})
        if (phoneNumber.length != 10) return res.status(422).json({ message: "Enter Valid Number"})
        if (await users.findOne({ phoneNumber})) return res.status(409).json({message: "Number already exists"})
        const hashedPassword = await bcrypt.hash(password, 10)
        await users.insert({
            name,
            phoneNumber,
            password: hashedPassword,
            status: 0
        })
    
        return res.status(201).json({ message: "User registerd"})
    } catch (error) {
        return res.status(500).json({ message: error.message})
    }
}


const loginUser = async (req, res ) => {
    try {
        const { phoneNumber, password } = req.body
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
        res.cookie('jwt',refreshToken, { httpOnly: true})
        return res.status(200).json({
            id: user._id,
            phoneNumber: user.phoneNumber,
            accessToken,
            refreshToken
        })
    } catch(error) {
        return res.status(500).json({ message: error.message})
    }
}

module.exports = { registerUser , loginUser }