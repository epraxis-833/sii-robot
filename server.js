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
    
    // Formateamos el RUT para que coincida con la tabla del SII (19670568-6)
    const rutParaTabla = rutemisor.includes('-') ? rutemisor : `${rutemisor.slice(0, -1)}-${rutemisor.slice(-1)}`;
    
    try {
        console.log(`🚀 Iniciando proceso para Emisor: ${rutParaTabla}`);
        browser = await puppeteer.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=es-CL,es']
        });
        
        const page = await browser.newPage();
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-CL,es;q=0.9' });

        // --- FUNCIÓN DE LOGIN REUTILIZABLE ---
        const realizarLogin = async () => {
            console.log("🔑 Intentando autenticación...");
            await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { waitUntil: 'networkidle0' });
            await page.type('input[name*="rutcntr"]', rutautorizado, { delay: 100 });
            await page.type('input[type="password"]', password, { delay: 100 });
            await Promise.all([
                page.click('#bt_ingresar'),
                page.waitForNavigation({ waitUntil: 'networkidle0' })
            ]);
        };

        await realizarLogin();

        // --- NAVEGACIÓN CON RE-INTENTO SI SE PIERDE LA SESIÓN ---
        const pasos = [
            'Servicios online',
            'Boletas de honorarios electrónicas',
            'Emisor de boleta de honorarios',
            'Emitir boleta de honorarios electrónica',
            'Por usuario autorizado con datos usados anteriormente'
        ];

        for (const paso of pasos) {
            console.log(`🖱️ Buscando: ${paso}`);
            
            // Si detectamos que nos sacó al login, re-identificamos
            const estaAfuera = await page.evaluate(() => document.body.innerText.includes("Ingresar a Mi Sii"));
            if (estaAfuera) {
                console.log("⚠️ Sesión perdida detectada. Re-intentando login único...");
                await realizarLogin();
                await new Promise(r => setTimeout(r, 3000));
            }

            const clickExitoso = await page.evaluate((t) => {
                const el = Array.from(document.querySelectorAll('a, h4, span, li'))
                                .find(e => e.innerText.trim().includes(t));
                if (el) { el.click(); return true; }
                return false;
            }, paso);

            if (!clickExitoso) {
                console.log(`❌ No se encontró el enlace: ${paso}`);
            }
            await new Promise(r => setTimeout(r, 4000));
        }

        // --- BÚSQUEDA EN LA TABLA FINAL ---
        console.log(`🎯 Buscando RUT exacto en tabla: ${rutParaTabla}`);
        
        const encontrado = await page.evaluate((target) => {
            const links = Array.from(document.querySelectorAll('table a, a'));
            // Buscamos coincidencia exacta con lo que el usuario ve en pantalla
            const match = links.find(a => a.innerText.trim() === target);
            if (match) {
                match.click();
                return true;
            }
            return false;
        }, rutParaTabla);

        if (!encontrado) {
            throw new Error(`El emisor ${rutParaTabla} no aparece en la tabla de autorizados.`);
        }

        await new Promise(r => setTimeout(r, 5000));
        console.log("✅ Navegación completada con éxito.");
        
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
