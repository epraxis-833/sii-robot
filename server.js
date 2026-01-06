const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');

// Activamos el plugin de sigilo para evitar ser detectados como robot
puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json({limit: '10mb'}));

app.post('/sii-navigate', async (req, res) => {
    const { rutautorizado, password, rutemisor } = req.body;
    let browser;
    
    try {
        console.log(`🚀 Iniciando navegación protegida para emisor: ${rutemisor}`);
        
        browser = await puppeteer.launch({ 
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage', 
                '--single-process',
                '--disable-blink-features=AutomationControlled'
            ]
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });
        
        // --- 1. LOGIN HUMANIZADO ---
        await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { 
            waitUntil: 'networkidle2' 
        });
        
        // Escribimos con retraso aleatorio entre teclas
        await page.type('input[name*="rutcntr"]', rutautorizado, { delay: 120 });
        await page.type('input[type="password"]', password, { delay: 150 });
        
        await Promise.all([
            page.click('#bt_ingresar'),
            page.waitForNavigation({ waitUntil: 'networkidle0' })
        ]);

        console.log("✅ Sesión iniciada. Esperando estabilización...");
        await new Promise(r => setTimeout(r, 4000)); // Pausa para asentar cookies

        // --- FUNCIÓN PARA HACER CLIC SIN SER DETECTADO ---
        const smartClick = async (text) => {
            console.log(`🖱️ Buscando: ${text}`);
            
            // Verificamos si nos botó al login antes de cada acción
            const isLoggedOut = await page.evaluate(() => 
                document.body.innerText.includes("Ingresar a Mi Sii")
            );
            if (isLoggedOut) throw new Error("Sesión cerrada por el SII.");

            const clicked = await page.evaluate((t) => {
                const elements = Array.from(document.querySelectorAll('a, button, h4, span, li'));
                const target = elements.find(el => el.innerText.replace(/\s+/g, ' ').trim().includes(t));
                if (target) {
                    target.scrollIntoView();
                    target.click();
                    return true;
                }
                return false;
            }, text);

            if (clicked) {
                await new Promise(r => setTimeout(r, 3000));
                return true;
            }
            return false;
        };

        // --- 2. FLUJO DE NAVEGACIÓN ORGÁNICA (Sin saltos de URL) ---
        await smartClick('Continuar'); // Opcional, si aparece el cartel de aviso
        
        await smartClick('Servicios online');
        await smartClick('Boletas de honorarios electrónicas');
        await smartClick('Emisor de boleta de honorarios');
        await smartClick('Emitir boleta de honorarios electrónica');
        
        // Paso clave de tu Imagen 2
        const finalStep = await smartClick('Por usuario autorizado con datos usados anteriormente');
        if (!finalStep) {
            console.log("⚠️ No se halló el link de usuario autorizado, intentando re-scaneo...");
        }

        // --- 3. SELECCIÓN DE RUT EN TABLA (Multi-Frame) ---
        const rutLimpio = rutemisor.replace(/\D/g, ''); // 196705686
        console.log(`🎯 Buscando RUT en la tabla: ${rutLimpio}`);
        
        await new Promise(r => setTimeout(r, 7000)); // La tabla del SII es lenta

        let rutSeleccionado = false;
        const frames = [page, ...page.frames()];

        for (const frame of frames) {
            rutSeleccionado = await frame.evaluate((target) => {
                const links = Array.from(document.querySelectorAll('table a, a'));
                const match = links.find(a => a.innerText.replace(/\D/g, '') === target);
                if (match) {
                    match.click();
                    return true;
                }
                return false;
            }, rutLimpio).catch(() => false);

            if (rutSeleccionado) break;
        }

        if (!rutSeleccionado) {
            throw new Error(`RUT ${rutemisor} no encontrado en la tabla de emisores.`);
        }

        // --- 4. RESPUESTA FINAL ---
        await new Promise(r => setTimeout(r, 5000));
        console.log("✅ Navegación completa. Robot en página de emisión.");
        
        res.json({ 
            success: true, 
            finalUrl: page.url() 
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
    console.log(`🤖 Servidor con Blindaje Stealth escuchando en puerto ${PORT}`);
});
