const DataStore = require('nedb-promises')
const bcrypt = require("bcryptjs")
const users = DataStore.create('Users.db')
const userRefreshTokens = DataStore.create('UserRefreshTokens')
const jwt = require('jsonwebtoken')
require('dotenv').config();



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

        const accessToken = jwt.sign({ userId: user._id , phoneNumber: user.phoneNumber}, process.env.ACCESS_TOKEN_SECRET, { subject:"accessApi", expiresIn:"1d"})
        const refreshToken = jwt.sign({ userId: user._id , phoneNumber: user.phoneNumber}, process.env.REFRESH_TOKEN_SECRET, { subject:"refreshToken", expiresIn:"1w"})

        await userRefreshTokens.insert({
            refreshToken,
            userId: user._id
        })
        res.cookie('jwt',refreshToken, { httpOnly: true, maxAge: 24 * 60 *60 *1000})
        return res.status(200).json({
            id: user._id,
            phoneNumber: user.phoneNumber,
            accessToken
        })
    } catch(error) {
        return res.status(500).json({ message: error.message})
    }
}

const refreshToken = async (req, res) => {
    const cookies = req.cookies 
    if (!cookies?.jwt) return res.status(401).json({ message: "Refresh Token is not found"})
    const refreshToken = cookies.jwt

    try {

        const decodedRefreshToken = jwt.verify(refreshToken,  process.env.REFRESH_TOKEN_SECRET)

        const userRefreshToken = await userRefreshTokens.findOne({ refreshToken, userId: decodedRefreshToken.userId})
        if(!userRefreshToken) return res.status(401).json({ message: 'Refresh Token invalid or expired'})

        await userRefreshTokens.remove({ _id: userRefreshToken._id})
        await userRefreshTokens.compactDatafile()

        const accessToken = jwt.sign({ userId:  decodedRefreshToken.userId , phoneNumber:  decodedRefreshToken.phoneNumber},  process.env.ACCESS_TOKEN_SECRET, { subject:"accessApi", expiresIn:"1d"})
        const newRefreshToken = jwt.sign({ userId:  decodedRefreshToken.userId , phoneNumber:  decodedRefreshToken.phoneNumber},  process.env.REFRESH_TOKEN_SECRET, { subject:"refreshToken", expiresIn:"1w"})

        await userRefreshTokens.insert({
            refreshToken: newRefreshToken,
            userId: decodedRefreshToken.userId
        })
        res.cookie('jwt',newRefreshToken, { httpOnly: true, maxAge: 24 * 60 *60 *1000})

        return res.status(200).json({
            accessToken
        })

    } catch (error) {
        if (error instanceof jwt.TokenExpiredError || error instanceof jwt.JsonWebTokenError) return res.status(401).json({message: "Refresh Token invalid or expired"})

        res.status(500).json({message: error.message})
    }
}

module.exports = { registerUser , loginUser ,refreshToken }