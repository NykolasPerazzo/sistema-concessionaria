const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(
            null,
            path.join(
                __dirname,
                "..",
                "uploads",
                "vehicles"
            )
        );
    },

    filename: (req, file, cb) => {
        const uniqueName =
            `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

        const extension =
            path.extname(file.originalname);

        cb(
            null,
            `${uniqueName}${extension}`
        );
    }
});

const fileFilter = (
    req,
    file,
    cb
) => {

    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    if (!allowedTypes.includes(file.mimetype)) {

        return cb(
            new Error(
                "Formato de imagem não permitido."
            )
        );

    }

    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,

    limits: {
        fileSize: 5 * 1024 * 1024
    }
});

module.exports = upload;