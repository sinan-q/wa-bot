const DataStore = require('nedb-promises')
const users = DataStore.create('Users.db')
const userRefreshTokens = DataStore.create('UserRefreshTokens')




const me = async ( req, res) => {
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
}

const logout = async (req, res) => {
    const cookies = req.cookies 

    try {
        if (!cookies?.jwt) await userRefreshTokens.removeMany({ userId: req.user.id})
        else await userRefreshTokens.removeMany({ refreshToken:  cookies.jwt})
        await userRefreshTokens.compactDatafile()
        res.clearCookie('jwt', { httpOnly: true } )
        return res.status(204).json({ message: "Logged Out"})

    } catch (error) {
        return res.status(500).json({message: error.message})
    }
}

module.exports = { me, logout }