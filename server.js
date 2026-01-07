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
    
    // El RUT que buscamos en la tabla según tu imagen image_8720ed.png
    const rutBuscado = rutemisor.includes('-') ? rutemisor : `${rutemisor.slice(0, -1)}-${rutemisor.slice(-1)}`;
    
    try {
        console.log(`🚀 Iniciando bypass de alta persistencia para: ${rutBuscado}`);
        browser = await puppeteer.launch({ 
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1366,768'
            ]
        });
        
        const page = await browser.newPage();
        // Definir un timeout global más largo para Railway
        page.setDefaultNavigationTimeout(60000); 

        // 1. LOGIN
        await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { waitUntil: 'networkidle2' });
        await page.type('input[name*="rutcntr"]', rutautorizado, { delay: 150 });
        await page.type('input[type="password"]', password, { delay: 150 });
        await Promise.all([
            page.click('#bt_ingresar'),
            page.waitForNavigation({ waitUntil: 'networkidle0' })
        ]);

        console.log("✅ Sesión activa. Iniciando simulación humana...");

        // 2. NAVEGACIÓN PASO A PASO CON MOVIMIENTO
        const pasos = [
            'Servicios online',
            'Boletas de honorarios electrónicas',
            'Emisor de boleta de honorarios',
            'Emitir boleta de honorarios electrónica',
            'Por usuario autorizado con datos usados anteriormente'
        ];

        for (const paso of pasos) {
            // Verificación de expulsión
            const isLoggedOut = await page.evaluate(() => document.body.innerText.includes("Ingresar a Mi Sii"));
            if (isLoggedOut) throw new Error("SII cerró sesión preventivamente.");

            console.log(`🖱️ Intentando entrar a: ${paso}`);
            
            // Simular un scroll antes de hacer clic
            await page.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 200)));
            
            await page.evaluate((txt) => {
                const elements = Array.from(document.querySelectorAll('a, h4, span, li'));
                const target = elements.find(el => el.innerText.trim().includes(txt));
                if (target) {
                    target.scrollIntoView();
                    target.click();
                }
            }, paso);

            await new Promise(r => setTimeout(r, 5000)); // Pausa orgánica
        }

        // 3. BUSQUEDA FINAL EN TABLA (Basado en image_8720ed.png)
        console.log(`🎯 Buscando RUT ${rutBuscado} en la tabla final...`);
        
        // Esperamos a que la tabla exista realmente en el DOM
        await page.waitForSelector('table', { timeout: 20000 });

        const encontrado = await page.evaluate((targetRut) => {
            const links = Array.from(document.querySelectorAll('a'));
            // Buscamos un link que tenga el RUT con guion
            const match = links.find(a => a.innerText.includes(targetRut));
            if (match) {
                match.scrollIntoView();
                match.click();
                return true;
            }
            return false;
        }, rutBuscado);

        if (!encontrado) {
            // Si no lo halla, intentamos por "limpieza de RUT" como plan B
            const planB = await page.evaluate((targetLimpio) => {
                const links = Array.from(document.querySelectorAll('a'));
                const match = links.find(a => a.innerText.replace(/\D/g, '') === targetLimpio.replace(/\D/g, ''));
                if (match) { match.click(); return true; }
                return false;
            }, rutBuscado);
            
            if (!planB) throw new Error(`RUT ${rutBuscado} no visible en la tabla de autorizados.`);
        }

        console.log("✅ ¡Hicimos clic en el emisor! Esperando carga de formulario...");
        await new Promise(r => setTimeout(r, 7000));

        res.json({ 
            success: true, 
            status: "En formulario de emisión",
            currentUrl: page.url() 
        });

        await browser.close();

    } catch (error) {
        if (browser) await browser.close();
        console.error(`❌ ERROR: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0');
