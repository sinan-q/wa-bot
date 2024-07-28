const jwt = require('jsonwebtoken')
require('dotenv').config();

const authenticated = (req, res, next) => {
    const auth = req.headers['authorization']

    if(!auth) return res.status(401).json({message: "Access token not found"})
    
    console.log(auth);
    try {
        const decodedAccessToken = jwt.verify(auth.split(' ')[1],  process.env.ACCESS_TOKEN_SECRET)
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

module.exports = authenticated