const cloudinary = require("cloudinary").v2
const dotenv = require("dotenv")
dotenv.config()

cloudinary.config({
    api_key: process.env.cloudinary_key,
    cloud_name: process.env.cloudinary_name,
    api_secret: process.env.cloudinary_secret
})

module.exports = cloudinary