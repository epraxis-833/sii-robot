const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();

// Configuración de Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.post('/sii-navigate', async (req, res) => {
    // Extraer datos enviados desde Laravel
    const { url, rutautorizado, password, rutemisor } = req.body;

    // Validación básica de entrada
    if (!rutautorizado || !password || !rutemisor) {
        return res.status(400).json({
            success: false,
            error: "Faltan parámetros: rutautorizado, password y rutemisor son obligatorios."
        });
    }

    let browser;
    try {
        console.log(`Iniciando navegación para RUT: ${rutautorizado}`);

        // Lanzar navegador con flags optimizados para contenedores (Railway/Heroku)
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process'
            ]
        });

        const page = await browser.newPage();

        // Configurar un User Agent real para evitar ser bloqueado como bot
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // 1. Ir a la página de Login
        const loginUrl = url || 'https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html';
        await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // 2. Proceso de Login
        await page.waitForSelector('input[name*="rutcntr"]', { timeout: 10000 });
        await page.type('input[name*="rutcntr"]', rutautorizado);
        await page.type('input[type="password"]', password);

        // Click en ingresar y esperar que cargue la siguiente página
        await Promise.all([
            page.click('button[type="submit"], input[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);

        // Función auxiliar interna para hacer click en enlaces por su texto (insensible a mayúsculas)
        const clickPorTexto = async (texto) => {
            const xpath = `//a[contains(translate(., "ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÑ", "abcdefghijklmnopqrstuvwxyzáéíóúñ"), "${texto.toLowerCase()}")]`;
            await page.waitForXPath(xpath, { visible: true, timeout: 15000 });
            const [elemento] = await page.$x(xpath);
            if (elemento) {
                await Promise.all([
                    elemento.click(),
                    page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
                ]);
                console.log(`Click exitoso en: ${texto}`);
            } else {
                throw new Error(`No se encontró el enlace con texto: ${texto}`);
            }
        };

        // 3. Secuencia de navegación por el menú del SII
        // Usamos textos exactos que aparecen en la web del SII
        await clickPorTexto("Continuar"); // En caso de que aparezca pantalla intermedia
        await clickPorTexto("Servicios online");
        await clickPorTexto("Boletas de honorarios electrónicas");
        await clickPorTexto("Emisor de boleta de honorarios");
        await clickPorTexto("Emitir boleta de honorarios electrónica");
        await clickPorTexto("Por usuario autorizado con datos usados anteriormente");

        // 4. Seleccionar el RUT del emisor
        // Este es el paso donde se elige a nombre de quién se emite
        await clickPorTexto(rutemisor);

        // Capturar la URL final donde queda el formulario de la boleta
        const finalUrl = page.url();

        await browser.close();

        // Respuesta exitosa
        return res.json({
            success: true,
            finalUrl: finalUrl,
            message: "Navegación completada hasta el formulario de boleta."
        });

    } catch (error) {
        console.error("ERROR EN EL ROBOT:", error.message);
        if (browser) await browser.close();

        // Siempre responder JSON aunque falle
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Railway asigna el puerto dinámicamente
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Robot SII ejecutándose en puerto ${PORT}`);
});
