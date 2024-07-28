const DataStore = require('nedb-promises')
const users = DataStore.create('Users.db')




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

module.exports = { me }