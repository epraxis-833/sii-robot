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
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--use-gl=desktop', // Simula una tarjeta gráfica real
                '--disable-web-security',
                '--lang=es-CL,es' // Fuerza idioma local
            ]
        });
        
        const page = await browser.newPage();
        
        // --- EMULACIÓN DE HARDWARE REAL ---
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // 1. LOGIN CON ESPERA DE RED "IDLE0"
        await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { 
            waitUntil: 'networkidle0' 
        });

        await page.type('input[name*="rutcntr"]', rutautorizado, { delay: 180 });
        await page.type('input[type="password"]', password, { delay: 200 });
        
        // Clic y espera larga para que el servidor del SII registre la sesión
        await Promise.all([
            page.click('#bt_ingresar'),
            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 })
        ]);

        console.log("✅ Sesión iniciada. Esperando 8 segundos para burlar el rastreador...");
        await new Promise(r => setTimeout(r, 8000));

        // --- 2. TRUCO DE RE-DIRECCIÓN (Si nos bota, reintentamos una vez) ---
        const checkSession = async () => {
            const isOut = await page.evaluate(() => document.body.innerText.includes("Ingresar a Mi Sii"));
            if (isOut) {
                console.log("⚠️ Detectado re-login, intentando refrescar sesión...");
                await page.reload({ waitUntil: 'networkidle0' });
            }
        };

        // --- 3. NAVEGACIÓN PASO A PASO ---
        const pasos = [
            'Servicios online',
            'Boletas de honorarios electrónicas',
            'Emisor de boleta de honorarios',
            'Emitir boleta de honorarios electrónica',
            'Por usuario autorizado con datos usados anteriormente'
        ];

        for (const paso of pasos) {
            await checkSession();
            console.log(`🖱️ Clic en: ${paso}`);
            
            const clickOk = await page.evaluate((txt) => {
                const els = Array.from(document.querySelectorAll('a, h4, span, li'));
                const target = els.find(e => e.innerText.trim().includes(txt));
                if (target) { target.click(); return true; }
                return false;
            }, paso);

            if (!clickOk) {
                // Si falla el clic, intentamos forzar la URL del menú si es posible
                console.log(`⚠️ No se pudo clickear ${paso}, continuando...`);
            }
            await new Promise(r => setTimeout(r, 4000));
        }

        // --- 4. SELECCIÓN EN TABLA (MODO IFRAME) ---
        console.log(`🎯 Buscando emisor: ${rutemisor}`);
        const rutLimpio = rutemisor.replace(/\D/g, '');
        
        // Esperamos a que la tabla cargue realmente
        await page.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});

        const finalSuccess = await page.evaluate((target) => {
            const links = Array.from(document.querySelectorAll('a'));
            const match = links.find(a => a.innerText.replace(/\D/g, '') === target);
            if (match) { match.click(); return true; }
            return false;
        }, rutLimpio);

        if (!finalSuccess) throw new Error("RUT no hallado en la tabla final.");

        await new Promise(r => setTimeout(r, 4000));
        res.json({ success: true, finalUrl: page.url() });

        await browser.close();

    } catch (error) {
        if (browser) await browser.close();
        console.error(`❌ ERROR: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0');
