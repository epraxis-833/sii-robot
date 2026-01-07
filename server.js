const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');

// Configuración de sigilo para evadir detección de bots
puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json());

app.post('/sii-navigate', async (req, res) => {
    const { rutautorizado, password, rutemisor } = req.body;
    let browser;

    // 1. OBTENCIÓN DE DATOS DEL PROXY DESDE RAILWAY
    // Asegúrate de haber configurado estas variables en el panel de Railway
    const proxyServer = process.env.PROXY_SERVER; // Ejemplo: http://186.10.XX.XX:8080
    const proxyUser = process.env.PROXY_USER;
    const proxyPass = process.env.PROXY_PASS;

    // Formatear el RUT del emisor para la tabla (ej: 19670568-6)
    const rutConGuion = rutemisor.includes('-') ? rutemisor : `${rutemisor.slice(0, -1)}-${rutemisor.slice(-1)}`;

    try {
        console.log(`🚀 Iniciando navegación segura vía Proxy: ${proxyServer}`);
        console.log(`🎯 Emisor objetivo: ${rutConGuion}`);

        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                `--proxy-server=${proxyServer}`, // Configura el túnel hacia tu casa/oficina
                '--lang=es-CL,es',
                '--window-size=1920,1080'
            ]
        });

        const page = await browser.newPage();

        // 2. AUTENTICACIÓN EN CCProxy
        if (proxyUser && proxyPass) {
            await page.authenticate({
                username: proxyUser,
                password: proxyPass
            });
        }

        // Tiempos de espera extendidos para conexiones residenciales
        page.setDefaultNavigationTimeout(90000);
        page.setDefaultTimeout(90000);

        // 3. PRUEBA DE CONEXIÓN (Opcional: Verifica que el proxy funciona)
        await page.goto('https://ifconfig.me/ip', { waitUntil: 'networkidle2' });
        const ipDetectada = await page.evaluate(() => document.body.innerText.trim());
        console.log(`📍 IP detectada por el SII: ${ipDetectada}`);

        // 4. LOGIN EN EL SII
        console.log("🔑 Accediendo al portal de autenticación...");
        await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { 
            waitUntil: 'networkidle2' 
        });

        await page.type('input[name*="rutcntr"]', rutautorizado, { delay: 120 });
        await page.type('input[type="password"]', password, { delay: 150 });

        await Promise.all([
            page.click('#bt_ingresar'),
            page.waitForNavigation({ waitUntil: 'networkidle0' })
        ]);

        console.log("✅ Sesión iniciada exitosamente.");
        await new Promise(r => setTimeout(r, 5000));

        // 5. NAVEGACIÓN HACIA LA TABLA DE EMISORES
        const pasosMenu = [
            'Servicios online',
            'Boletas de honorarios electrónicas',
            'Emisor de boleta de honorarios',
            'Emitir boleta de honorarios electrónica',
            'Por usuario autorizado con datos usados anteriormente'
        ];

        for (const paso of pasosMenu) {
            // Verificar si la sesión sigue activa antes de cada clic
            const isOut = await page.evaluate(() => document.body.innerText.includes("Ingresar a Mi Sii"));
            if (isOut) throw new Error(`Sesión cerrada por el SII en el paso: ${paso}`);

            console.log(`🖱️ Navegando a: ${paso}`);
            
            await page.evaluate((texto) => {
                const elementos = Array.from(document.querySelectorAll('a, h4, span, li'));
                const objetivo = elementos.find(el => el.innerText.trim().includes(texto));
                if (objetivo) {
                    objetivo.scrollIntoView();
                    objetivo.click();
                }
            }, paso);

            await new Promise(r => setTimeout(r, 4500));
        }

        // 6. SELECCIÓN DEL RUT EN LA TABLA FINAL
        console.log(`🔍 Buscando RUT exacto: ${rutConGuion}`);
        
        await page.waitForSelector('table', { timeout: 30000 });

        const clicExitoso = await page.evaluate((targetRut) => {
            const links = Array.from(document.querySelectorAll('table a, a'));
            const match = links.find(a => a.innerText.trim() === targetRut);
            if (match) {
                match.click();
                return true;
            }
            return false;
        }, rutConGuion);

        if (!clicExitoso) {
            throw new Error(`No se encontró el RUT ${rutConGuion} en la tabla de emisores autorizados.`);
        }

        console.log("✅ Selección de emisor completada. Formulario cargado.");
        await new Promise(r => setTimeout(r, 6000));

        res.json({
            success: true,
            message: "Robot posicionado en el formulario de emisión",
            currentUrl: page.url()
        });

        await browser.close();

    } catch (error) {
        if (browser) await browser.close();
        console.error(`❌ ERROR DEL ROBOT: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            tip: "Asegúrate de que CCProxy y tu PC en Chile estén encendidos."
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🤖 Servidor con Proxy Residencial escuchando en puerto ${PORT}`);
});
