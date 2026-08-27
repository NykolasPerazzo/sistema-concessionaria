const form = document.getElementById("vehicleForm");

const pageTitle = document.getElementById("pageTitle");
const submitButton = document.getElementById("submitButton");
const formMessage = document.getElementById("formMessage");

const coverImageInput = document.getElementById("coverImage");
const imagePreview = document.getElementById("imagePreview");

const galleryImagesInput = document.getElementById("galleryImages");
const galleryPreview = document.getElementById("galleryPreview");

const params = new URLSearchParams(window.location.search);

const vehicleId = params.get("id");
const isEditing = Boolean(vehicleId);

// Novas imagens selecionadas no computador
let selectedGalleryFiles = [];

// Imagens que já existem no banco ao editar
let existingGalleryImages = [];


/* =========================
   AUTENTICAÇÃO
========================= */

requireAuth().then((user) => {

    if (!user) {
        return;
    }

    if (isEditing) {

        pageTitle.textContent = "Editar veículo";
        submitButton.textContent = "Salvar alterações";

        loadVehicle();
    }

});


/* =========================
   CARREGAR VEÍCULO
========================= */

async function loadVehicle() {

    try {

        const response = await fetch(
            `${API_URL}/vehicles/${vehicleId}`,
            {
                credentials: "include"
            }
        );

        const data = await response.json();

        if (!response.ok) {

            throw new Error(
                data.error || "Veículo não encontrado."
            );

        }

        fillForm(data.vehicle);

        await loadGallery(vehicleId);

    } catch (error) {

        console.error(error);

        showMessage(
            error.message,
            "error"
        );

    }

}


/* =========================
   CARREGAR GALERIA EXISTENTE
========================= */

async function loadGallery(id) {

    try {

        const response = await fetch(
            `${API_URL}/vehicle-images/${id}`,
            {
                credentials: "include"
            }
        );

        if (!response.ok) {

            throw new Error(
                "Erro ao carregar imagens."
            );

        }

        const data = await response.json();

        existingGalleryImages = data.images || [];

        renderGallery();

    } catch (error) {

        console.error(error);

    }

}


/* =========================
   PREENCHER FORMULÁRIO
========================= */

function fillForm(vehicle) {

    document.getElementById("brand").value =
        vehicle.brand || "";

    document.getElementById("model").value =
        vehicle.model || "";

    document.getElementById("year").value =
        vehicle.year || "";

    document.getElementById("price").value =
        vehicle.price || "";

    document.getElementById("mileage").value =
        vehicle.mileage || "";

    document.getElementById("fuel").value =
        vehicle.fuel || "";

    document.getElementById("transmission").value =
        vehicle.transmission || "";

    document.getElementById("body_type").value =
        vehicle.body_type || "";

    document.getElementById("color").value =
        vehicle.color || "";

    document.getElementById("description").value =
        vehicle.description || "";

    document.getElementById("status").value =
        vehicle.status || "available";


    /*
        Se o veículo já possui uma imagem,
        mostramos ela ao editar.
    */

    if (vehicle.image_url) {

        imagePreview.innerHTML = `
            <img
                src="${vehicle.image_url}"
                alt="Imagem atual do veículo"
            >

            <span class="image-current-label">
                Imagem atual
            </span>
        `;

    }

}


/* =========================
   IMAGEM PRINCIPAL
========================= */

coverImageInput.addEventListener(
    "change",
    () => {

        const file = coverImageInput.files[0];

        if (!file) {

            imagePreview.innerHTML = `
                <span>
                    A prévia da imagem aparecerá aqui
                </span>
            `;

            return;
        }


        if (!isValidImage(file)) {

            coverImageInput.value = "";

            showMessage(
                "Selecione uma imagem JPG, PNG ou WEBP.",
                "error"
            );

            return;
        }


        const previewUrl =
            URL.createObjectURL(file);


        imagePreview.innerHTML = `
            <img
                src="${previewUrl}"
                alt="Prévia do veículo"
            >
        `;

    }
);


/* =========================
   GALERIA
========================= */

galleryImagesInput.addEventListener(
    "change",
    () => {

        const files =
            Array.from(
                galleryImagesInput.files
            );


        const validFiles =
            files.filter(isValidImage);


        if (validFiles.length !== files.length) {

            showMessage(
                "Alguns arquivos foram ignorados. Use somente JPG, PNG ou WEBP.",
                "error"
            );

        }


        /*
            Adicionamos os arquivos selecionados
            à galeria.
        */

        selectedGalleryFiles.push(
            ...validFiles
        );


        /*
            Limpamos o input para permitir
            selecionar novamente o mesmo arquivo.
        */

        galleryImagesInput.value = "";


        renderGallery();

    }
);


/* =========================
   RENDERIZAR GALERIA
========================= */

function renderGallery() {

    const hasExisting =
        existingGalleryImages.length > 0;

    const hasNew =
        selectedGalleryFiles.length > 0;


    if (!hasExisting && !hasNew) {

        galleryPreview.innerHTML = `
            <p>
                Nenhuma foto selecionada.
            </p>
        `;

        return;

    }


    /*
        Imagens que já existem no servidor.
    */

    const existingHTML =
        existingGalleryImages
            .map((image, index) => {

                return `
                    <div class="gallery-item">

                        <img
                            src="${image.image_url}"
                            alt="Foto existente ${index + 1}"
                        >

                        <span class="gallery-existing-label">
                            Salva
                        </span>

                    </div>
                `;

            })
            .join("");


    /*
        Novos arquivos escolhidos no computador.
    */

    const newHTML =
        selectedGalleryFiles
            .map((file, index) => {

                const previewUrl =
                    URL.createObjectURL(file);


                return `
                    <div class="gallery-item">

                        <img
                            src="${previewUrl}"
                            alt="${file.name}"
                        >

                        <button
                            type="button"
                            class="gallery-remove"
                            data-index="${index}"
                        >
                            ×
                        </button>

                    </div>
                `;

            })
            .join("");


    galleryPreview.innerHTML =
        existingHTML + newHTML;


    document
        .querySelectorAll(".gallery-remove")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const index =
                        Number(
                            button.dataset.index
                        );


                    selectedGalleryFiles.splice(
                        index,
                        1
                    );


                    renderGallery();

                }
            );

        });

}


/* =========================
   SALVAR VEÍCULO
========================= */

form.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        clearMessage();


        const brand =
            document
                .getElementById("brand")
                .value
                .trim();

        const model =
            document
                .getElementById("model")
                .value
                .trim();

        const year =
            document
                .getElementById("year")
                .value;

        const price =
            document
                .getElementById("price")
                .value;


        if (
            !brand ||
            !model ||
            !year ||
            !price
        ) {

            showMessage(
                "Preencha marca, modelo, ano e preço.",
                "error"
            );

            return;

        }


        /*
            Criamos FormData.

            Agora NÃO usamos JSON.stringify().
        */

        const formData =
            new FormData();


        formData.append(
            "brand",
            brand
        );

        formData.append(
            "model",
            model
        );

        formData.append(
            "year",
            year
        );

        formData.append(
            "price",
            price
        );


        const mileage =
            document
                .getElementById("mileage")
                .value;


        if (mileage) {

            formData.append(
                "mileage",
                mileage
            );

        }


        const fuel =
            document
                .getElementById("fuel")
                .value;

        if (fuel) {

            formData.append(
                "fuel",
                fuel
            );

        }


        const transmission =
            document
                .getElementById("transmission")
                .value;

        if (transmission) {

            formData.append(
                "transmission",
                transmission
            );

        }


        const bodyType =
            document
                .getElementById("body_type")
                .value;

        if (bodyType) {

            formData.append(
                "body_type",
                bodyType
            );

        }


        const color =
            document
                .getElementById("color")
                .value
                .trim();

        if (color) {

            formData.append(
                "color",
                color
            );

        }


        const description =
            document
                .getElementById("description")
                .value
                .trim();

        if (description) {

            formData.append(
                "description",
                description
            );

        }


        formData.append(
            "status",
            document
                .getElementById("status")
                .value
        );


        /*
            IMAGEM PRINCIPAL
        */

        const coverImage =
            coverImageInput.files[0];


        if (coverImage) {

            formData.append(
                "coverImage",
                coverImage
            );

        }


        /*
            GALERIA
        */

        selectedGalleryFiles.forEach(
            file => {

                formData.append(
                    "galleryImages",
                    file
                );

            }
        );


        submitButton.disabled = true;

        submitButton.textContent =
            "Salvando...";


        try {

            const url = isEditing

                ? `${API_URL}/vehicles/${vehicleId}`

                : `${API_URL}/vehicles`;


            const method = isEditing
                ? "PUT"
                : "POST";


            const response =
                await fetch(
                    url,
                    {
                        method,

                        credentials: "include",

                        /*
                            IMPORTANTE:

                            NÃO colocar:

                            Content-Type:
                            application/json
                        */

                        body: formData
                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data.error ||
                    "Erro ao salvar veículo."
                );

            }


            showMessage(

                isEditing

                    ? "Veículo atualizado com sucesso!"

                    : "Veículo cadastrado com sucesso!",

                "success"

            );


            setTimeout(
                () => {

                    window.location.href =
                        "./vehicles.html";

                },
                800
            );


        } catch (error) {

            console.error(error);

            showMessage(
                error.message,
                "error"
            );

        } finally {

            submitButton.disabled = false;

            submitButton.textContent =
                isEditing

                    ? "Salvar alterações"

                    : "Salvar veículo";

        }

    }
);


/* =========================
   VALIDAÇÃO DE IMAGEM
========================= */

function isValidImage(file) {

    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];


    return allowedTypes.includes(
        file.type
    );

}


/* =========================
   MENSAGENS
========================= */

function showMessage(
    message,
    type
) {

    formMessage.textContent =
        message;

    formMessage.className =
        `form-message ${type}`;

}


function clearMessage() {

    formMessage.textContent = "";

    formMessage.className =
        "form-message";

}