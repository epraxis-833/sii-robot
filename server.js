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
    
    try {
        console.log(`🚀 Iniciando bypass avanzado para: ${rutemisor}`);
        browser = await puppeteer.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // 1. LOGIN
        await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { waitUntil: 'networkidle0' });
        await page.type('input[name*="rutcntr"]', rutautorizado, { delay: 100 });
        await page.type('input[type="password"]', password, { delay: 100 });
        await Promise.all([page.click('#bt_ingresar'), page.waitForNavigation({ waitUntil: 'networkidle0' })]);

        console.log("✅ Sesión iniciada. Navegando al menú...");
        await new Promise(r => setTimeout(r, 5000));

        // 2. NAVEGACIÓN PASO A PASO (Basado en lo que ya funcionó en tu log)
        const pasos = [
            'Servicios online',
            'Boletas de honorarios electrónicas',
            'Emisor de boleta de honorarios',
            'Emitir boleta de honorarios electrónica',
            'Por usuario autorizado con datos usados anteriormente'
        ];

        for (const paso of pasos) {
            await page.evaluate((t) => {
                const el = Array.from(document.querySelectorAll('a, h4, span')).find(e => e.innerText.includes(t));
                if (el) el.click();
            }, paso);
            await new Promise(r => setTimeout(r, 3000));
        }

        // 3. BUSQUEDA AGRESIVA DEL RUT (EL PUNTO DE FALLA)
        console.log(`🎯 Buscando emisor: ${rutemisor}`);
        const rutLimpio = rutemisor.replace(/\D/g, ''); // Ejemplo: 196705686

        // Esperamos a que cualquier tabla aparezca en la página
        await page.waitForSelector('table', { timeout: 10000 }).catch(() => console.log("⏳ La tabla tarda en cargar..."));

        const rutEncontrado = await page.evaluate((target) => {
            // Buscamos todos los enlaces que contengan números
            const links = Array.from(document.querySelectorAll('a'));
            const match = links.find(a => {
                const textoLink = a.innerText.replace(/\D/g, '');
                return textoLink === target || textoLink.includes(target);
            });

            if (match) {
                match.click();
                return true;
            }
            return false;
        }, rutLimpio);

        if (!rutEncontrado) {
            // Si no se encontró, tomamos una captura para saber qué está viendo el robot (útil para debug)
            const debugText = await page.evaluate(() => document.body.innerText.substring(0, 500));
            throw new Error(`RUT no hallado. Texto inicial de página: ${debugText}`);
        }

        // 4. FINALIZACIÓN
        await new Promise(r => setTimeout(r, 5000));
        console.log(`✅ ¡ÉXITO! URL actual: ${page.url()}`);
        
        res.json({ success: true, url: page.url() });
        await browser.close();

    } catch (error) {
        if (browser) await browser.close();
        console.error(`❌ ERROR: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0');
