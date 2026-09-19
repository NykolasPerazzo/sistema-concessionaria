const multer = require("multer");

/*
 * Upload exclusivo do CRLV/CRLV-e (PDF, JPG ou PNG). Não reaproveita o
 * middleware de imagens de veículo (upload.middleware.js), que só aceita
 * imagens. Mantém tudo em memória (memoryStorage) — o CRLV nunca é
 * gravado em disco, no Cloudinary ou no banco: só é usado para a
 * chamada à IA e descartado ao final da requisição.
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];

const SIGNATURES = {
  "application/pdf": (buffer) =>
    buffer.length >= 5 && buffer.slice(0, 5).toString("ascii") === "%PDF-",

  "image/jpeg": (buffer) =>
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff,

  "image/png": (buffer) => {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

    return (
      buffer.length >= pngSignature.length &&
      pngSignature.every((byte, index) => buffer[index] === byte)
    );
  },
};

/*
 * Detecta o tipo real do arquivo pelos primeiros bytes (assinatura),
 * ignorando o que o cliente declarou em Content-Type ou na extensão.
 * Retorna null quando o conteúdo não corresponde a nenhum formato aceito.
 */
function detectSignatureMimeType(buffer) {
  for (const mimeType of ALLOWED_MIME_TYPES) {
    if (SIGNATURES[mimeType](buffer)) {
      return mimeType;
    }
  }

  return null;
}

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    const error = new Error("CRLV_MIME_NOT_ALLOWED");

    error.code = "CRLV_MIME_NOT_ALLOWED";

    return cb(error);
  }

  return cb(null, true);
};

const multerUpload = multer({
  storage,
  fileFilter,

  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
}).single("crlv");

/* ==========================================
   RECEBER O ARQUIVO (multer) COM ERROS
   PADRONIZADOS EM JSON
========================================== */

function receiveCrlvFile(req, res, next) {
  multerUpload(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "O arquivo deve ter no máximo 10 MB.",
      });
    }

    if (
      error.code === "LIMIT_UNEXPECTED_FILE" ||
      error.code === "LIMIT_FILE_COUNT"
    ) {
      return res.status(400).json({
        error: "Envie apenas um arquivo por vez.",
      });
    }

    if (error.code === "CRLV_MIME_NOT_ALLOWED") {
      return res.status(415).json({
        error: "Envie um CRLV em PDF, JPG ou PNG.",
      });
    }

    console.error("Erro no upload do CRLV:", error.message);

    return res.status(400).json({
      error: "Não foi possível processar o arquivo enviado.",
    });
  });
}

/* ==========================================
   VALIDAR A ASSINATURA REAL DO ARQUIVO
   (nunca confiar apenas em mimetype/extensão)
========================================== */

function validateCrlvSignature(req, res, next) {
  const file = req.file;

  if (!file) {
    // A ausência de arquivo é tratada pelo controller (400).
    return next();
  }

  const detectedMimeType = detectSignatureMimeType(file.buffer);

  if (!detectedMimeType || detectedMimeType !== file.mimetype) {
    return res.status(415).json({
      error: "O conteúdo do arquivo não corresponde ao formato informado.",
    });
  }

  // Mimetype confirmado pela assinatura real do arquivo: seguro para
  // repassar ao provedor de IA como mime_type.
  file.verifiedMimeType = detectedMimeType;

  return next();
}

module.exports = [receiveCrlvFile, validateCrlvSignature];

module.exports.detectSignatureMimeType = detectSignatureMimeType;
module.exports.ALLOWED_MIME_TYPES = ALLOWED_MIME_TYPES;
module.exports.MAX_FILE_SIZE = MAX_FILE_SIZE;
