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
        console.log(`🚀 Iniciando con corrección de formato para: ${rutemisor}`);
        browser = await puppeteer.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // 1. LOGIN
        await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { waitUntil: 'networkidle0' });
        await page.type('input[name*="rutcntr"]', rutautorizado, { delay: 100 });
        await page.type('input[type="password"]', password, { delay: 100 });
        await Promise.all([page.click('#bt_ingresar'), page.waitForNavigation({ waitUntil: 'networkidle0' })]);

        // 2. SALTO DIRECTO A LA TABLA DE EMISORES (Para evitar ser expulsado en los menús)
        console.log("🔗 Saltando directamente a la tabla de emisores autorizados...");
        await page.goto('https://loa.sii.cl/cgi_IMT/TMBEUS_ValidaAutorizacion.cgi?dummy=1461943151412', { 
            waitUntil: 'networkidle0' 
        });

        // 3. BÚSQUEDA INTELIGENTE DEL RUT (Prueba ambos formatos)
        console.log(`🎯 Buscando emisor: ${rutemisor}`);
        
        // Esperamos un poco a que cargue el contenido dinámico
        await new Promise(r => setTimeout(r, 5000));

        const rutSeleccionado = await page.evaluate((target) => {
            const links = Array.from(document.querySelectorAll('a'));
            
            // Función para limpiar RUTs (quitar puntos y guiones)
            const limpiar = (r) => r.replace(/[^0-9kK]/g, '').toLowerCase();
            const targetLimpio = limpiar(target);

            // Buscamos el link que coincida con el RUT limpio
            const match = links.find(a => limpiar(a.innerText) === targetLimpio);

            if (match) {
                match.click();
                return { success: true, text: match.innerText };
            }
            return { success: false, visto: links.map(l => l.innerText).filter(t => t.length > 5).slice(0, 5) };
        }, rutemisor);

        if (!rutSeleccionado.success) {
            const screenText = await page.evaluate(() => document.body.innerText.substring(0, 300));
            throw new Error(`RUT no hallado en tabla. Texto en pantalla: ${screenText.replace(/\n/g, ' ')}`);
        }

        console.log(`✅ RUT seleccionado correctamente: ${rutSeleccionado.text}`);
        
        // 4. ESPERA FINAL PARA CONFIRMAR ENTRADA AL FORMULARIO
        await new Promise(r => setTimeout(r, 6000));
        
        res.json({ 
            success: true, 
            msg: "Llegamos al formulario de emisión",
            url: page.url() 
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
