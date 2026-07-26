/* require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const https = require("https");

const app = express();

const PORT = process.env.PORT || 3000;

const API_KEY = process.env.API_KEY;

const API_BASE = "https://api.lwatlas.com/v1";


if (!API_KEY) {

    console.error("");

    console.error("❌ ERROR: No existe la variable API_KEY");

    console.error("Configúrala en .env o en Render.");

    process.exit(1);

}

app.use(cors());

app.use(express.json());

function getHeaders() {

    return {

        "X-Api-Key": API_KEY,

        "Accept-Encoding": "identity"

    };

}

function esperar(ms) {

    return new Promise(resolve =>

        setTimeout(resolve, ms)

    );

}


async function llamarAPI(url) {

    const respuesta = await fetch(url, {

        headers: getHeaders()

    });

    if (!respuesta.ok) {

    console.warn(

        `${respuesta.status} ${url}`

    );

}

    const texto = await respuesta.text();

    try {

        

        return {

            status: respuesta.status,

            body: JSON.parse(texto)

        };

    }

    catch {

        return {

            status: respuesta.status,

            body: texto

        };

    }

}


// ==========================
// EXPLORAR API
// ==========================

app.get("/api/lwatlas", async (req, res) => {

    await explorar("", req, res);

});

app.get("/api/lwatlas/*path", async (req, res) => {

    const path = req.params.path.join("/");

    await explorar(path, req, res);

});



async function explorar(path, req, res) {

    const queryString = new URLSearchParams(req.query).toString();

    const url =

        `${API_BASE}/${path}` +

        (queryString ? `?${queryString}` : "");

    console.log("");

    console.log("GET");

    console.log(url);

    const MAX_INTENTOS = 3;

    for (

        let intento = 1;

        intento <= MAX_INTENTOS;

        intento++

    ) {

        try {

            const resultado =

                await llamarAPI(url);

            return res

                .status(resultado.status)

                .send(resultado.body);

        }

        catch (error) {

            console.error(

                `Intento ${intento}`,

                error.message

            );

            if (

                intento === MAX_INTENTOS

            ) {

                return res.status(500).json({

                    error: error.message

                });

            }

            await esperar(

                intento * 500

            );

        }

    }

}


// ==========================
// MAP SCAN
// ==========================

app.post(

    "/api/lwatlas/map-scan/jobs",

    async (req, res) => {

        try {

            const response = await fetch(

                `${API_BASE}/map-scan/jobs`,

                {

                    method: "POST",

                    headers: {

                        "X-Api-Key": API_KEY,

                        "Content-Type":

                            "application/json",

                        "Idempotency-Key":

                            req.headers["idempotency-key"]

                            ||

                            crypto.randomUUID()

                    },

                    body: JSON.stringify(

                        req.body

                    )

                }

            );

            const texto =

                await response.text();

            try {

                res

                    .status(response.status)

                    .json(

                        JSON.parse(texto)

                    );

            }

            catch {

                res

                    .status(response.status)

                    .send(texto);

            }

        }

        catch (error) {

            res.status(500).json({

                error:

                    error.message

            });

        }

    }

);



app.get(

    "/api/lwatlas/map-scan/jobs/:jobId/download",

    (req, res) => {

        descargarConReintentos(

            `${API_BASE}/map-scan/jobs/${req.params.jobId}/download`,

            res,

            1

        );

    }

);


// ======================================
// DESCARGA DE MAP SCAN
// ======================================

const MAX_INTENTOS_DESCARGA = 5;

function descargarConReintentos(url, res, intento) {

    console.log(`Intento ${intento}/${MAX_INTENTOS_DESCARGA}`);

    descargarConHttps(

        url,

        0,

        (error, cuerpo, status) => {

            if (!error) {

                const resultado =

                    analizarNdjson(cuerpo);

                return res

                    .status(status)

                    .send(resultado);

            }

            console.error(error.message);

            if (

                intento >=

                MAX_INTENTOS_DESCARGA

            ) {

                return res.status(500).json({

                    error:

                        "La descarga falló repetidamente",

                    detalle:

                        error.message

                });

            }

            setTimeout(() => {

                descargarConReintentos(

                    url,

                    res,

                    intento + 1

                );

            }, 1500);

        }

    );

}


function analizarNdjson(texto) {

    const filas = [];

    let corruptas = 0;

    texto

        .split("\n")

        .filter(l => l.trim())

        .forEach(linea => {

            try {

                filas.push(

                    JSON.parse(linea)

                );

            }

            catch {

                corruptas++;

            }

        });

    console.log("");

    console.log("========== MAP SCAN ==========");

    console.log("Filas:", filas.length);

    console.log("Corruptas:", corruptas);

    const conteo = {};

    filas.forEach(f => {

        conteo[f.cfg_id] =

            (conteo[f.cfg_id] || 0) + 1;

    });

    console.log("");

    console.log("Tipos encontrados");

    console.table(conteo);

    const ahora = Date.now();

const vigentes = filas.filter(f =>

    f.act_end_time &&

    f.act_end_time > ahora

);

    console.log("");

    console.log(

        "Vigentes:",

        vigentes.length

    );

    console.log(

        "Expiradas:",

        filas.length - vigentes.length

    );

    console.log("==============================");

    return vigentes

        .map(f => JSON.stringify(f))

        .join("\n");

}



function descargarConHttps(

    url,

    redirects,

    callback

) {

    https.get(

        url,

        {

            headers: {

                "X-Api-Key": API_KEY

            },

            timeout: 20000

        },

        response => {

            if (

                [301,302,303,307,308]

                .includes(response.statusCode)

            ) {

                if (redirects >= 5) {

                    return callback(

                        new Error(

                            "Demasiadas redirecciones"

                        )

                    );

                }

                response.resume();

                return descargarConHttps(

                    response.headers.location,

                    redirects + 1,

                    callback

                );

            }

            const chunks = [];

            response.on(

                "data",

                chunk => chunks.push(chunk)

            );

            response.on(

                "end",

                () => {

                    callback(

                        null,

                        Buffer

                            .concat(chunks)

                            .toString(),

                        response.statusCode

                    );

                }

            );

            response.on(

                "error",

                err => {

                    if (

                        err.message ===

                        "aborted"

                    ) {

                        return callback(

                            null,

                            Buffer

                                .concat(chunks)

                                .toString(),

                            response.statusCode

                        );

                    }

                    callback(err);

                }

            );

        }

    )

    .on(

        "timeout",

        function () {

            this.destroy();

            callback(

                new Error("Timeout")

            );

        }

    )

    .on(

        "error",

        callback

    );

}



// =====================================
// HEALTH CHECK
// =====================================

app.get("/health", (req, res) => {

    res.json({

        status: "online",

        service: "Last War Guide Backend",

        version: "1.0.0",

        uptime: Math.round(process.uptime()),

        timestamp: new Date().toISOString()

    });

});

// =====================================
// VERSION
// =====================================

app.get("/version", (req, res) => {

    res.json({

        app: "lastwar-guide-backend",

        version: "1.0.0",

        node: process.version

    });

});

// =====================================
// 404
// =====================================

app.use((req, res) => {

    res.status(404).json({

        error: "Endpoint no encontrado",

        path: req.originalUrl

    });

});

// =====================================
// ERROR GLOBAL
// =====================================

app.use((err, req, res, next) => {

    console.error("");

    console.error("========== ERROR ==========");

    console.error(err);

    console.error("===========================");

    res.status(500).json({

        error: "Internal Server Error",

        message: err.message

    });

});

app.listen(PORT, () => {

    console.clear();

    console.log("");

    console.log("==========================================");

    console.log("🚀 Last War Guide Backend");

    console.log("==========================================");

    console.log("");

    console.log(`Puerto       : ${PORT}`);

    console.log(`LWAtlas API  : ${API_BASE}`);

    console.log(`Health Check : http://localhost:${PORT}/health`);

    console.log("");

    console.log("==========================================");

}); */



require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const https = require("https");

const app = express();

const PORT = process.env.PORT || 3000;

const API_KEY = process.env.API_KEY;

const API_BASE = "https://api.lwatlas.com/v1";

if (!API_KEY) {
    console.error("");
    console.error("❌ ERROR: No existe la variable API_KEY");
    console.error("Configúrala en .env o en Render.");
    process.exit(1);
}

app.use(cors());
app.use(express.json());

function getHeaders() {
    return {
        "X-Api-Key": API_KEY,
        "Accept-Encoding": "identity"
    };
}

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function llamarAPI(url) {
    const respuesta = await fetch(url, {
        headers: getHeaders()
    });

    if (!respuesta.ok) {
        console.warn(`${respuesta.status} ${url}`);
    }

    const texto = await respuesta.text();

    try {
        return {
            status: respuesta.status,
            body: JSON.parse(texto)
        };
    } catch {
        return {
            status: respuesta.status,
            body: texto
        };
    }
}

// ==========================
// MAP SCAN
// (IMPORTANTE: estas rutas van ANTES de la comodin /api/lwatlas/*path,
// si no, Express nunca llega a ellas y las descargas usan el fetch generico
// en vez de la logica robusta con reintentos + tolerancia a 'aborted')
// ==========================

app.post("/api/lwatlas/map-scan/jobs", async (req, res) => {
    try {
        const response = await fetch(`${API_BASE}/map-scan/jobs`, {
            method: "POST",
            headers: {
                "X-Api-Key": API_KEY,
                "Content-Type": "application/json",
                "Idempotency-Key": req.headers["idempotency-key"] || crypto.randomUUID()
            },
            body: JSON.stringify(req.body)
        });

        const texto = await response.text();

        try {
            res.status(response.status).json(JSON.parse(texto));
        } catch {
            res.status(response.status).send(texto);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/lwatlas/map-scan/jobs/:jobId/download", (req, res) => {
    descargarConReintentos(
        `${API_BASE}/map-scan/jobs/${req.params.jobId}/download`,
        res,
        1
    );
});

const MAX_INTENTOS_DESCARGA = 5;

function descargarConReintentos(url, res, intento) {
    console.log(`Intento ${intento}/${MAX_INTENTOS_DESCARGA}`);

    descargarConHttps(url, 0, (error, cuerpo, status) => {
        if (!error) {
            const resultado = analizarNdjson(cuerpo);
            return res.status(status).send(resultado);
        }

        console.error(error.message);

        if (intento >= MAX_INTENTOS_DESCARGA) {
            return res.status(500).json({
                error: "La descarga fallo repetidamente",
                detalle: error.message
            });
        }

        setTimeout(() => {
            descargarConReintentos(url, res, intento + 1);
        }, 1500);
    });
}

function analizarNdjson(texto) {
    const filas = [];
    let corruptas = 0;

    texto.split("\n").filter(l => l.trim()).forEach(linea => {
        try {
            filas.push(JSON.parse(linea));
        } catch {
            corruptas++;
        }
    });

    console.log("");
    console.log("========== MAP SCAN ==========");
    console.log("Filas:", filas.length);
    console.log("Corruptas:", corruptas);

    const conteo = {};
    filas.forEach(f => {
        conteo[f.cfg_id] = (conteo[f.cfg_id] || 0) + 1;
    });

    console.log("");
    console.log("Tipos encontrados");
    console.table(conteo);

    const ahora = Date.now();
    const vigentes = filas.filter(f => f.act_end_time && f.act_end_time > ahora);

    console.log("");
    console.log("Vigentes:", vigentes.length);
    console.log("Expiradas:", filas.length - vigentes.length);
    console.log("==============================");

    return vigentes.map(f => JSON.stringify(f)).join("\n");
}

function descargarConHttps(url, redirects, callback) {
    https.get(
        url,
        {
            headers: { "X-Api-Key": API_KEY },
            timeout: 20000
        },
        response => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                if (redirects >= 5) {
                    return callback(new Error("Demasiadas redirecciones"));
                }
                response.resume();
                return descargarConHttps(response.headers.location, redirects + 1, callback);
            }

            const chunks = [];
            response.on("data", chunk => chunks.push(chunk));

            response.on("end", () => {
                callback(null, Buffer.concat(chunks).toString(), response.statusCode);
            });

            response.on("error", err => {
                if (err.message === "aborted") {
                    return callback(null, Buffer.concat(chunks).toString(), response.statusCode);
                }
                callback(err);
            });
        }
    )
    .on("timeout", function () {
        this.destroy();
        callback(new Error("Timeout"));
    })
    .on("error", callback);
}

// ==========================
// EXPLORAR API (generico)
// Va DESPUES de las rutas especificas de map-scan, para que estas
// tengan prioridad. Esta ruta comodin cubre todo lo demas:
// /alliances/search, /alliances/{id}/members, /players/search,
// /warzones, /services, etc.
// ==========================

app.get("/api/lwatlas", async (req, res) => {
    await explorar("", req, res);
});

app.get("/api/lwatlas/*path", async (req, res) => {
    const path = req.params.path.join("/");
    await explorar(path, req, res);
});

async function explorar(path, req, res) {
    const queryString = new URLSearchParams(req.query).toString();
    const url = `${API_BASE}/${path}` + (queryString ? `?${queryString}` : "");

    console.log("");
    console.log("GET");
    console.log(url);

    const MAX_INTENTOS = 3;

    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
        try {
            const resultado = await llamarAPI(url);
            return res.status(resultado.status).send(resultado.body);
        } catch (error) {
            console.error(`Intento ${intento}`, error.message);

            if (intento === MAX_INTENTOS) {
                return res.status(500).json({ error: error.message });
            }

            await esperar(intento * 500);
        }
    }
}

// =====================================
// HEALTH CHECK
// =====================================

app.get("/health", (req, res) => {
    res.json({
        status: "online",
        service: "Last War Guide Backend",
        version: "1.0.0",
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

// =====================================
// VERSION
// =====================================

app.get("/version", (req, res) => {
    res.json({
        app: "lastwar-guide-backend",
        version: "1.0.0",
        node: process.version
    });
});

// =====================================
// 404
// =====================================

app.use((req, res) => {
    res.status(404).json({
        error: "Endpoint no encontrado",
        path: req.originalUrl
    });
});

// =====================================
// ERROR GLOBAL
// =====================================

app.use((err, req, res, next) => {
    console.error("");
    console.error("========== ERROR ==========");
    console.error(err);
    console.error("===========================");
    res.status(500).json({
        error: "Internal Server Error",
        message: err.message
    });
});

app.listen(PORT, () => {
    console.clear();
    console.log("");
    console.log("==========================================");
    console.log("Last War Guide Backend");
    console.log("==========================================");
    console.log("");
    console.log(`Puerto       : ${PORT}`);
    console.log(`LWAtlas API  : ${API_BASE}`);
    console.log(`Health Check : http://localhost:${PORT}/health`);
    console.log("");
    console.log("==========================================");
});