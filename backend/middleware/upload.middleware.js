const multer = require("multer");

/*
 * Mantém o arquivo em memória (buffer) em vez de
 * salvar em disco — o upload real acontece no
 * controller, depois de sabermos o id do veículo
 * (necessário para organizar a pasta no Cloudinary).
 */
const storage = multer.memoryStorage();

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