const express = require("express")
const cors = require('cors')
const morganLogger = require('morgan')
const port = 3000
const app = express()
const cookieparser = require('cookie-parser')
const authenticated = require('./middleware/authenticated');

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
app.use('/wa', require('./routes/wa.js'))

app.listen(port, () => {
    console.log(`http://localhost:${port}`)
})
