const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("./cloudinary"); // Assuming this exports the configured instance

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "Player-Profile", // Correct key name
    allowed_formats: ["png", "jpg", "gif"], // Correct key name
    // transformation: [{ width: 500, height: 500 }] // Optional resize
  }
});

const uploadPlayerImage = multer({ storage });
module.exports = uploadPlayerImage;