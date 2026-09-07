const { v2: cloudinary } = require("cloudinary");
const { Readable } = require("stream");

function configured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

function ensureConfigured() {
  if (!configured()) {
    return false;
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  return true;
}

function uploadBuffer(buffer, { folder, publicId } = {}) {
  return new Promise((resolve, reject) => {
    if (!ensureConfigured()) {
      reject(new Error("Cloudinary não configurado."));
      return;
    }

    const options = {
      folder,
      resource_type: "image",
    };

    if (publicId) {
      options.public_id = publicId;
      options.overwrite = true;
      options.invalidate = true;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
        });
      },
    );

    uploadStream.on("error", reject);

    Readable.from(buffer).pipe(uploadStream);
  });
}

async function renameAsset(fromPublicId, toPublicId) {
  if (!ensureConfigured()) {
    throw new Error("Cloudinary não configurado.");
  }

  const result = await cloudinary.uploader.rename(fromPublicId, toPublicId, {
    overwrite: true,
    invalidate: true,
  });

  return {
    secure_url: result.secure_url,
    public_id: result.public_id,
  };
}

function describeError(error) {
  return error?.message || error?.error?.message || String(error);
}

async function deleteAsset(publicId) {
  if (!publicId || !ensureConfigured()) {
    return false;
  }

  try {
    await cloudinary.uploader.destroy(publicId);

    return true;
  } catch (error) {
    console.error("Erro ao remover imagem no Cloudinary:", describeError(error));

    return false;
  }
}

async function deleteFolder(folderPrefix) {
  if (!folderPrefix || !ensureConfigured()) {
    return false;
  }

  try {
    await cloudinary.api.delete_resources_by_prefix(folderPrefix);
  } catch (error) {
    console.error(
      "Erro ao remover imagens da pasta no Cloudinary:",
      describeError(error),
    );

    return false;
  }

  /*
    Remover a pasta em si é cosmético (o Cloudinary não
    exige pastas vazias) — não deixamos isso mascarar o
    sucesso da limpeza das imagens acima.
  */
  try {
    await cloudinary.api.delete_folder(folderPrefix);
  } catch (error) {
    console.error(
      "Aviso: não foi possível remover a pasta vazia no Cloudinary:",
      describeError(error),
    );
  }

  return true;
}

module.exports = {
  configured,
  uploadBuffer,
  renameAsset,
  deleteAsset,
  deleteFolder,
};
