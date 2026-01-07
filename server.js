const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json());

app.post('/sii-navigate', async (req, res) => {
    const { rutautorizado, password, rutemisor } = req.body;
    let browser;
    
    // Formato exacto para la tabla: 19670568-6
    const rutParaTabla = rutemisor.includes('-') ? rutemisor : `${rutemisor.slice(0, -1)}-${rutemisor.slice(-1)}`;

    try {
        console.log(`🚀 Iniciando bypass geolocalizado para: ${rutParaTabla}`);
        
        browser = await puppeteer.launch({ 
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--lang=es-CL,es',
                '--window-size=1920,1080'
            ]
        });

        const page = await browser.newPage();
        
        // --- TRUCO 1: EMULACIÓN DE GEOLOCALIZACIÓN (Santiago, Chile) ---
        const context = browser.defaultBrowserContext();
        await context.overridePermissions('https://zeusr.sii.cl', ['geolocation']);
        await context.overridePermissions('https://loa.sii.cl', ['geolocation']);
        await page.setGeolocation({ latitude: -33.4489, longitude: -70.6693 });

        // --- TRUCO 2: TIMEOUTS EXTENDIDOS ---
        // Aumentamos a 90 segundos porque Railway y el SII a veces son lentos
        page.setDefaultNavigationTimeout(90000);
        page.setDefaultTimeout(90000);

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // 1. LOGIN
        console.log("🔑 Accediendo al SII...");
        await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { waitUntil: 'networkidle2' });
        
        await page.type('input[name*="rutcntr"]', rutautorizado, { delay: 120 });
        await page.type('input[type="password"]', password, { delay: 150 });
        
        await Promise.all([
            page.click('#bt_ingresar'),
            page.waitForNavigation({ waitUntil: 'networkidle0' })
        ]);

        console.log("✅ Sesión iniciada. Esperando 5s para estabilizar...");
        await new Promise(r => setTimeout(r, 5000));

        // 2. NAVEGACIÓN PASO A PASO (MÉTODO ORGÁNICO)
        const pasos = [
            'Servicios online',
            'Boletas de honorarios electrónicas',
            'Emisor de boleta de honorarios',
            'Emitir boleta de honorarios electrónica',
            'Por usuario autorizado con datos usados anteriormente'
        ];

        for (const paso of pasos) {
            // Verificar si nos botaron
            const contenido = await page.content();
            if (contenido.includes("Ingresar a Mi Sii")) {
                throw new Error(`El SII cerró la sesión en el paso: ${paso}`);
            }

            console.log(`🖱️ Buscando y clickeando: ${paso}`);
            
            // Scroll humano aleatorio
            await page.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 150)));

            const clickResult = await page.evaluate((t) => {
                const el = Array.from(document.querySelectorAll('a, h4, span, li'))
                                .find(e => e.innerText.trim().includes(t));
                if (el) {
                    el.scrollIntoView();
                    el.click();
                    return true;
                }
                return false;
            }, paso);

            if (!clickResult) console.log(`⚠️ No se pudo clickear "${paso}", intentando esperar...`);
            await new Promise(r => setTimeout(r, 4500));
        }

        // 3. SELECCIÓN FINAL EN TABLA
        console.log(`🎯 Buscando el RUT ${rutParaTabla} en la tabla de emisores...`);
        
        // Esperamos a que la tabla cargue
        await page.waitForSelector('table', { timeout: 30000 }).catch(() => console.log("La tabla tarda..."));

        const seleccionado = await page.evaluate((target) => {
            const links = Array.from(document.querySelectorAll('table a, a'));
            // Buscamos coincidencia exacta con el RUT formateado
            const match = links.find(a => a.innerText.trim() === target);
            if (match) {
                match.click();
                return true;
            }
            return false;
        }, rutParaTabla);

        if (!seleccionado) {
            throw new Error(`RUT ${rutParaTabla} no hallado. El SII podría haber bloqueado la carga de la tabla.`);
        }

        console.log("✅ ¡Acceso concedido! Entrando al formulario final...");
        await new Promise(r => setTimeout(r, 8000));

        res.json({ 
            success: true, 
            finalUrl: page.url(),
            message: "Robot llegó a la página de emisión" 
        });

        await browser.close();

    } catch (error) {
        if (browser) await browser.close();
        console.error(`❌ ERROR CRÍTICO: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🤖 Servidor ultra-sigilo escuchando en puerto ${PORT}`);
});
