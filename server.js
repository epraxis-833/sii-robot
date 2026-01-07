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
        console.log(`🚀 Iniciando proceso para Emisor: ${rutemisor}`);
        browser = await puppeteer.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // --- FUNCIÓN PARA VERIFICAR SI LA SESIÓN SIGUE VIVA ---
        const checkSession = async (paso) => {
            const text = await page.evaluate(() => document.body.innerText);
            if (text.includes("Ingresar a Mi Sii") || text.includes("Clave Tributaria")) {
                throw new Error(`SESIÓN CERRADA por el SII en el paso: [${paso}]`);
            }
        };

        // 1. LOGIN
        await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { waitUntil: 'networkidle0' });
        await page.type('input[name*="rutcntr"]', rutautorizado, { delay: 100 });
        await page.type('input[type="password"]', password, { delay: 100 });
        await Promise.all([page.click('#bt_ingresar'), page.waitForNavigation({ waitUntil: 'networkidle0' })]);
        
        console.log("✅ Sesión iniciada.");
        await new Promise(r => setTimeout(r, 4000));

        // 2. NAVEGACIÓN MANUAL (Para evitar el Error 404 del salto directo)
        const pasos = [
            'Servicios online',
            'Boletas de honorarios electrónicas',
            'Emisor de boleta de honorarios',
            'Emitir boleta de honorarios electrónica',
            'Por usuario autorizado con datos usados anteriormente'
        ];

        for (const paso of pasos) {
            await checkSession(paso); // Verificar antes de cada clic
            console.log(`🖱️ Haciendo clic en: ${paso}`);
            
            const clickOk = await page.evaluate((t) => {
                const el = Array.from(document.querySelectorAll('a, h4, span, li'))
                                .find(e => e.innerText.trim().includes(t));
                if (el) { el.click(); return true; }
                return false;
            }, paso);

            if (!clickOk) console.log(`⚠️ Advertencia: No se encontró "${paso}", intentando seguir...`);
            await new Promise(r => setTimeout(r, 3500));
        }

        // 3. BÚSQUEDA DEL RUT CON FORMATO CORRECTO (19670568-6)
        // Generamos las 3 variantes posibles que el SII podría mostrar
        const rutConGuion = rutemisor.includes('-') ? rutemisor : `${rutemisor.slice(0, -1)}-${rutemisor.slice(-1)}`;
        const rutLimpio = rutemisor.replace(/\D/g, '');
        
        console.log(`🎯 Buscando en tabla formatos: "${rutConGuion}" o "${rutLimpio}"`);
        await checkSession("Tabla Final");

        const encontrado = await page.evaluate((conGuion, limpio) => {
            const links = Array.from(document.querySelectorAll('table a, a'));
            
            // Buscamos coincidencia exacta con guion o limpia
            const match = links.find(a => {
                const txt = a.innerText.trim();
                return txt === conGuion || txt.replace(/\D/g, '') === limpio;
            });

            if (match) {
                match.click();
                return true;
            }
            return false;
        }, rutConGuion, rutLimpio);

        if (!encontrado) {
            const htmlSnapshot = await page.evaluate(() => document.body.innerText.substring(0, 500));
            throw new Error(`RUT no encontrado. El robot ve esto: ${htmlSnapshot}`);
        }

        console.log("✅ RUT seleccionado con éxito.");
        await new Promise(r => setTimeout(r, 5000));

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
